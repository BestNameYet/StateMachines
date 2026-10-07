"""Validate a text storyboard before publishing its immutable version."""
import re
from string import Formatter
from .screen_paths import render_paths


def identifier(value):
    """Accept a filename-safe script, screen, or binding identifier."""
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,63}', value):
        raise ValueError('Use a letter followed by letters, digits, underscores or hyphens (max 64).')
    return value


def validate_script(script):
    """Require a complete reachable storyboard and resolvable text bindings."""
    identifier(script['id'])
    version = script['version']
    if type(version) is not int or version < 1:
        raise ValueError('Version must be a positive integer.')
    screens = script['screens']
    if not isinstance(screens, dict) or not screens:
        raise ValueError('Bundle at least one screen.')
    entry = script['entry']
    if entry not in screens:
        raise ValueError('Entry point is not in the bundle.')
    for name, screen in screens.items():
        identifier(name)
        validate_screen(screen, screens)
    reachable = walk(screens, entry)
    if reachable != set(screens):
        raise ValueError('Every bundled screen must be reachable from the entry point.')
    terminal = {name for name, screen in screens.items() if screen.get('terminal')}
    if not terminal or not all(reaches_success(screens, name, terminal) for name in reachable):
        raise ValueError('Every screen needs a path to final success.')
    return script


def validate_screen(screen, screens, allow_unwired_paths=False):
    """Check one text screen's bindings, blurb, and transition destinations."""
    if not isinstance(screen.get('text'), str) or not isinstance(screen.get('blurb', ''), str):
        raise ValueError('Text and blurb must be strings.')
    bindings = screen.get('bindings', {})
    if not isinstance(bindings, dict):
        raise ValueError('Bindings must be a JSON object.')
    for text in (screen['text'], screen.get('blurb', '')):
        for _, field, _, _ in Formatter().parse(text):
            if field is not None and (not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*', field) or field not in bindings):
                raise ValueError(f'Unbound or unsupported placeholder: {field}')
        text.format_map(bindings)
    metadata = screen.get("binding_paths", bindings.get("binding_paths"))
    if metadata is not None:
        if not isinstance(metadata, dict):
            raise ValueError("binding_paths must be an object")
        options = ([value.get("binding_name", "CONTINUE") for value in metadata.values()]
                   if allow_unwired_paths else list(screen.get("transitions", {})))
        try:
            render_paths(options, metadata, bindings)
        except KeyError as exc:
            raise ValueError("Unbound path presentation placeholder") from exc
    transitions = screen.get('transitions', {})
    if not isinstance(transitions, dict) or any(not isinstance(k, str) or not k or v not in screens for k, v in transitions.items()):
        raise ValueError('Transitions must map response strings to bundled screens.')
    if screen.get('terminal') and transitions:
        raise ValueError('Final success cannot have outgoing transitions.')
    if not screen.get('terminal') and not transitions:
        raise ValueError('A non-final screen needs a transition.')


def walk(screens, entry):
    """Return the screens reachable from one entry point."""
    seen, pending = set(), [entry]
    while pending:
        name = pending.pop()
        if name not in seen:
            seen.add(name)
            pending.extend(screens[name].get('transitions', {}).values())
    return seen


def reaches_success(screens, name, terminal):
    """Check that some continuation leads to a terminal success screen."""
    return bool(walk(screens, name) & terminal)
