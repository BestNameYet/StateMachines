/**
 * Adds the next user turn, calls Gemini with the full conversation,
 * then appends the model reply to MessageStream/messages.json.
 */
const fs = require("node:fs");

const root = "ChatMachines/GeminiChatGPTAppScript";
const streamPath = `${root}/MessageStream/messages.json`;
const nextPath = `${root}/nextmessage.json`;
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

async function main() {
  if (!apiKey) throw new Error("GEMINI_API_KEY repository secret is missing.");

  const stream = JSON.parse(fs.readFileSync(streamPath, "utf8"));
  const { nextmessage } = JSON.parse(fs.readFileSync(nextPath, "utf8"));

  if (!Array.isArray(stream.contents)) {
    throw new Error("messages.json must contain a contents array.");
  }
  if (nextmessage?.role !== "user" ||
      !Array.isArray(nextmessage.parts) ||
      !nextmessage.parts.some(part => typeof part.text === "string")) {
    throw new Error("nextmessage.json must contain a user message with text.");
  }

  // The supplied starter stream already ends with the same sample user turn.
  // Avoid sending that turn twice when the nextmessage file has not changed.
  const last = stream.contents.at(-1);
  if (last?.role === "user" &&
      JSON.stringify(last) === JSON.stringify(nextmessage)) {
    // The pending turn is already in the stream.
  } else {
    stream.contents.push(nextmessage);
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({ contents: stream.contents }),
      signal: AbortSignal.timeout(120000)
    }
  );

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(body.error || body)}`);
  }

  const reply = body.candidates?.[0]?.content;
  if (reply?.role !== "model" ||
      !Array.isArray(reply.parts) || reply.parts.length === 0) {
    throw new Error("Gemini returned no model content; messages.json was not changed.");
  }

  stream.contents.push(reply);
  fs.writeFileSync(streamPath, JSON.stringify(stream, null, 2) + "\n");
  console.log("Appended the user turn and Gemini model reply.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
