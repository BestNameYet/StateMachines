'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const seleniumRequire=createRequire(path.join(__dirname,'../SeleniumServer/package.json'));
const {Builder,Browser,By,Key,logging}=seleniumRequire('selenium-webdriver');
const chrome=seleniumRequire('selenium-webdriver/chrome');
const {FileDetector}=seleniumRequire('selenium-webdriver/remote');
const out=path.resolve(process.env.SELENIUM_OUTPUT_DIR||'selenium-results');fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
const html=fs.readFileSync(path.join(__dirname,'listen_and_label.html'),'utf8');
const source=JSON.parse(html.match(/<script id="clipData" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const url='http://127.0.0.1:8080/ChatMachines/AudioClipSelector/listen_and_label.html';
const report={status:'RUNNING',started_at:new Date().toISOString(),stages:[],clicks:[],timing:null,limitations:['The 81-clip sweep advances a test clock; native media time remains real.','The separate wall-clock test verifies one actual 15-second listening window and its two-second buffer.']};
let driver;
const js=(script,...args)=>driver.executeScript(script,...args);
async function waitFor(script,timeout=15000){return driver.wait(()=>js(script),timeout,'Browser condition did not become true: '+script,80);}
async function click(id){await driver.findElement(By.id(id)).click();}
const state=()=>js(`return {index:current,id:clips[current].id,name:document.getElementById('filename').textContent,phase,running,remaining,deadline,labels:{...labels},stored:JSON.parse(localStorage.getItem(storageKey)||'{}'),paused:document.getElementById('audio').paused,ended:document.getElementById('audio').ended,time:document.getElementById('audio').currentTime,done:document.getElementById('doneCount').textContent};`);
async function advance(ms){await js('window.__testClock.now+=arguments[0];tick();',ms);}
async function finishListening(){await js('window.__testClock.now=deadline+1;tick();');}
async function finishBuffer(){await advance(1999);assert.equal((await state()).phase,'buffer');await advance(2);}
async function frozenPage(clear=false){await driver.get(url);await waitFor('return typeof clips!=="undefined" && clips.length===81;');if(clear){await js('localStorage.removeItem(storageKey);');await driver.navigate().refresh();await waitFor('return typeof clips!=="undefined" && clips.length===81;');}
await js(`window.__testClock={now:performance.now()};Object.defineProperty(performance,'now',{configurable:true,value:()=>window.__testClock.now});
window.__labelEvents=[];document.addEventListener('click',event=>{if(!['mainButton','otherButton'].includes(event.target.id))return;window.__labelEvents.push({button:event.target.id,trusted:event.isTrusted,index:current,id:clips[current].id,name:document.getElementById('filename').textContent,sourceMatches:document.getElementById('audio').currentSrc===clips[current].audio,phase,time:document.getElementById('audio').currentTime,paused:document.getElementById('audio').paused});},true);
window.__exportBlobs=[];const original=URL.createObjectURL.bind(URL);URL.createObjectURL=function(blob){window.__exportBlobs.push(blob);return original(blob);};`);}
async function mediaPlaying(index){await waitFor(`return current===${index} && running && deadline>0 && !document.getElementById('audio').paused && document.getElementById('audio').currentTime>0.04 && document.getElementById('audio').currentSrc===clips[current].audio;`);}
async function blobText(index){return driver.executeAsyncScript('const done=arguments[arguments.length-1];window.__exportBlobs[arguments[0]].text().then(done).catch(e=>done({error:e.message}));',index);}
function csv(text){text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}return rows;}
async function stage(name,fn){const item={name,status:'RUNNING',started_at:new Date().toISOString()};report.stages.push(item);try{item.details=await fn();item.status='PASS';}catch(error){item.status='FAIL';item.error={name:error.name,message:error.message,stack:error.stack};throw error;}finally{item.finished_at=new Date().toISOString();fs.writeFileSync(path.join(out,'audio-selector-report.json'),JSON.stringify(report,null,2));}}
async function main(){
try{
const prefs=new logging.Preferences();prefs.setLevel(logging.Type.BROWSER,logging.Level.ALL);
driver=await new Builder().forBrowser(Browser.CHROME).usingServer(process.env.SELENIUM_REMOTE_URL||'http://127.0.0.1:4444').setChromeOptions(new chrome.Options().addArguments('--window-size=1280,1000').setLoggingPrefs(prefs)).build();
driver.setFileDetector(new FileDetector());await driver.manage().setTimeouts({implicit:0,pageLoad:60000,script:15000});
report.session_id=(await driver.getSession()).getId();const caps=await driver.getCapabilities();report.browser={name:caps.get('browserName'),version:caps.get('browserVersion')};
let expected={},backup;
await stage('Source integrity: 81 unique clips and independent audio hashes',async()=>{
assert.equal(source.clips.length,81);assert.equal(source.id,manifest.dataset_id);assert.equal(new Set(source.clips.map(c=>c.id)).size,81);
assert.equal(crypto.createHash('sha256').update(html).digest('hex'),manifest.source_sha256);
source.clips.forEach((c,i)=>{const m=manifest.clips[i];assert.equal(c.id,m.id);assert.equal(c.name,m.name);assert(c.length>0&&c.length<=15);assert.equal(crypto.createHash('sha256').update(Buffer.from(c.audio.split(',')[1],'base64')).digest('hex'),m.audio_sha256);});return {clips:81,hashes_checked:81};});
await stage('81 trusted label clicks, correct source/filename/storage, and all transitions',async()=>{
await frozenPage(true);assert.equal((await state()).index,0);await click('queueButton');
for(let i=0;i<81;i++){
await mediaPlaying(i);const before=await state();const clip=source.clips[i];assert.equal(before.id,clip.id);assert.equal(before.name,clip.name);
const sourceMatches=await js("return document.getElementById('audio').currentSrc===arguments[0];",clip.audio);assert(sourceMatches);
const label=i%2===0?'main':'other',button=label==='main'?'mainButton':'otherButton';await click(button);expected[clip.id]=label;
const after=await state();assert.equal(after.index,i);assert.equal(after.id,clip.id);assert.deepEqual(after.labels,expected);assert.deepEqual(after.stored,expected);assert.equal(after.done,`${i+1} / 81 labeled`);
const event=await js('return window.__labelEvents[window.__labelEvents.length-1];');assert.equal(event.id,clip.id);assert.equal(event.index,i);assert.equal(event.name,clip.name);assert.equal(event.trusted,true);assert.equal(event.sourceMatches,true);assert.equal(event.phase,'listen');
report.clicks.push({number:i+1,file:clip.name,label,captured_file:event.id,source_matches:event.sourceMatches,native_event_trusted:event.trusted,media_time:event.time,storage_matches:true});
await finishListening();let buffer=await state();assert.equal(buffer.index,i);assert.equal(buffer.phase,'buffer');assert.equal(buffer.paused,true);assert.equal(buffer.remaining,2000);
await finishBuffer();
if(i<80){await waitFor(`return current===${i+1} && deadline>0;`);}else{const end=await state();assert.equal(end.index,80);assert.equal(end.running,false);assert.equal(end.done,'81 / 81 labeled');}
console.log(JSON.stringify({test:'clip-label-assignment',clip:i+1,file:clip.name,status:'PASS'}));
}
assert.equal(report.clicks.length,81);assert.equal(await js('return window.__labelEvents.length;'),81);
fs.writeFileSync(path.join(out,'81-clips-labeled.png'),await driver.takeScreenshot(),'base64');return {native_clicks:81,main:41,other:40,all_sources_played:true,clock:'controlled',transitions:81};});
await stage('Browser CSV/JSON exports, refresh persistence, search, and filters',async()=>{
await click('exportCsv');const csvText=await blobText(0),rows=csv(csvText);assert.equal(rows.length,82);
rows.slice(1).forEach((row,i)=>{assert.equal(row[0],source.clips[i].name);assert.equal(row[1],i%2===0?'Main speaker':'Other');});fs.writeFileSync(path.join(out,'exported-labels.csv'),csvText);
await click('exportJson');const jsonText=await blobText(1);backup=JSON.parse(jsonText);assert.equal(backup.dataset_id,source.id);assert.deepEqual(backup.labels,expected);fs.writeFileSync(path.join(out,'exported-backup.json'),jsonText);
await driver.navigate().refresh();await waitFor('return typeof labels!=="undefined" && Object.keys(labels).length===81;');assert.deepEqual((await state()).labels,expected);
const filter=await driver.findElement(By.id('filter'));await filter.sendKeys('Main speaker',Key.ENTER);await waitFor("return document.getElementById('clipList').children.length===41;");await filter.sendKeys('Other',Key.ENTER);await waitFor("return document.getElementById('clipList').children.length===40;");await filter.sendKeys('All clips',Key.ENTER);await waitFor("return document.getElementById('clipList').children.length===81;");
const search=await driver.findElement(By.id('search'));await search.sendKeys(source.clips[7].name);await waitFor("return document.getElementById('clipList').children.length===1;");await search.clear();await search.sendKeys('x',Key.BACK_SPACE);await waitFor("return document.getElementById('clipList').children.length===81;");
return {csv_rows:81,json_labels:81,refresh_restored:81,main_filter:41,other_filter:40};});
await stage('Clear, next-unassigned, native file upload restore, and invalid backup rejection',async()=>{
await click('clearButton');delete expected[source.clips[0].id];assert.deepEqual((await state()).labels,expected);
await click('nextButton');await click('nextUnassigned');assert.equal((await state()).index,0);
await click('resetButton');await driver.switchTo().alert().accept();await waitFor('return Object.keys(labels).length===0;');
const file=path.join(out,'restore-backup.json');fs.writeFileSync(file,JSON.stringify(backup));await driver.findElement(By.id('importFile')).sendKeys(file);await waitFor('return Object.keys(labels).length===81;');assert.deepEqual((await state()).labels,backup.labels);expected={...backup.labels};
const bad=path.join(out,'invalid-backup.json');fs.writeFileSync(bad,JSON.stringify({...backup,dataset_id:'wrong-dataset'}));await driver.findElement(By.id('importFile')).sendKeys(bad);await waitFor("return document.getElementById('status').textContent.includes('Could not restore');");assert.deepEqual((await state()).labels,expected);
return {clear_changes_only_current:true,next_unassigned_correct:true,file_upload_restore:81,invalid_backup_preserves_labels:true};});
await stage('Pause/resume, buffer labels, replay, navigation, skipped clip, and keyboard',async()=>{
await frozenPage(true);await click('queueButton');await mediaPlaying(0);await advance(7000);await click('queueButton');let s=await state();assert.equal(s.remaining,8000);assert.equal(s.running,false);await advance(60000);assert.equal((await state()).remaining,8000);
await click('queueButton');await waitFor('return running && deadline>0;');await advance(8001);assert.equal((await state()).phase,'buffer');await click('otherButton');assert.equal((await state()).labels[source.clips[0].id],'other');
await click('queueButton');s=await state();assert.equal(s.phase,'buffer');assert.equal(s.remaining,2000);await advance(30000);assert.equal((await state()).remaining,2000);await click('queueButton');await waitFor('return running && deadline>0;');assert.equal((await state()).paused,true);await finishBuffer();await mediaPlaying(1);
await click('replayButton');await mediaPlaying(1);assert.equal((await state()).phase,'listen');assert.equal((await state()).remaining,15000);
await click('previousButton');await mediaPlaying(0);await click('nextButton');await mediaPlaying(1);
await finishListening();await finishBuffer();await mediaPlaying(2);assert.equal((await state()).labels[source.clips[1].id],undefined);
await driver.actions().sendKeys('m').perform();assert.equal((await state()).labels[source.clips[2].id],'main');await driver.actions().sendKeys('o').perform();assert.equal((await state()).labels[source.clips[2].id],'other');
await click('queueButton');return {listening_pause_preserves_ms:8000,buffer_pause_preserves_ms:2000,buffer_label_correct:true,replay_restarts_window:true,skip_stays_unassigned:true,keyboard_labels_correct:true};});
await stage('Short clip retains decision time after native playback ends',async()=>{
await frozenPage(true);const index=source.clips.findIndex(c=>c.duration<1.5);assert(index>=0);
await driver.findElement(By.css(`#clipList .clip-row:nth-child(${index+1})`)).click();await click('queueButton');await mediaPlaying(index);await waitFor("return document.getElementById('audio').ended;",5000);let s=await state();assert.equal(s.index,index);assert.equal(s.phase,'listen');assert.equal(s.remaining,15000);
await click('mainButton');assert.equal((await state()).labels[source.clips[index].id],'main');await advance(14999);assert.equal((await state()).index,index);assert.equal((await state()).phase,'listen');await advance(2);assert.equal((await state()).phase,'buffer');await click('queueButton');return {file:source.clips[index].name,original_seconds:source.clips[index].duration,full_decision_window:true};});
await stage('Storage failure keeps the clicked assignment and a visible backup warning',async()=>{
await frozenPage(true);await click('queueButton');await mediaPlaying(0);await js("window.__storageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Test quota failure','QuotaExceededError');};");await click('otherButton');const s=await state();assert.equal(s.labels[source.clips[0].id],'other');assert.equal(await js('return storageAvailable;'),false);
const status=await js("return document.getElementById('status').textContent;");assert.match(status,/storage.*unavailable/i);await js('Storage.prototype.setItem=window.__storageSet;');await click('queueButton');return {in_memory_label_preserved:true,backup_warning_visible:true};});
await stage('Actual 15-second playback window and minimum two-second silent buffer',async()=>{
await driver.get(url);await waitFor('return typeof clips!=="undefined" && clips.length===81;');await js(`window.__timing={playing:[],pauses:[],buffers:[]};const a=document.getElementById('audio');a.addEventListener('playing',()=>window.__timing.playing.push({index:current,t:performance.now()}));a.addEventListener('pause',()=>window.__timing.pauses.push({index:current,t:performance.now()}));new MutationObserver(()=>{if(phase==='buffer' && !window.__timing.buffers.some(x=>x.index===current))window.__timing.buffers.push({index:current,t:performance.now()});}).observe(document.getElementById('timerCaption'),{childList:true,subtree:true});`);
await click('queueButton');await mediaPlaying(0);await click('mainButton');await waitFor("return current===0 && phase==='buffer';",20000);await click('otherButton');assert.equal((await state()).labels[source.clips[0].id],'other');await mediaPlaying(1);await click('mainButton');assert.equal((await state()).labels[source.clips[1].id],'main');
const timing=await js('return window.__timing;');const first=timing.playing.find(x=>x.index===0),next=timing.playing.find(x=>x.index===1),buffer=timing.buffers.find(x=>x.index===0),pause=timing.pauses.find(x=>x.index===0);assert(first&&next&&buffer&&pause);
const listening=buffer.t-first.t,gap=next.t-pause.t,total=next.t-first.t;assert(listening>=14900,`Listening window too short: ${listening}`);assert(gap>=1990,`Buffer too short: ${gap}`);assert(total>=16900,`Transition too early: ${total}`);
report.timing={clock:'native performance.now',listening_ms:listening,silent_gap_ms:gap,first_to_next_playback_ms:total,event_observation_tolerance_ms:10,events:timing};await click('queueButton');fs.writeFileSync(path.join(out,'real-timing.png'),await driver.takeScreenshot(),'base64');return report.timing;});
report.status='PASS';
}catch(error){report.status='FAIL';report.error={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
finally{
if(driver){for(const [filename,fn,encoding] of [['final.png',()=>driver.takeScreenshot(),'base64'],['final.html',()=>driver.getPageSource(),'utf8'],['browser.log.json',async()=>JSON.stringify(await driver.manage().logs().get('browser'),null,2),'utf8']]){try{fs.writeFileSync(path.join(out,filename),await fn(),encoding);}catch(error){(report.capture_errors??=[]).push({file:filename,error:error.message});}}try{await driver.quit();}catch(error){report.quit_error=error.message;}}
report.finished_at=new Date().toISOString();fs.writeFileSync(path.join(out,'audio-selector-report.json'),JSON.stringify(report,null,2));
const cols=['number','file','label','captured_file','source_matches','native_event_trusted','media_time','storage_matches'];const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';fs.writeFileSync(path.join(out,'click-audit.csv'),[cols.join(','),...report.clicks.map(r=>cols.map(k=>quote(r[k])).join(','))].join('\n'));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Audio selector: ${report.status}\n\n81-clip sweep: ${report.clicks.length}/81 recorded clicks.\n\n${report.stages.map(s=>'- '+s.status+': '+s.name).join('\n')}\n`);
console.log(JSON.stringify({status:report.status,clicks:report.clicks.length,stages:report.stages,timing:report.timing,error:report.error},null,2));
}}
main().catch(error=>{console.error(error);process.exitCode=1;});
