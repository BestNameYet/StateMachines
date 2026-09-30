const fs = require('node:fs');

const root = 'ChatMachines/GeminiSupervisor';
const agentsPath = `${root}/Agents.md`;
const triggerPath = `${root}/nextmessage/nextmessage.json`;
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

function parseJsonText(text) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!match) throw new Error('Gemini response was not valid JSON.');
  return JSON.parse(match[1].trim());
}

function requireTerms(label, text, terms) {
  if (typeof text !== 'string' || !text.trim()) throw new Error(`${label} is missing.`);
  const lower = text.toLowerCase();
  for (const term of terms) {
    if (!lower.includes(term.toLowerCase())) throw new Error(`${label} is missing required term: ${term}`);
  }
}

async function main() {
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing.');
  const trigger = JSON.parse(fs.readFileSync(triggerPath, 'utf8'));
  if (trigger.operation !== 'gemini_edit_agents') throw new Error('Expected operation=gemini_edit_agents.');

  let agents = fs.readFileSync(agentsPath, 'utf8');
  if (agents.includes('## ChatGPT Turn Continuation and Gemini Handshake Protocol')) {
    throw new Error('Agents.md already contains the requested global turn-continuation protocol; refusing to duplicate it.');
  }

  const instruction = `Return JSON only with exactly this shape:\n{\n  "global_protocol": "<complete markdown section beginning with ## ChatGPT Turn Continuation and Gemini Handshake Protocol>",\n  "step_requirements": {\n    "0": "<single markdown paragraph beginning **Turn-continuation requirement for Step 0.**>",\n    "1": "<single markdown paragraph beginning **Turn-continuation requirement for Step 1.**>",\n    "2": "<single markdown paragraph beginning **Turn-continuation requirement for Step 2.**>",\n    "3": "<single markdown paragraph beginning **Turn-continuation requirement for Step 3.**>",\n    "4": "<single markdown paragraph beginning **Turn-continuation requirement for Step 4.**>"\n  }\n}\n\nAuthor only additive rule text for Agents.md. The rules must state all of the following unambiguously:\n1. ChatGPT's current user-facing turn spans the complete Gemini commit-and-response handshake.\n2. After ChatGPT commits any nextmessage, ChatGPT cannot end the turn and must wait for and inspect the corresponding Gemini response.\n3. A nextmessage commit is never a turn-ending boundary; every new nextmessage commit creates a new mandatory wait for Gemini's next response.\n4. If Gemini returns FAIL, ChatGPT must remain in the same turn, read the failure, correct the same ChatGPT-owned execution step, commit the corrected nextmessage using the same run, and wait for Gemini again. Merely reporting FAIL is not sufficient.\n5. If Gemini returns PASS and another execution step remains, ChatGPT must remain in the same turn, perform the next ChatGPT-owned step, commit that nextmessage, and wait for Gemini again.\n6. ChatGPT may end the turn only after the latest committed nextmessage has received its Gemini response and the procedure is terminal with no further ChatGPT execution or nextmessage required.\n7. Ending while a Gemini response is outstanding, ending immediately after a nextmessage commit, or failing to continue after a non-terminal Gemini response is a procedure failure.\n8. Put the complete rule in global_protocol and make each Step 0 through Step 4 paragraph independently state the same commit/wait/FAIL/PASS/terminal requirement. Do not rewrite any existing Agents.md text.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: 'Follow the edit specification exactly. Return only the requested JSON.' }] },
      contents: [{ role: 'user', parts: [{ text: instruction }] }]
    }),
    signal: AbortSignal.timeout(180000)
  });

  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { throw new Error(`Gemini returned non-JSON HTTP ${response.status}: ${raw}`); }
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(body.error || body)}`);
  const modelText = body.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n');
  if (!modelText) throw new Error('Gemini returned no text.');
  const edit = parseJsonText(modelText);

  requireTerms('global_protocol', edit.global_protocol, ['## ChatGPT Turn Continuation and Gemini Handshake Protocol', 'nextmessage', 'Gemini', 'FAIL', 'PASS', 'terminal', 'end']);
  if (!edit.step_requirements || typeof edit.step_requirements !== 'object' || Array.isArray(edit.step_requirements)) throw new Error('step_requirements must be an object.');
  for (let n = 0; n <= 4; n++) {
    requireTerms(`step_requirements.${n}`, edit.step_requirements[String(n)], [`**Turn-continuation requirement for Step ${n}.**`, 'nextmessage', 'Gemini', 'FAIL', 'PASS', 'terminal', 'end']);
  }

  const failureMarker = '\n## Failure Examples\n';
  if (!agents.includes(failureMarker)) throw new Error('Failure Examples insertion marker not found.');
  agents = agents.replace(failureMarker, `\n${edit.global_protocol.trim()}\n\n## Failure Examples\n`);

  const roleLine = '**Required execution role: ChatGPT model. Forbidden execution role: Gemini model.**';
  for (let n = 0; n <= 4; n++) {
    const needle = `## Step ${n}\n\n${roleLine}`;
    const count = agents.split(needle).length - 1;
    if (count !== 1) throw new Error(`Expected exactly one Step ${n} role insertion point; found ${count}.`);
    agents = agents.replace(needle, `${needle}\n\n${edit.step_requirements[String(n)].trim()}`);
  }

  fs.writeFileSync(agentsPath, agents, 'utf8');
  console.log(JSON.stringify({ gemini_edit_applied: true, global_protocol_added: true, step_requirements_added: [0,1,2,3,4] }));
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exit(1);
});
