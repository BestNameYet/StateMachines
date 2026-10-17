"""Alphabetical binding path identities and reproducible presentation text."""
import re

def path_name(index):
    if type(index) is not int or index < 0:
        raise ValueError("Path index must be a nonnegative integer")
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return "path" + letters

def render_paths(options, metadata=None, bindings=None):
    metadata = {} if metadata is None else metadata
    bindings = {} if bindings is None else bindings
    if not isinstance(metadata, dict):
        raise ValueError("binding_paths must be an object")
    allowed = {path_name(i) for i in range(len(options))}
    if set(metadata) - allowed:
        raise ValueError("Path declarations must match the exposed alphabetical menu")
    paths = []
    for i, option in enumerate(options):
        name = path_name(i)
        spec = metadata.get(name, {})
        if not isinstance(spec, dict):
            raise ValueError("Each path declaration must be an object")
        if spec.get("name", name) != name or spec.get("binding_name", option) != option:
            raise ValueError("Path name/binding_name cannot alter the selected binding")
        default_title = spec.get("default_title_rendered_text", option)
        default_description = spec.get("default_description",
            "Wait up to 30 seconds for this terminal's turn; timeout remains HOLD."
            if option == "wait<30>" else "Select " + option + ".")
        optional_title = spec.get("optional_title_rendered_text")
        optional_description = spec.get("optional_description")
        if not isinstance(default_title, str) or not default_title.strip() or not isinstance(default_description, str):
            raise ValueError("Every path needs a default title and default description")
        for value in (default_title, optional_title):
            if value is not None and (not isinstance(value, str) or not value.strip()):
                raise ValueError("Rendered path titles must be nonempty text")
        for value in (default_description, optional_description):
            if value is not None and not isinstance(value, str):
                raise ValueError("Path descriptions must be text")
        def rendered(value):
            return None if value is None else value.format_map(bindings)
        default_title = rendered(default_title) if "default_title_rendered_text" in spec else default_title
        default_description = rendered(default_description) if "default_description" in spec else default_description
        optional_title, optional_description = rendered(optional_title), rendered(optional_description)
        title = default_title if optional_title is None else optional_title
        if not title.strip():
            raise ValueError("Effective path title must be nonempty")
        paths.append({
            "name": name, "binding_name": option,
            "default_title_rendered_text": default_title,
            "optional_title_rendered_text": optional_title,
            "default_description": default_description,
            "optional_description": optional_description,
            "title_rendered_text": title,
            "description": default_description if optional_description is None else optional_description,
        })
    return paths

def attach_paths(result, metadata=None, bindings=None):
    paths = render_paths(result.get("options", []), metadata, bindings)
    result = {**result, "binding_paths": paths}
    if paths:
        result["render"] += "\n\n" + "\n".join(
            p["name"] + " - " + p["title_rendered_text"] +
            ("\n" + p["description"] if p["description"] else "") for p in paths)
    return result
