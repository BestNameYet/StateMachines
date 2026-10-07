"""Project-specific native view guard: HOLD exposes only a bounded wait."""
import importlib.util
import sys
import json
from pathlib import Path
from .token_codec import encode
from .address_codec import encode_request

PHASE_SCREEN = {
    "MASTER_STATE_TASK": "MASTER_STATE_TASK",
    "MASTER_DECOMPOSE": "MASTER_DECOMPOSE",
    "SLAVE_WORK": "SLAVE_EXECUTE",
    "MASTER_EVALUATE": "MASTER_EVALUATE",
    "MASTER_BLOCKED": "MASTER_EVALUATE",
}

def context(runner, address):
    if address["script"] != "two-agent-coordination" or int(address["version"]) < 2:
        return None
    screen = runner._screen(address)
    if {**screen.get("bindings", {}), **address.get("bindings", {})}.get("coordination_gate") != "hold-v2":
        return None
    bindings = {**screen["bindings"], **address.get("bindings", {})}
    engine_path = Path(screen["bindings"]["engine"]).resolve()
    db = Path(bindings["db"])
    if not db.is_file():
        if address["screen"] == "MASTER_STATE_TASK" and str(address.get("terminal")) == "2":
            return None  # Entry explicitly instructs the master to initialize a new run.
        raise ValueError("Coordinator database is missing; initialize the workflow at TerminalA.")
    cache = getattr(runner, "_coordination_engines", {})
    key = (str(engine_path), engine_path.stat().st_mtime_ns)
    if key not in cache:
        spec = importlib.util.spec_from_file_location("coordination_gate_engine", engine_path)
        engine = importlib.util.module_from_spec(spec)
        sys.path.insert(0, str(engine_path.parent))
        try:
            spec.loader.exec_module(engine)
        finally:
            sys.path.remove(str(engine_path.parent))
        cache[key] = engine
        runner._coordination_engines = cache
    engine = cache[key]
    with engine.closing(engine._connect(db)) as conn:
        state = engine._load(conn)
    mapping = {"2": state["terminal_a"], "3": state["terminal_b"]}
    try:
        terminal = mapping[str(address.get("terminal"))]
    except KeyError:
        raise ValueError("This coordination script uses native terminals 2 and 3.") from None
    return {"engine": engine, "db": db, "terminal": terminal, "packet": engine._packet(state, terminal)}

def advance(address, response, ctx):
    # Native routing is a trusted display operation, never a coordinator decision.
    if str(response) == "wait<30>":
        ctx["engine"].wait(ctx["db"], ctx["terminal"], timeout=30)
        return {**address, "step": int(address["step"]) + 1}
    if ctx["packet"]["status"] == "HOLD":
        return dict(address)  # Old/hidden actions re-render HOLD; no system-denied error.
    return None

def render(runner, address, ctx):
    packet = ctx["packet"]
    address = {**address, "bindings": {**address.get("bindings", {}), "coordination_revision": packet["revision"]}}
    held = packet["status"] == "HOLD"
    ended = packet["status"] == "TERMINAL"
    if held:
        address["screen"] = "HOLD"
        text, options = packet["render"].split("\n\npathA -", 1)[0], ["wait<30>"]
        token = encode(address)
        commands = [{"value": token, "response": "wait<30>", "terminal": address["terminal"]}]
    else:
        if ended:
            address["screen"] = "FINAL_SUCCESS" if address["screen"] == "FINAL_SUCCESS" else "MASTER_FINAL_CHECK"
        else:
            address["screen"] = PHASE_SCREEN[packet["phase"]]
        screen = runner._screen(address)
        text = runner._text(screen, address)
        options = list(screen.get("transitions", {}))
        token = encode(address)
        commands = [runner._command(address, option) for option in options]
    input_value = None if held else (
        packet["submission"] if packet["phase"] == "MASTER_EVALUATE" else
        packet["feedback"] if packet["phase"] == "MASTER_BLOCKED" else
        packet["semantic_subtask"] if packet["phase"] == "SLAVE_WORK" else packet["task"])
    if input_value is not None:
        text += "\n\nCaptured input for this processing screen:\n" + json.dumps(input_value, ensure_ascii=True, indent=2)
    return {
        "screen_role": "hold" if held else "processing",
        "input": input_value,
        "status": "HOLD" if held else "TERMINAL" if ended and not options else "ACTIVE",
        "terminal": address["terminal"], "in_token": token, "out_token": token,
        "render": text, "options": options, "commands": commands,
        "addresses": ["/resolve/" + encode_request(command) for command in commands],
    }
