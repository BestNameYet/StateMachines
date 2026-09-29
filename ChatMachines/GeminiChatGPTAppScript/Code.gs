/**
 * Gemini caller for a Google Apps Script web app.
 *
 * POST JSON:
 * {
 *   "contents": [
 *     { "role": "user", "parts": [{ "text": "Earlier user turn" }] },
 *     { "role": "model", "parts": [{ "text": "Earlier model reply" }] },
 *     { "role": "user", "parts": [{ "text": "Latest user turn" }] }
 *   ],
 *   "systemInstruction": {
 *     "parts": [{ "text": "Optional instructions" }]
 *   }
 * }
 *
 * Set GEMINI_API_KEY in Apps Script Script Properties before deployment.
 * The response returns the Gemini model content in the same role/parts shape.
 *
 * @param {GoogleAppsScript.Events.DoPost} e Original POST event.
 * @return {GoogleAppsScript.Content.TextOutput} JSON response.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Missing JSON POST body.");
    }

    const request = JSON.parse(e.postData.contents);
    validateConversation_(request);

    const apiKey = PropertiesService.getScriptProperties()
      .getProperty("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY Script Property is missing.");
    }

    const payload = { contents: request.contents };
    if (request.systemInstruction !== undefined) {
      payload.systemInstruction = request.systemInstruction;
    }

    const response = UrlFetchApp.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "post",
        contentType: "application/json",
        headers: { "x-goog-api-key": apiKey },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );

    const body = JSON.parse(response.getContentText());
    if (response.getResponseCode() < 200 ||
        response.getResponseCode() >= 300) {
      throw new Error(
        "Gemini HTTP " + response.getResponseCode() +
        ": " + JSON.stringify(body.error || body)
      );
    }

    const modelReply = body.candidates &&
      body.candidates[0] &&
      body.candidates[0].content;

    if (!modelReply ||
        modelReply.role !== "model" ||
        !Array.isArray(modelReply.parts) ||
        modelReply.parts.length === 0) {
      throw new Error("Gemini returned no model content.");
    }

    return jsonOutput_({ ok: true, content: modelReply });
  } catch (error) {
    return jsonOutput_({
      ok: false,
      error: { message: error.message || String(error) }
    });
  }
}

/**
 * Validates the Gemini conversation request shape.
 *
 * @param {{contents: Array, systemInstruction: Object=}} request
 * @return {void}
 */
function validateConversation_(request) {
  if (!request ||
      !Array.isArray(request.contents) ||
      request.contents.length === 0) {
    throw new Error("contents must be a nonempty array.");
  }

  request.contents.forEach(function (turn, index) {
    if (!turn ||
        (turn.role !== "user" && turn.role !== "model") ||
        !Array.isArray(turn.parts) ||
        turn.parts.length === 0 ||
        !turn.parts.every(function (part) {
          return part && typeof part.text === "string";
        })) {
      throw new Error("Invalid role/parts shape at contents[" + index + "].");
    }
  });

  if (request.contents[request.contents.length - 1].role !== "user") {
    throw new Error("The final contents element must be a user turn.");
  }

  if (request.systemInstruction !== undefined &&
      (!request.systemInstruction ||
       !Array.isArray(request.systemInstruction.parts) ||
       !request.systemInstruction.parts.every(function (part) {
         return part && typeof part.text === "string";
       }))) {
    throw new Error("Invalid systemInstruction.parts shape.");
  }
}

/**
 * @param {*} value
 * @return {GoogleAppsScript.Content.TextOutput}
 */
function jsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
