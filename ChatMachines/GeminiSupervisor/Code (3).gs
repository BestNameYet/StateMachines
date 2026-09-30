/**
 * Executes a function supplied in the JSON POST body and returns its
 * result as a JSON HTTP response.
 *
 * Expected POST body:
 * {
 *   "sourcecode": "(input) => { return input; }",
 *   "arguments": { "example": "value" }
 * }
 *
 * Contract:
 * - sourcecode must evaluate to a callable JavaScript function.
 * - arguments is passed to that function as one argument.
 * - The function may name its parameter however it chooses.
 * - The function must return a JSON-serializable value.
 *
 * @param {GoogleAppsScript.Events.DoPost} e
 *   POST event supplied by the Apps Script web app.
 * @return {GoogleAppsScript.Content.TextOutput}
 *   The function's result serialized as JSON.
 */
function doPost(e) {
  // Parse the POST body and extract the program and its input.
  const { sourcecode, arguments: args } = JSON.parse(e.postData.contents);

  // Evaluate the source to obtain a function, then call it with args.
  const result = eval(sourcecode)(args);

  // Serialize the result and return an HTTP response with JSON MIME type.
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
