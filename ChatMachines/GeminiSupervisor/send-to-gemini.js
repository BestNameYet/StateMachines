/**
 * One-time transport: ask Apps Script to return raw Agents.md from Drive
 * and write the returned bytes to the repository working tree.
 */
const fs = require("node:fs");

const root = "ChatMachines/GeminiSupervisor";
const webAppUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
const agentsPath = `${root}/Agents.md`;

function driveFile(input) {
  const blob = DriveApp.getFileById(input.file_id).getBlob();
  return {
    file_name: input.file_name,
    mime_type: "text/markdown",
    content_base64: Utilities.base64Encode(blob.getBytes())
  };
}

async function main() {
  if (!webAppUrl) throw new Error("APPS_SCRIPT_WEB_APP_URL is missing.");

  const response = await fetch(webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourcecode: `(${driveFile.toString()})`,
      arguments: {
        file_id: "1xnsUXwd_4kagU-ou9iAB20FKQ7aF41nX",
        file_name: "Agents.md"
      }
    }),
    redirect: "follow",
    signal: AbortSignal.timeout(180000)
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}: ${text}`);

  let result;
  try { result = JSON.parse(text); }
  catch (_) { throw new Error(`Apps Script returned non-JSON: ${text}`); }

  if (!result || !result.content_base64) {
    throw new Error("Apps Script did not return Agents.md content_base64.");
  }

  fs.writeFileSync(agentsPath, Buffer.from(result.content_base64, "base64"));

  if (!fs.existsSync(agentsPath)) throw new Error("Agents.md was not written.");
  console.log(`Recovered ${agentsPath} from Drive (${fs.statSync(agentsPath).size} bytes).`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
