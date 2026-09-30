const fs = require("node:fs");

const path = "ChatMachines/GeminiSupervisor/Agents.md";
let text = fs.readFileSync(path, "utf8");

const step3Start = text.indexOf("## Step 3");
const step4Start = text.indexOf("## Step 4", step3Start + 1);
if (step3Start < 0 || step4Start < 0) {
  throw new Error("Could not locate Step 3 / Step 4 boundaries in Agents.md");
}

const executorAnchor = '    "user_request_nonce": "<request nonce>",';
const executorAnchorIndex = text.indexOf(executorAnchor, step3Start);
if (executorAnchorIndex < 0 || executorAnchorIndex > step4Start) {
  throw new Error("Could not locate Step 3 executor insertion point");
}

const executorBlock = [
  '    "evaluation_documents_read": {',
  '      "instruction": "Before Step 3.A or any other Step 3 execution action, the executor must read evaluation-tests.md and evaluator-definitions.md completely and use both documents as evaluation context throughout Step 3.",',
  '      "value": "<evaluation-tests.md and evaluator-definitions.md read completely>"',
  '    },',
  '',
].join("\n");

if (!text.slice(step3Start, step4Start).includes('"evaluation_documents_read"')) {
  text = text.slice(0, executorAnchorIndex) + executorBlock + text.slice(executorAnchorIndex);
}

const refreshedStep3Start = text.indexOf("## Step 3");
const refreshedStep4Start = text.indexOf("## Step 4", refreshedStep3Start + 1);
const step3Segment = text.slice(refreshedStep3Start, refreshedStep4Start);
const gateHeadingRelative = step3Segment.lastIndexOf("### Supervisory Gate");
if (gateHeadingRelative < 0) {
  throw new Error("Could not locate Step 3 Supervisory Gate");
}

const gateHeadingIndex = refreshedStep3Start + gateHeadingRelative;
const gateObjectAnchor = '  "supervisory_gate": {';
const gateObjectIndex = text.indexOf(gateObjectAnchor, gateHeadingIndex);
if (gateObjectIndex < 0 || gateObjectIndex > refreshedStep4Start) {
  throw new Error("Could not locate Step 3 supervisory_gate object");
}

const supervisorBlock = [
  '',
  '    "evaluation_documents_read": {',
  '      "instruction": "Before any other Step 3 supervisory action, the supervisor must read evaluation-tests.md and evaluator-definitions.md completely and use both documents as evaluation context for the Step 3 Supervisory Gate.",',
  '      "value": "<evaluation-tests.md and evaluator-definitions.md read completely>"',
  '    },',
].join("\n");

const afterGateAnchor = gateObjectIndex + gateObjectAnchor.length;
const gateWindow = text.slice(afterGateAnchor, Math.min(afterGateAnchor + 800, refreshedStep4Start));
if (!gateWindow.includes('"evaluation_documents_read"')) {
  text = text.slice(0, afterGateAnchor) + supervisorBlock + text.slice(afterGateAnchor);
}

fs.writeFileSync(path, text);
console.log("Patched Step 3 executor and supervisor evaluation-document read actions.");
