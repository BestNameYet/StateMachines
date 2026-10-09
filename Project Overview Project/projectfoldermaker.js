"use strict";

const fs = require("node:fs");
const path = require("node:path");

const baseDir = __dirname;
const feedFile = path.join(baseDir, "projectnames.json");
const projectsDir = path.join(baseDir, "Projects");

function folderNameFor(projectName) {
  if (typeof projectName !== "string" || !projectName.trim() || projectName !== projectName.trim()) {
    throw new Error("Every project name must be a nonempty, trimmed string.");
  }
  if (projectName === "." || projectName === "..") {
    throw new Error("Relative-path project names are not allowed.");
  }

  // Keep the displayed project name wherever portable; replace path-unsafe characters.
  const name = projectName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/[. ]+$/g, "");
  if (!name || name === "." || name === ".." || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) {
    throw new Error("Unsafe project directory name: " + projectName);
  }
  return name;
}

function main() {
  const projectNames = JSON.parse(fs.readFileSync(feedFile, "utf8"));
  if (!Array.isArray(projectNames)) {
    throw new Error("projectnames.json must be a JSON array.");
  }

  // Validate the entire feed before changing the filesystem.
  const seen = new Set();
  for (const projectName of projectNames) {
    const dirName = folderNameFor(projectName);
    const key = dirName.normalize("NFC").toLowerCase();
    if (seen.has(key)) {
      throw new Error("Duplicate or colliding directory name: " + dirName);
    }
    seen.add(key);
  }

  fs.mkdirSync(projectsDir, { recursive: true });
  let created = 0;
  let existing = 0;

  // The JSON array is the feed for this iterator.
  for (const projectName of projectNames) {
    const folderName = folderNameFor(projectName);
    const target = path.join(projectsDir, folderName);
    const alreadyExists = fs.existsSync(target);
    fs.mkdirSync(target, { recursive: true });

    // Git does not track empty directories; never overwrite an existing marker.
    const marker = path.join(target, ".gitkeep");
    if (!fs.existsSync(marker)) fs.writeFileSync(marker, "", { flag: "wx" });

    if (alreadyExists) existing++;
    else created++;
    console.log((alreadyExists ? "EXISTS " : "CREATED ") + folderName);
  }

  console.log(JSON.stringify({ processed: projectNames.length, created, existing }));
}

if (require.main === module) main();
