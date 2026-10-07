"""Resolve, render, and advance the virtual terminal."""

import json
from .store import DefinitionStore
from .address_codec import encode_request
from .token_codec import decode, encode
from . import script_builder, coordination_gate, screen_paths


class Runner:
    """Execute the fixed alias/token/response machine."""
    def __init__(self, store: DefinitionStore):
        self.store = store
    def transaction(self, value, response=None, terminal=None) -> dict:
        """Resolve an alias or token, optionally advance, then render."""
        address = self._address(value)
        if terminal is not None:
            address["terminal"] = terminal
        if response is not None:
            address = self._advance(address, response)
        if self._screen(address).get('handler') == 'script_builder':
            script_builder.apply_effect(address, self.store)
        result = self._render(address)
        effective = decode(result["out_token"])
        screen = self._screen(effective)
        metadata = screen.get("binding_paths", screen.get("bindings", {}).get("binding_paths"))
        if result["status"] == "HOLD":
            metadata = {}  # Hidden normal paths never survive into the HOLD view.
        bindings = {**screen.get("bindings", {}), **effective.get("bindings", {})}
        overrides = effective.get("bindings", {}).get("binding_paths", {})
        if result["status"] != "HOLD" and overrides:
            metadata = {name: dict(value) for name, value in (metadata or {}).items()}
            for name, value in overrides.items():
                if not isinstance(value, dict) or set(value) - {"optional_title_rendered_text", "optional_description"}:
                    raise ValueError("Invocation path overrides may change only optional presentation text.")
                metadata[name] = {**metadata.get(name, {}), **value}
        return screen_paths.attach_paths(result, metadata, bindings)
    def _address(self, value) -> dict:
        """Turn an alias or serialized token into one address."""
        if isinstance(value, dict) and "alias" in value:
            return dict(self.store.alias(str(value["alias"])))
        if isinstance(value, str):
            return decode(value)
        raise ValueError("expected {'alias': name} or token string")
    def _advance(self, address: dict, response) -> dict:
        """Validate one response and follow its bound transition."""
        ctx = coordination_gate.context(self, address)
        if ctx and address["screen"] == "HOLD" and str(response) == "pathA":
            response = "wait<30>"  # The displayed wait path never becomes a task action.
        screen = self._screen(address)
        handler = screen.get("handler")
        finite = handler != "script_builder" or address["screen"] not in script_builder.EXAMPLES
        if finite:
            options = (["wait<30>"] if ctx and ctx["packet"]["status"] == "HOLD" else
                       script_builder.view(address)[1] if handler == "script_builder" else
                       list(screen.get("transitions", {})))
            for index, option in enumerate(options):
                if str(response) == screen_paths.path_name(index):
                    response = option
                    break
        if ctx:
            held = coordination_gate.advance(address, response, ctx)
            if held is not None:
                return held
        if self._screen(address).get('handler') == 'script_builder':
            return script_builder.advance(address, response, self.store)
        transitions = self._screen(address).get("transitions", {})
        key = str(response)
        if key not in transitions:
            raise ValueError(f"response not accepted: {key}")
        advanced = dict(address)
        advanced["screen"] = transitions[key]
        advanced["step"] = int(address["step"]) + 1
        return advanced
    def _render(self, address: dict) -> dict:
        """Return the visible terminal state for one address."""
        ctx = coordination_gate.context(self, address)
        if ctx:
            return coordination_gate.render(self, address, ctx)
        screen = self._screen(address)
        if screen.get('handler') == 'script_builder':
            return self._render_builder(address)
        token = encode(address)
        options = list(screen.get("transitions", {}))
        commands = [self._command(address, option) for option in options]
        return {
            "status": "TERMINAL" if screen.get("terminal") else "WAITING_FOR_AGENT",
            "terminal": address.get("terminal"),
            "in_token": token,
            "render": self._text(screen, address),
            "options": options,
            "commands": commands,
            "addresses": ["/resolve/" + encode_request(command) for command in commands],
            "out_token": token,
        }

    def _text(self, screen, address):
        """Populate a screen's local defaults, optional blurb, and text."""
        bindings = {**screen.get('bindings', {}), **address.get('bindings', {})}
        return '\n\n'.join(part.format_map(bindings) for part in
                           (screen.get('blurb', ''), screen['text']) if part)

    def _render_builder(self, address):
        """Project reusable builder screens into the normal terminal contract."""
        text, options = script_builder.view(address)
        commands = []
        for option in options:
            try:
                commands.append({'value':encode(script_builder.advance(address, option, self.store)),
                                 'terminal':address.get('terminal')})
            except (ValueError, KeyError, TypeError):
                commands.append({'value':encode(address), 'terminal':address.get('terminal')})
        if len(text) > 45000 or len(json.dumps([command['value'] for command in commands])) > 45000:
            raise ValueError('Draft exceeds the terminal cell limit; shorten text/bindings or bundle fewer screens.')
        return {'status':'TERMINAL' if not options else 'WAITING_FOR_AGENT',
                'terminal':address.get('terminal'), 'in_token':encode(address),
                'out_token':encode(address), 'render':text, 'options':options,
                'commands':commands, 'addresses':[]}

    def _command(self, address: dict, response: str) -> dict:
        """Precompute the OutToken selected by one screen response."""
        advanced = self._advance(address, response)
        command = {"value": encode(advanced)}
        if "terminal" in advanced:
            command["terminal"] = advanced["terminal"]
        return command
    def _screen(self, address: dict) -> dict:
        """Locate the screen addressed by a token."""
        script = self.store.script(address["script"], int(address["version"]))
        try:
            return script["screens"][address["screen"]]
        except KeyError as exc:
            raise LookupError(f"screen not found: {address['screen']}") from exc
