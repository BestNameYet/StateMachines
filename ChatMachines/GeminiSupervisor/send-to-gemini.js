const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const root = "ChatMachines/GeminiSupervisor";
const webAppUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
const outputPath = `${root}/Agents.md`;

function driveFolderTransfer(input) {
  const folder = DriveApp.getFolderById(input.folder_id);
  const files = folder.getFilesByName(input.file_name);
  if (!files.hasNext()) throw new Error(`${input.file_name} not found in folder`);
  const file = files.next();
  const blob = file.getBlob();
  return {
    file_name: file.getName(),
    mime_type: blob.getContentType(),
    content_base64: Utilities.base64Encode(blob.getBytes())
  };
}

async function main() {
  if (!webAppUrl) throw new Error("APPS_SCRIPT_WEB_APP_URL is missing.");

  const response = await fetch(webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourcecode: `(${driveFolderTransfer.toString()})`,
      arguments: {
        folder_id: "1p_AumI0cvh0HMy112zHkAOKhoO_J8-y7",
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
    throw new Error(`Apps Script did not return content_base64: ${text}`);
  }

  fs.writeFileSync(outputPath, Buffer.from(result.content_base64, "base64"));

  execFileSync("git", ["config", "user.name", "github-actions[bot]"]);
  execFileSync("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  execFileSync("git", ["add", outputPath]);
  const changed = execFileSync("git", ["status", "--porcelain", "--", outputPath], { encoding: "utf8" }).trim();
  if (!changed) {
    console.log("Agents.md already matches Drive; nothing to commit.");
    return;
  }
  execFileSync("git", ["commit", "-m", "Transfer Agents.md from Drive"]);
  execFileSync("git", ["push", "origin", "HEAD:main"], { stdio: "inherit" });
  console.log(`Transferred and committed ${outputPath}.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
