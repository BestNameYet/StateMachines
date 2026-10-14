'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ACTIONS = new Set(['navigate','wait_for','click','type','press_key','assert_text','read_text','read_attribute','screenshot']);
function httpUrl(value) {
  if (typeof value !== 'string') throw new Error('URL must be a string');
  const url = new URL(value);
  if (!['http:','https:'].includes(url.protocol)) throw new Error('URL must use HTTP or HTTPS');
  return value;
}
function validateRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Request must be an object');
  httpUrl(value.url);
  const timeout = value.timeout_ms ?? 10000;
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120000) throw new Error('timeout_ms must be an integer from 100 to 120000');
  if (!Array.isArray(value.steps) || value.steps.length > 100) throw new Error('steps must be an array of at most 100 actions');
  const steps = value.steps.map((step, index) => {
    if (!step || !ACTIONS.has(step.action)) throw new Error(`Unknown action at step ${index+1}`);
    if (step.action === 'navigate') httpUrl(step.url);
    else if (step.action !== 'screenshot' && (typeof step.selector !== 'string' || !step.selector.trim())) throw new Error(`Missing CSS selector at step ${index+1}`);
    if (['type','assert_text'].includes(step.action) && typeof step.text !== 'string') throw new Error(`Missing text at step ${index+1}`);
    if (step.clear !== undefined && typeof step.clear !== 'boolean') throw new Error('clear must be boolean');
    if (step.contains !== undefined && typeof step.contains !== 'boolean') throw new Error('contains must be boolean');
    if (step.action === 'press_key' && (typeof step.key !== 'string' || !/^[A-Z_]+$/.test(step.key))) throw new Error('key must be a Selenium key name');
    if (step.action === 'read_attribute' && (typeof step.attribute !== 'string' || !step.attribute)) throw new Error('attribute is required');
    if (step.action === 'screenshot' && step.name !== undefined && (typeof step.name !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(step.name))) throw new Error('Invalid screenshot name');
    return {...step};
  });
  return {...value, timeout_ms: timeout, steps};
}
function loadRequest(env = process.env, read = file => fs.readFileSync(file,'utf8')) {
  if (env.REQUEST_JSON?.trim()) return validateRequest(JSON.parse(env.REQUEST_JSON));
  const event = env.GITHUB_EVENT_PATH ? JSON.parse(read(env.GITHUB_EVENT_PATH)) : {};
  if (env.GITHUB_EVENT_NAME === 'repository_dispatch') {
    if (!event.client_payload?.request) throw new Error('repository_dispatch requires client_payload.request');
    return validateRequest(event.client_payload.request);
  }
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch' && event.inputs?.request_json?.trim()) return validateRequest(JSON.parse(event.inputs.request_json));
  return validateRequest(JSON.parse(read(path.join(__dirname,'request.json'))));
}
async function element(driver, selector, api, timeout, enabled = false) {
  const found = await driver.wait(api.until.elementLocated(api.By.css(selector)), timeout);
  await driver.wait(api.until.elementIsVisible(found), timeout);
  if (enabled) await driver.wait(api.until.elementIsEnabled(found), timeout);
  return found;
}
async function executeSteps(driver, request, api, out, report) {
  await driver.get(request.url);
  for (const [index, step] of request.steps.entries()) {
    const item = {index:index+1, action:step.action, selector:step.selector ?? null, status:'RUNNING', started_at:new Date().toISOString()};
    report.steps.push(item);
    try {
      let result = null;
      if (step.action === 'navigate') await driver.get(step.url);
      else if (step.action === 'screenshot') {
        result = `${String(index+1).padStart(3,'0')}-${step.name ?? 'screenshot'}.png`;
        fs.writeFileSync(path.join(out,result),await driver.takeScreenshot(),'base64');
      } else {
        const control = await element(driver,step.selector,api,request.timeout_ms,['click','type','press_key'].includes(step.action));
        if (step.action === 'click') await control.click();
        if (step.action === 'type') {if (step.clear !== false) await control.clear();await control.sendKeys(step.text);}
        if (step.action === 'press_key') {if (!Object.hasOwn(api.Key,step.key)) throw new Error(`Unsupported key ${step.key}`);await control.sendKeys(api.Key[step.key]);}
        if (step.action === 'assert_text') {
          await driver.wait(async()=>{const actual=await control.getText();return step.contains ? actual.includes(step.text) : actual === step.text;},request.timeout_ms,`Text assertion failed for ${step.selector}`);
          result = await control.getText();
        }
        if (step.action === 'read_text') result = await control.getText();
        if (step.action === 'read_attribute') result = await control.getAttribute(step.attribute);
      }
      item.status='PASS';item.result=result;
    } catch (error) {item.status='FAIL';item.error=error.message;throw error;}
    finally {item.finished_at=new Date().toISOString();}
  }
}
async function main() {
  const out=path.resolve(process.env.SELENIUM_OUTPUT_DIR || 'selenium-results');fs.mkdirSync(out,{recursive:true});
  const report={status:'RUNNING',started_at:new Date().toISOString(),event:process.env.GITHUB_EVENT_NAME || 'local',steps:[]};
  let driver;
  try {
    const request=loadRequest();
    report.request={url:request.url,timeout_ms:request.timeout_ms,step_count:request.steps.length};
    const api=require('selenium-webdriver');
    const chrome=require('selenium-webdriver/chrome');
    const prefs=new api.logging.Preferences();prefs.setLevel(api.logging.Type.BROWSER,api.logging.Level.ALL);
    const options=new chrome.Options().addArguments('--window-size=1280,900').setLoggingPrefs(prefs);
    driver=await new api.Builder().forBrowser(api.Browser.CHROME).usingServer(process.env.SELENIUM_REMOTE_URL || 'http://127.0.0.1:4444').setChromeOptions(options).build();
    report.session_id=(await driver.getSession()).getId();
    const caps=await driver.getCapabilities();report.browser={name:caps.get('browserName'),version:caps.get('browserVersion'),platform:caps.get('platformName')};
    await driver.manage().setTimeouts({implicit:0,pageLoad:30000,script:request.timeout_ms});
    await executeSteps(driver,request,api,out,report);
    report.status='PASS';
  } catch (error) {report.status='FAIL';report.error={name:error.name,message:error.message};process.exitCode=1;}
  finally {
    if (driver) {
      for (const [filename, capture, encoding] of [
        ['final.png',()=>driver.takeScreenshot(),'base64'],
        ['final.html',()=>driver.getPageSource(),'utf8'],
        ['browser.log.json',async()=>JSON.stringify(await driver.manage().logs().get('browser'),null,2),'utf8']
      ]) {
        try {fs.writeFileSync(path.join(out,filename),await capture(),encoding);}
        catch (error) {(report.capture_errors ??=[]).push({file:filename,message:error.message});}
      }
      try {await driver.quit();} catch (error) {report.quit_error=error.message;}
    }
    report.finished_at=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));
    const summary=`## Selenium test: ${report.status}\n\nSteps completed: ${report.steps.filter(s=>s.status==='PASS').length}/${report.steps.length}\n\nSee the selenium-results artifact for screenshots and details.\n`;
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
    console.log(JSON.stringify(report,null,2));
  }
}
module.exports={httpUrl,validateRequest,loadRequest,executeSteps};
if (require.main===module) main().catch(error=>{console.error(error);process.exitCode=1;});
