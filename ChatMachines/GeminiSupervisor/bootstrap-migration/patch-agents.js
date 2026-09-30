const fs = require("node:fs");

const path = "ChatMachines/GeminiSupervisor/Agents.md";
let text = fs.readFileSync(path, "utf8");

const bootstrap = [
  "## Bootstrap",
  "",
  "Every user utterance starts one distinct Gemini Supervisor procedure run before Step 0.",
  "",
  "1. Assign a unique path-safe `run_nonce` to the procedure run. The `run_nonce` supplied with the trigger message is the canonical identity for that run.",
  "2. Initialize an isolated run container at `ChatMachines/GeminiSupervisor/runs/<run_nonce>/` containing `state.json`, `messages.json`, and `store/store.json`.",
  "3. Write the same `run_nonce` into `state.json -> current_state.run_nonce`, `messages.json -> run_nonce`, and `store/store.json -> run_nonce`. These values must match before Step 0 may begin.",
  "4. Preserve the complete user utterance verbatim as the initial user message for that run.",
  "5. Every semantic-operator input/return exchange appended to that run's `messages.json` must also be persisted to that run's `store/store.json` with the same `run_nonce`.",
  "6. A procedure run may read or mutate only the state, messages, and store associated with its own `run_nonce` unless the user explicitly identifies another run for continuation or inspection.",
  "7. A new user utterance receives a new `run_nonce` by default. Reusing a prior `run_nonce` means explicit continuation or resumption of that same procedure run.",
  "",
  "Bootstrap must complete successfully before Step 0 begins.",
  "",
  ""
].join("\n");

if (!text.includes("## Bootstrap")) {
  const step0 = text.indexOf("## Step 0");
  if (step0 < 0) throw new Error("Step 0 not found");
  text = text.slice(0, step0) + bootstrap + text.slice(step0);
}

const oldStep0 = '{"start_of_turn":{"user_request":"<verbatim user request>","current_timestamp":"<ISO 8601 timestamp>","return_schema_completed":false,"return_schema_completed_timestamp":null,"nonce":"<unique nonce>"}}';
const newStep0 = '{"start_of_turn":{"run_nonce":"<bootstrap run nonce>","user_request":"<verbatim user request>","current_timestamp":"<ISO 8601 timestamp>","return_schema_completed":false,"return_schema_completed_timestamp":null,"nonce":"<unique request nonce>"}}';
if (text.includes(oldStep0)) text = text.replace(oldStep0, newStep0);

text = text.replace(
  "The persistent record and the UI\nrecord must identify the same request and nonce.",
  "The persistent record and the UI\nrecord must identify the same run_nonce, request, and request nonce."
);

fs.writeFileSync(path, text);
console.log("Agents.md bootstrap/run identity migration applied.");
