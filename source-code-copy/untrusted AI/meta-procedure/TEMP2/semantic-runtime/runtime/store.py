"""Read immutable versioned definitions from ordinary JSON files."""
import json
from pathlib import Path
from .script_validation import validate_script

class DefinitionStore:
    """Resolve aliases and versioned scripts from one directory."""
    def __init__(self, root: str | Path):
        self.root = Path(root)
    def alias(self, name: str) -> dict:
        """Return the initial address assigned to an alias."""
        return self._read(self.root / "aliases" / f"{name}.json")
    def catalog(self) -> list:
        """List installed entry aliases whose script and screen resolve."""
        entries = []
        for path in sorted((self.root / "aliases").glob("*.json")):
            address = self._read(path)
            script = self.script(address["script"], address["version"])
            if address["screen"] not in script["screens"]:
                raise LookupError(f"Invalid entry screen for alias: {path.stem}")
            entries.append({"alias": path.stem, "entry": address})
        return entries
    def script(self, name: str, version: int) -> dict:
        """Return one immutable script version."""
        return self._read(self.root / "scripts" / f"{name}.v{version}.json")
    def check_publish(self, script):
        """Validate a new version and reject changes to an existing version."""
        validate_script(script)
        path = self.root / 'scripts' / f"{script['id']}.v{script['version']}.json"
        if path.exists() and self._read(path) != script:
            raise ValueError('This version already exists. Choose a new version; old versions are immutable.')
        return path

    def publish_script(self, script):
        """Create an approved definition, allowing identical delivery retries."""
        path = self.check_publish(script)
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with path.open('x', encoding='utf-8') as output:
                json.dump(script, output, indent=2, ensure_ascii=False)
        except FileExistsError:
            if self._read(path) != script:
                raise ValueError('Version already exists with different content.') from None
        return path
    def terminal(self, identifier) -> dict:
        """Return the canonical Sheet location for one terminal."""
        directory = self._read(self.root / "terminals.json")
        key = str(identifier)
        try:
            terminal = dict(directory["terminals"][key])
        except KeyError as exc:
            raise LookupError(f"terminal not found: {key}") from exc
        spreadsheet_id = directory["spreadsheet_id"]
        terminal["id"] = identifier
        terminal["spreadsheet_id"] = spreadsheet_id
        terminal["url"] = (
            f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit"
            f"?gid={terminal['gid']}#gid={terminal['gid']}"
        )
        return terminal
    @staticmethod
    def _read(path: Path) -> dict:
        """Read one JSON object or fail with its exact missing address."""
        if not path.is_file():
            raise LookupError(f"definition not found: {path.name}")
        return json.loads(path.read_text(encoding="utf-8"))
