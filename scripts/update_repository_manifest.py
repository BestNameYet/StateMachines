#!/usr/bin/env python3
"""Index the Git-tracked repository without opening or following its files."""
import json
import re
import subprocess
from pathlib import Path, PurePosixPath
from urllib.parse import quote

START = '<!-- repository-readmes:start -->'
END = '<!-- repository-readmes:end -->'


def build_manifest(paths, previous):
    if previous.get('schema_version') != 1 or not isinstance(previous.get('entries'), list):
        raise ValueError('Expected manifest schema_version 1 and an entries array')
    old = {}
    for entry in previous['entries']:
        path = entry['path']
        if path in old or not isinstance(entry.get('description'), str):
            raise ValueError('Duplicate path or non-string description in manifest')
        old[path] = entry
    files = set(paths)
    directories = {'.'}
    for path in files:
        directories.update(str(parent) for parent in PurePosixPath(path).parents)
    readmes = sorted(p for p in files if re.fullmatch(r'readme(?:[._-].*)?', PurePosixPath(p).name, re.I))
    by_directory = {}
    for path in readmes:
        by_directory.setdefault(str(PurePosixPath(path).parent), []).append(path)
    entries = []
    for path in sorted(files | directories):
        kind = 'directory' if path in directories else 'file'
        associated = by_directory.get(path, []) if kind == 'directory' else ([path] if path in readmes else [])
        entry = dict(old.get(path, {}))
        entry.update(path=path, type=kind, description=entry.get('description', ''),
                     readmes=[{'path': p, 'href': './' + quote(p, safe='/')} for p in associated])
        entries.append(entry)
    return {'schema_version': 1, 'entries': entries}, readmes


def update_readme(text, readmes):
    if text.count(START) != 1 or text.count(END) != 1 or text.index(START) >= text.index(END):
        raise ValueError('README must contain exactly one ordered pair of index markers')
    rows = ['| README |', '| --- |']
    for path in readmes:
        if path == 'README.md':
            continue
        label = path.replace('\\', '\\\\').replace('|', '&#124;').replace('[', '\\[').replace(']', '\\]').replace('\n', ' ').replace('\r', ' ')
        rows.append(f'| [{label}](./{quote(path, safe="/")}) |')
    before, remainder = text.split(START)
    _, after = remainder.split(END)
    return before + START + '\n\n' + '\n'.join(rows) + '\n\n' + END + after


def main():
    root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
    # Git's index recursively covers all tracked paths, including dot-directories.
    # NUL separators preserve spaces, Unicode, and unusual path characters.
    paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode('utf-8').split('\0')
    manifest_path = root / 'manifest.json'
    previous = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest, readmes = build_manifest([p for p in paths if p], previous)
    readme_path = root / 'README.md'
    readme = update_readme(readme_path.read_text(encoding='utf-8'), readmes)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    readme_path.write_text(readme, encoding='utf-8')
    print(f'Indexed {len(manifest["entries"])} files/directories and {len(readmes)} READMEs')


if __name__ == '__main__':
    main()
