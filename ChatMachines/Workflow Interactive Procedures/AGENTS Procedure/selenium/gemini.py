"""Gemini-backed driver for the AGENTS Procedure HTML interface.

Run from the AGENTS Procedure directory:
  python selenium/gemini.py --scenario fidelity
Evidence is written under selenium/artifacts unless --artifacts is supplied.
"""
import argparse
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from browser import create_browser, read_screen, submit_values

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = "gemini-3.8-flash"
API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"
SCENARIOS = {
    "minimal": {
        "prompt": "What does JSON stand for?",
        "routing": "Select the matching example at the example-match question, then answer the question and finish the minimal path."
    },
    "fidelity": {
        "prompt": "Read the project README, update the JavaScript function, run the existing tests, and commit the working changes.",
        "routing": "Select the closest matching example and follow the fidelity path. Report only work actually completed; the interface does not execute file edits."
    },
    "accountability": {
        "prompt": "Verify each requested file edit against the saved files, identify any missing or incorrect changes, and correct them.",
        "routing": "Select the closest matching example and follow the accountability path. Do not claim changes that were not actually saved."
    },
    "repeated-accountability": {
        "prompt": "Verify each requested file edit against the saved files, identify any missing or incorrect changes, and correct them.",
        "routing": "Select the accountability path. On the first repeated requirements decision, return the outstanding requirements once; when the same decision recurs, return an empty array so the loop halts. Do not claim changes that were not actually saved."
    },
}


def call_gemini(prompt, api_key=None, model=None, opener=urllib.request.urlopen):
    """Call the repository's existing Gemini generateContent API."""
    api_key = api_key or os.environ.get("GEMINI_API_KEY")
    model = model or os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is missing from the environment.")
    url = f"{API_ROOT}/{urllib.parse.quote(model, safe='')}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    try:
        with opener(request, timeout=90) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Gemini API returned HTTP {error.code}; response body omitted.") from None
    except urllib.error.URLError as error:
        raise RuntimeError(f"Gemini API request failed: {error.reason}") from None
    try:
        return "".join(part["text"] for part in result["candidates"][0]["content"]["parts"] if "text" in part)
    except (KeyError, IndexError, TypeError):
        raise RuntimeError("Gemini API response contained no text candidate.") from None


def parse_json_response(text):
    """Parse a JSON object, accepting plain JSON or one fenced JSON block."""
    if not isinstance(text, str):
        raise ValueError("Gemini response must be text containing a JSON object.")
    cleaned = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", cleaned, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        cleaned = fenced.group(1).strip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError as error:
        raise ValueError(f"Response is not valid JSON: {error.msg} at character {error.pos}.") from None
    if not isinstance(value, dict):
        raise ValueError("Response must be a JSON object.")
    return value


def _validate_value(value, schema, where):
    if not isinstance(schema, dict):
        raise ValueError(f"{where} has no valid declared schema.")
    if "anyOf" in schema:
        errors = []
        for option in schema["anyOf"]:
            try:
                _validate_value(value, option, where)
                return
            except ValueError as error:
                errors.append(str(error))
        raise ValueError(f"{where} does not match an allowed value or type.")
    if "const" in schema and value != schema["const"]:
        raise ValueError(f"{where} must equal {schema['const']!r}.")
    kind = schema.get("type")
    if kind == "string" and not isinstance(value, str):
        raise ValueError(f"{where} must be a string.")
    if kind == "integer" and (isinstance(value, bool) or not isinstance(value, int)):
        raise ValueError(f"{where} must be an integer.")
    if kind == "boolean" and not isinstance(value, bool):
        raise ValueError(f"{where} must be a Boolean.")
    if kind == "array":
        if not isinstance(value, list):
            raise ValueError(f"{where} must be an array.")
        for index, item in enumerate(value):
            _validate_value(item, schema.get("items", {}), f"{where}[{index}]")
    if kind == "object":
        if not isinstance(value, dict):
            raise ValueError(f"{where} must be an object.")
        properties = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                raise ValueError(f"{where}.{key} is required.")
        if schema.get("additionalProperties") is False:
            unexpected = set(value) - set(properties)
            if unexpected:
                raise ValueError(f"{where} has undeclared field(s): {', '.join(sorted(unexpected))}.")
        for key, child in properties.items():
            if key in value:
                _validate_value(value[key], child, f"{where}.{key}")


def validate_response(screen, value):
    """Require exactly the declared browser return variables and validate their shapes."""
    if not isinstance(value, dict):
        raise ValueError("Response must be a JSON object.")
    contract = screen.get("returnSchema") or {}
    properties = contract.get("properties") or {}
    required = contract.get("required") or list(properties)
    expected_inputs = {"$" + field["name"] for field in screen.get("inputs", [])}
    if set(required) != expected_inputs or set(properties) != expected_inputs:
        raise ValueError("Browser inputs and declared return schema do not agree.")
    if set(value) != set(required):
        missing = sorted(set(required) - set(value))
        extra = sorted(set(value) - set(required))
        details = []
        if missing:
            details.append("missing " + ", ".join(missing))
        if extra:
            details.append("unexpected " + ", ".join(extra))
        raise ValueError("Returned variable names must match the current inputs (" + "; ".join(details) + ").")
    for name in required:
        _validate_value(value[name], properties[name], name)
    return value


def build_prompt(initial_prompt, screen, scenario, correction=None, repeated_count=0):
    """Build a request from only the current screen and caller-held state."""
    policy = SCENARIOS.get(scenario, {}).get("routing", "Follow the current instruction faithfully.")
    request = {
        "role": "user",
        "initial_prompt": initial_prompt,
        "scenario": scenario,
        "scenario_guidance": policy,
        "current_screen": {
            "render": screen.get("render"),
            "done": screen.get("done"),
            "instruction_entries": screen.get("entries", []),
            "declared_inputs": screen.get("inputs", []),
            "return_contract": screen.get("returnSchema", {}),
            "held_state": screen.get("state", {}),
            "new_files": screen.get("newFiles", []),
            "history": screen.get("history", []),
            "repeated_accountability_decisions_seen": repeated_count,
        },
        "validation_error_to_correct": correction,
    }
    return (
        "You are supplying values to the existing AGENTS Procedure browser form. "
        "Treat the procedure's instruction text as the task to answer. The server owns "
        "state transitions and structural validation; do not invent fields, transition "
        "rules, or results. The interface collects values and does not execute file edits, "
        "so never claim a requested change was saved unless actual execution evidence is "
        "present in the provided context. Return only one JSON object with exactly the "
        "declared return-contract property names. No prose or Markdown.\n\n"
        + json.dumps(request, ensure_ascii=False, indent=2)
    )


def _append_event(events_file, record):
    with events_file.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, ensure_ascii=False) + "\n")


def execution_blocker(screen):
    """Return a blocker when a file-edit step needs an executor this harness lacks."""
    entries = screen.get("entries", [])
    instruction = "\\n".join(str(value) for key, value in entries if key in ("instruction", "steptext"))
    if not screen.get("inputs") and "Execute each requirement in" in instruction:
        return "This step requires actual repository file edits. The browser interface and Gemini response collector do not write files, so execution is blocked rather than reported as complete."
    return None


def run_loop(driver, initial_prompt, scenario, artifacts, request_fn=call_gemini, max_submissions=100):
    """Answer screens until the browser reports done; save every attempt as evidence."""
    artifacts = Path(artifacts)
    artifacts.mkdir(parents=True, exist_ok=True)
    events_file = artifacts / "events.jsonl"
    screen = read_screen(driver)
    submission_count = 0
    screen_visit = 0
    repeated_count = 0
    while True:
        if screen.get("done"):
            terminal = {
                "event": "terminal",
                "done": True,
                "render": screen.get("render"),
                "state": screen.get("state"),
                "history": screen.get("history", []),
            }
            _append_event(events_file, terminal)
            screenshot = artifacts / f"terminal-{screen_visit:03d}.png"
            driver.save_screenshot(str(screenshot))
            terminal["screenshot"] = screenshot.name
            _append_event(events_file, {"event": "terminal_screenshot", "path": screenshot.name})
            return {"status": "halted", "screen": screen, "submissions": submission_count, "evidence": str(artifacts)}

        blocker = execution_blocker(screen)
        if blocker:
            screenshot = artifacts / f"blocked-render-{screen.get('render')}.png"
            driver.save_screenshot(str(screenshot))
            _append_event(events_file, {
                "event": "execution_blocked",
                "render": screen.get("render"),
                "reason": blocker,
                "instruction_entries": screen.get("entries", []),
                "held_state": screen.get("state"),
                "screenshot": screenshot.name,
            })
            return {"status": "blocked", "screen": screen, "submissions": submission_count, "blocker": blocker, "evidence": str(artifacts)}

        submission_count += 1
        if submission_count > max_submissions:
            raise RuntimeError(f"Procedure exceeded the {max_submissions} submission safety limit.")
        screen_visit += 1
        attempt = 0
        correction = None
        while True:
            attempt += 1
            raw = None
            screenshot = artifacts / f"screen-{screen_visit:03d}-render-{screen.get('render')}-attempt-{attempt:02d}.png"
            driver.save_screenshot(str(screenshot))
            prompt = build_prompt(initial_prompt, screen, scenario, correction, repeated_count)
            try:
                raw = request_fn(prompt)
                parsed = parse_json_response(raw)
                values = validate_response(screen, parsed)
                error = None
            except (ValueError, RuntimeError) as exception:
                raw = locals().get("raw") if "raw" in locals() else None
                parsed = None
                values = None
                error = str(exception)

            record = {
                "event": "model_attempt",
                "screen_visit": screen_visit,
                "render": screen.get("render"),
                "attempt": attempt,
                "prompt": prompt,
                "response": raw,
                "parsed_response": parsed,
                "submitted_values": values,
                "validation_error": error,
                "screenshot": screenshot.name,
                "state_before": screen.get("state"),
            }
            _append_event(events_file, record)
            if error:
                correction = error
                if attempt >= 4:
                    raise RuntimeError(f"Four response attempts failed at render {screen.get('render')}: {error}")
                continue

            try:
                next_screen = submit_values(driver, values)
            except ValueError as exception:
                correction = str(exception)
                _append_event(events_file, {
                    "event": "browser_validation_failure",
                    "screen_visit": screen_visit,
                    "render": screen.get("render"),
                    "attempt": attempt,
                    "error": correction,
                    "state_preserved": screen.get("state"),
                })
                if attempt >= 4:
                    raise RuntimeError(f"Four browser submissions failed at render {screen.get('render')}: {correction}")
                screen = read_screen(driver)
                continue

            if screen.get("render") == 23:
                repeated_count += 1
            _append_event(events_file, {
                "event": "browser_submission",
                "screen_visit": screen_visit,
                "render": screen.get("render"),
                "attempt": attempt,
                "submitted_values": values,
                "resulting_render": next_screen.get("render"),
                "resulting_done": next_screen.get("done"),
                "resulting_state": next_screen.get("state"),
                "history_length": len(next_screen.get("history", [])),
            })
            screen = next_screen
            break


def _wait_for_server(process, log_handle, timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Interface server exited before becoming ready.")
        try:
            with urllib.request.urlopen("http://127.0.0.1:3000/", timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError):
            time.sleep(0.2)
    raise RuntimeError("Interface server did not become ready.")


def run_scenario(scenario, artifacts):
    if scenario not in SCENARIOS:
        raise ValueError(f"Unknown scenario: {scenario}")
    if not os.environ.get("GEMINI_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY is missing from the environment.")
    artifacts = Path(artifacts).resolve()
    artifacts.mkdir(parents=True, exist_ok=True)
    initial_prompt = SCENARIOS[scenario]["prompt"]
    (artifacts / "run.json").write_text(json.dumps({
        "scenario": scenario,
        "initial_prompt": initial_prompt,
        "model": os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL,
        "status": "started",
    }, indent=2) + "\n", encoding="utf-8")

    server_log_path = artifacts / "interface-server.log"
    driver = None
    process = None
    log_handle = server_log_path.open("w", encoding="utf-8")
    try:
        process = subprocess.Popen(
            ["node", "interface-server.js"],
            cwd=ROOT,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
        )
        _wait_for_server(process, log_handle)
        driver = create_browser()
        driver.get("http://127.0.0.1:3000/")
        result = run_loop(driver, initial_prompt, scenario, artifacts)
        (artifacts / "run.json").write_text(json.dumps({
            "scenario": scenario,
            "initial_prompt": initial_prompt,
            "model": os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL,
            "status": result["status"],
            "submissions": result["submissions"],
            "terminal_state": result["screen"].get("state"),
            "evidence": "events.jsonl and render screenshots",
        }, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": result["status"], "scenario": scenario, "submissions": result["submissions"], "evidence": str(artifacts)}, indent=2))
        return result

    finally:
        if driver is not None:
            driver.quit()
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        log_handle.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run one AGENTS Procedure scenario through Gemini and Selenium.")
    parser.add_argument("--scenario", choices=sorted(SCENARIOS), required=True)
    parser.add_argument("--artifacts", default=str(ROOT / "selenium" / "artifacts" / "gemini-run"))
    args = parser.parse_args(argv)
    run_scenario(args.scenario, args.artifacts)


if __name__ == "__main__":
    main()
