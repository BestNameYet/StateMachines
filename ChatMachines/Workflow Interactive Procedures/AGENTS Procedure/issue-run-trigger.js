const fs = require('node:fs');
const path = require('node:path');

const triggerDirectory = path.join(__dirname, 'issue-run-triggers');
const identifierFromFilename = (filename, nonce) => {
  if (typeof filename !== 'string' || !filename.endsWith('.json')) {
    throw new Error('Trigger filename must end in .json.');
  }
  const stem = filename.slice(0, -5);
  const suffix = String(nonce);
  if (!stem.endsWith(suffix)) throw new Error('Filename must end with its JSON nonce.');
  const procedureName = stem.slice(0, -suffix.length);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(procedureName)) {
    throw new Error('Filename must be <procedureName><nonce>.json; procedureName must start with a letter and contain only letters, digits, _ or -.');
  }
  return { procedureName, identifier: stem };
};

function parseTrigger(filename, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Trigger JSON must be an object.');
  }
  if (value.startProcedure !== true) return null;
  if (!Number.isSafeInteger(value.nonce) || value.nonce < 0) {
    throw new Error('nonce must be a non-negative safe integer.');
  }
  const { procedureName, identifier } = identifierFromFilename(filename, value.nonce);
  const allowed = new Set(['startProcedure', 'nonce']);
  const unexpected = Object.keys(value).filter(key => !allowed.has(key));
  if (unexpected.length) throw new Error('A new trigger may contain only startProcedure and nonce; found: ' + unexpected.join(', '));
  return { filename, procedureName, identifier, nonce: value.nonce };
}

function triggerMarker(identifier) {
  return '<!-- agents-procedure-trigger:' + identifier + ' -->';
}

function issueBody(trigger) {
  return [
    triggerMarker(trigger.identifier),
    '### Procedure acknowledgement',
    '',
    '- [x] I agree to follow each instruction, preserve the user intent and constraints, perform the required work before reporting it, return accurate values in the required format, and account for incomplete or unapproved changes.',
    '',
    'Trigger identifier: `' + trigger.identifier + '`',
    ''
  ].join('\n');
}

async function main() {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (event_name() !== 'push') return;
  const repository = process.env.GITHUB_REPOSITORY;
  const apiBase = 'https://api.github.com/repos/' + repository;
  async function api(method, route, body) {
    const response = await fetch(apiBase + route, {
      method,
      headers: {
        Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error('GitHub ' + method + ' ' + route + ' returned ' + response.status + ': ' + await response.text());
    return response.status === 204 ? null : response.json();
  }
  async function findIssue(marker) {
    for (let page = 1; ; page++) {
      const issues = await api('GET', '/issues?state=all&per_page=100&page=' + page);
      const found = issues.find(issue => !issue.pull_request && (issue.body || '').includes(marker));
      if (found) return found;
      if (issues.length < 100) return null;
    }
  }
  async function readFile(filename) {
    const relative = path.relative(process.env.GITHUB_WORKSPACE, path.join(triggerDirectory, filename)).split(path.sep).join('/');
    const route = '/contents/' + relative.split('/').map(encodeURIComponent).join('/');
    return { route, stored: await api('GET', route) };
  }
  async function writeConsumedTrigger(route, stored, trigger, issue) {
    const current = JSON.parse(Buffer.from(stored.content, 'base64').toString('utf8'));
    if (current.startProcedure !== true) return;
    const completed = {
      ...current,
      startProcedure: false,
      procedureName: trigger.procedureName,
      procedureIdentifier: trigger.identifier,
      procedureIssueNumber: issue.number,
      procedureIssueUrl: issue.html_url,
      procedureTitle: issue.title,
      procedureReceiptPath: 'ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/issue-runs/' + issue.number + '.json'
    };
    await api('PUT', route, {
      message: 'Bind procedure trigger ' + trigger.identifier + ' to issue ' + issue.number,
      sha: stored.sha,
      content: Buffer.from(JSON.stringify(completed, null, 2) + '\n').toString('base64')
    });
  }
  const names = fs.readdirSync(triggerDirectory).filter(name => name.endsWith('.json')).sort();
  for (const filename of names) {
    const value = JSON.parse(fs.readFileSync(path.join(triggerDirectory, filename), 'utf8'));
    const trigger = parseTrigger(filename, value);
    if (!trigger) continue;
    const marker = triggerMarker(trigger.identifier);
    let issue = await findIssue(marker);
    if (!issue) {
      issue = await api('POST', '/issues', {
        title: 'AGENTS Procedure — ' + trigger.identifier,
        body: issueBody(trigger)
      });
    }
    await api('POST', '/actions/workflows/agents-procedure-issues.yml/dispatches', {
      ref: 'main',
      inputs: { issue_number: String(issue.number) }
    });
    const { route, stored } = await readFile(filename);
    await writeConsumedTrigger(route, stored, trigger, issue);
    console.log('Bound ' + filename + ' to issue #' + issue.number + ' and dispatched issue initialization.');
  }
}

function event_name() {
  return process.env.GITHUB_EVENT_NAME;
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { parseTrigger, triggerMarker, issueBody, identifierFromFilename };
