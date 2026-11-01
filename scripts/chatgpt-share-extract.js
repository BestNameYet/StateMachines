"use strict";

/**
 * Input: public ChatGPT share URL (or --html for an offline regression test).
 * Output: original response.html, matching conversation.md and conversation.json.
 * Reads the original HTML's React Router script payload, resolves its indexed
 * mapping/current_node and parent chain; NEVER reads a pre-extracted JSON file,
 * an alphabetical tag index, or the linear_conversation convenience field.
 *
 * Usage:
 *   node build-shared-conversation.js --url https://chatgpt.com/share/<uuid> --out /path
 *   node build-shared-conversation.js --url https://chatgpt.com/share/<uuid> --html response.html --out /path
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const sha256 = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const MAX_BYTES = 25 * 1024 * 1024;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!["--url", "--html", "--out"].includes(process.argv[i]) || !process.argv[i + 1]) {
    throw new Error("Usage: --url https://chatgpt.com/share/<uuid> [--html file] --out directory");
  }
  args[process.argv[i]] = process.argv[i + 1];
}
if (!args["--url"] || !args["--out"]) throw new Error("--url and --out are required");

function validateUrl(input) {
  const u = new URL(input);
  if (u.protocol !== "https:" || u.hostname !== "chatgpt.com" ||
      u.username || u.password || u.port ||
      !/^\/share\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(u.pathname)) {
    throw new Error("Only public https://chatgpt.com/share/<uuid> URLs are supported");
  }
  return u;
}
const requested = validateUrl(args["--url"]);
const shareId = requested.pathname.split("/")[2].toLowerCase();

async function downloadHtml(initial) {
  let next = initial;
  for (let redirect = 0; redirect < 5; redirect++) {
    validateUrl(next.toString());
    const response = await fetch(next, {
      headers: {
        "accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "user-agent": "IssueStack-SharedConversationExporter/1.0"
      },
      redirect: "manual",
      signal: AbortSignal.timeout(45000)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect missing Location header");
      next = validateUrl(new URL(location, next).toString());
      continue;
    }
    if (!response.ok) throw new Error("ChatGPT returned HTTP " + response.status);
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")) {
      throw new Error("ChatGPT returned a non-HTML response");
    }
    let size = 0;
    const chunks = [];
    const reader = response.body.getReader();
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("HTML exceeded the 25 MiB limit");
      }
      chunks.push(Buffer.from(value));
    }
    if (!size) throw new Error("Empty HTML response");
    return {bytes: Buffer.concat(chunks), status: response.status, url: response.url};
  }
  throw new Error("Too many redirects");
}

function extractScriptTable(html) {
  const scripts = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
  const enqueue = /window\.__reactRouterContext\.streamController\.enqueue\(("(?:\\.|[^"\\])*")\)/g;
  let script;
  while ((script = scripts.exec(html)) !== null) {
    if (!script[1].includes("window.__reactRouterContext.streamController.enqueue")) continue;
    enqueue.lastIndex = 0;
    let call;
    while ((call = enqueue.exec(script[1])) !== null) {
      const decoded = JSON.parse(call[1]);
      if (!decoded.trimStart().startsWith("[")) continue;
      const table = JSON.parse(decoded);
      if (Array.isArray(table) && table.length > 0) return table;
    }
  }
  throw new Error("HTML contains no supported serialized conversation script");
}

function decodeConversation(table) {
  const at = i => Number.isInteger(i) && i >= 0 && i < table.length ? table[i] : undefined;
  function ref(objectIndex, name) {
    const o = at(objectIndex);
    if (!o || Array.isArray(o) || typeof o !== "object") return undefined;
    for (const [key, value] of Object.entries(o)) {
      if (/^_\d+$/.test(key) && at(Number(key.slice(1))) === name) return value;
    }
    return undefined;
  }
  const get = (objectIndex, name) => at(ref(objectIndex, name));

  // The script's message mapping and current node define the visible branch.
  // Do not shortcut via linear_conversation; reconstruct from parent references.
  const pending = [{index: 0, depth: 0}], explored = new Set();
  let root;
  for (let p = 0; p < pending.length; p++) {
    const {index, depth} = pending[p];
    if (explored.has(index) || depth > 12 || index < 0) continue;
    explored.add(index);
    if (ref(index, "mapping") !== undefined && ref(index, "current_node") !== undefined) {
      root = index;
      break;
    }
    const o = at(index);
    if (!o || Array.isArray(o) || typeof o !== "object") continue;
    for (const [key, value] of Object.entries(o)) {
      if (!/^_\d+$/.test(key) || !Number.isInteger(value)) continue;
      if (at(Number(key.slice(1))) === "linear_conversation") continue;
      if (at(value) !== null && typeof at(value) === "object") pending.push({index: value, depth: depth + 1});
    }
  }
  if (root === undefined) throw new Error("Missing message map in serialized HTML");
  const mapping = get(root, "mapping");
  const currentId = get(root, "current_node");
  if (!mapping || Array.isArray(mapping) || typeof mapping !== "object" || typeof currentId !== "string") {
    throw new Error("Invalid conversation message map");
  }

  const byId = new Map();
  for (const [key, nodeIndex] of Object.entries(mapping)) {
    if (/^_\d+$/.test(key)) {
      const id = at(Number(key.slice(1)));
      if (typeof id === "string") byId.set(id, nodeIndex);
    }
  }
  if (!byId.has(currentId)) throw new Error("Current message node not found");

  const chain = [], visited = new Set();
  let cursor = currentId;
  while (cursor != null) {
    if (visited.has(cursor)) throw new Error("Cyclic message parent link");
    visited.add(cursor);
    const node = byId.get(cursor);
    if (node === undefined) throw new Error("Missing parent message " + cursor);
    chain.push(node);
    cursor = get(node, "parent");
  }
  chain.reverse();

  const messages = [], counts = {user: 0, commentary: 0, final: 0};
  for (const node of chain) {
    const message = ref(node, "message");
    if (message === undefined || at(message) == null) continue;
    const role = get(ref(message, "author"), "role");
    const channel = get(message, "channel") ?? null;
    let countKey;
    if (role === "user") countKey = "user";
    else if (role === "assistant" && channel === "commentary") countKey = "commentary";
    else if (role === "assistant" && channel === "final") countKey = "final";
    else continue;

    const parts = get(ref(message, "content"), "parts");
    if (!Array.isArray(parts)) continue;
    const text = parts.map(at).filter(value => typeof value === "string").join("\n").trimEnd();
    if (!text.trim()) continue;
    messages.push({role, channel: role === "user" ? null : channel, text});
    counts[countKey] += 1;
  }
  if (!messages.length || !counts.user || !counts.final) {
    throw new Error("No complete user/assistant conversation recovered");
  }
  if (messages.length !== counts.user + counts.commentary + counts.final) throw new Error("Role totals mismatch");
  return {messages, counts, chainCount: chain.length};
}

function quoteMarkdown(text) {
  return text.split("\n").map(line => line.length ? "> " + line : ">").join("\n");
}
function renderMarkdown(messages) {
  const turns = [];
  let active = [];
  for (const m of messages) {
    if (m.role === "user" && active.length) {
      turns.push(active.join("\n\n"));
      active = [];
    }
    if (m.role === "user") active.push("**You**\n\n" + quoteMarkdown(m.text));
    else if (m.channel === "commentary") active.push("**Assistant · Commentary**\n\n" + quoteMarkdown(m.text));
    else active.push("**Assistant**\n\n" + m.text);
  }
  if (active.length) turns.push(active.join("\n\n"));
  return "# Conversation\n\n" + turns.join("\n\n---\n\n") + "\n";
}

async function main() {
  let captured;
  if (args["--html"]) {
    captured = {bytes: fs.readFileSync(args["--html"]), status: "fixture", url: requested.toString()};
  } else {
    captured = await downloadHtml(requested);
  }
  const table = extractScriptTable(captured.bytes.toString("utf8"));
  const {messages, counts, chainCount} = decodeConversation(table);
  const json = {
    schema: "chatgpt.shared-conversation.visible.v1",
    source_url: requested.toString(),
    counts,
    messages
  };
  const markdown = renderMarkdown(messages);
  const outDir = path.resolve(args["--out"]);
  fs.mkdirSync(outDir, {recursive: true});
  const files = {
    "response.html": captured.bytes,
    "conversation.md": Buffer.from(markdown, "utf8"),
    "conversation.json": Buffer.from(JSON.stringify(json, null, 2) + "\n", "utf8")
  };
  for (const [filename, bytes] of Object.entries(files)) fs.writeFileSync(path.join(outDir, filename), bytes);
  const receipt = {
    share_id: shareId,
    source_url: requested.toString(),
    http_status: captured.status,
    chain_nodes: chainCount,
    counts,
    files: Object.fromEntries(Object.entries(files).map(([name, bytes]) =>
      [name, {bytes: bytes.length, sha256: sha256(bytes)}]))
  };
  fs.writeFileSync(path.join(outDir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
}
main().catch(error => {
  console.error(error && error.stack || String(error));
  process.exitCode = 1;
});
