const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const root = "ChatMachines/GeminiSupervisor";
const webAppUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
const outputPath = `${root}/drive-transfer-test.json`;

function driveJsonTransfer(input) {
  const jsonText = JSON.stringify(input.document, null, 2);
  const file = DriveApp.createFile(input.file_name, jsonText, "application/json");
  const blob = DriveApp.getFileById(file.getId()).getBlob();
  return {
    drive_file_id: file.getId(),
    file_name: input.file_name,
    mime_type: "application/json",
    content_base64: Utilities.base64Encode(blob.getBytes())
  };
}

async function main() {
  if (!webAppUrl) throw new Error("APPS_SCRIPT_WEB_APP_URL is missing.");

  const response = await fetch(webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourcecode: `(${driveJsonTransfer.toString()})`,
      arguments: {
        file_name: "drive-transfer-test.json",
        document: {
          transfer_test: true,
          path: "Google Drive -> Apps Script -> GitHub Actions -> GitHub commit",
          nonce: "2026-09-30-json-transfer-test"
        }
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
  JSON.parse(fs.readFileSync(outputPath, "utf8"));

  execFileSync("git", ["config", "user.name", "github-actions[bot]"]);
  execFileSync("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  execFileSync("git", ["add", outputPath]);
  execFileSync("git", ["commit", "-m", "Commit Drive JSON transfer test"]);
  execFileSync("git", ["push", "origin", "HEAD:main"], { stdio: "inherit" });

  console.log(`Transferred and committed ${outputPath}; Drive file ${result.drive_file_id}.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
