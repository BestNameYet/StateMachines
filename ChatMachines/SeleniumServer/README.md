# Selenium Server test runner

A GitHub Actions job runs Selenium Server, ChromeDriver, and Chromium in the official standalone Chromium container. A Node.js client sends WebDriver commands to that server. The browser opens a URL, locates controls by CSS selector, and performs native clicks and typing. Each job has a fresh session and saves its results as an Actions artifact.

## Layout

- `.github/workflows/selenium-server.yml`: workflow entry point at the repository root.
- `ChatMachines/SeleniumServer/`: this runner, configuration, and sample test page.

## Inputs

`request.json` is the default test. Editing it and committing to `main` triggers the workflow. The workflow also accepts manual runs and authenticated API POSTs.

Manual run: Actions → Selenium Server test → Run workflow. Leave `request_json` blank to use the committed request, or provide the complete request as a JSON string.

Workflow API: POST `/repos/OWNER/REPO/actions/workflows/selenium-server.yml/dispatches` with `{"ref":"main","inputs":{"request_json":"<JSON-encoded request>"}}`.

Repository dispatch API: POST `/repos/OWNER/REPO/dispatches` with `{"event_type":"selenium-test","client_payload":{"request":{...}}}`. This route uses the workflow on the default branch. Its payload must contain a request object.

The POST starts a job; retrieve the result afterward from the workflow run. It does not expose an always-running public Selenium endpoint.

## Request shape

```json
{
  "url": "https://example.com",
  "timeout_ms": 10000,
  "steps": [
    {"action":"wait_for","selector":"h1"},
    {"action":"read_text","selector":"h1"},
    {"action":"screenshot","name":"page"}
  ]
}
```

Supported actions: `navigate`, `wait_for`, `click`, `type`, `press_key`, `assert_text`, `read_text`, `read_attribute`, and `screenshot`.

- Element actions use a CSS `selector`. Elements must be visible; clicks and typing also require enabled elements.
- `type` requires `text` and clears the field unless `clear:false` is set.
- `press_key` requires `key`, such as `ENTER`, `TAB`, or `ARROW_LEFT`.
- `assert_text` requires `text`. It compares exactly unless `contains:true` is set.
- `read_attribute` requires `attribute`.
- `navigate` requires an HTTP(S) `url`.
- `screenshot` optionally accepts an artifact `name` made of letters, digits, underscores, and hyphens.
- `timeout_ms` defaults to 10000, allowed range 100–120000. Maximum 100 steps. The workflow has a 20-minute overall limit.

The initial request URL and navigation URLs are HTTP(S). The default request opens the bundled fixture at `http://127.0.0.1:8080/ChatMachines/SeleniumServer/fixture.html`. The Selenium container uses the runner's host network so Chromium can reach that local server.

## Results

The `selenium-results-RUN_ID-ATTEMPT` artifact contains `result.json`, step screenshots, `final.png`, `final.html`, browser logs, Selenium logs, and local HTTP server logs where available. `result.json` records each step's outcome and the browser session/capabilities. Test or infrastructure failures fail the job; artifacts are still uploaded. Typing values are omitted from the per-step audit, but screenshots and captured page content reflect what the browser displayed.

## Development

Node.js 24 is configured in the workflow. Install dependencies in this folder with `npm install --ignore-scripts`. Run dependency-free runner tests with `node --test runner.test.cjs`. With a separately running Selenium endpoint, use `SELENIUM_REMOTE_URL=http://127.0.0.1:4444 node run.cjs`; by default outputs go to `selenium-results/` at the current working directory. `REQUEST_JSON` overrides event-based inputs for a direct local invocation.

The standalone Docker image and Selenium client versions are pinned in the workflow and package.json. The workflow binds its browser session to the temporary GitHub runner; it does not attach to another person's open browser.
