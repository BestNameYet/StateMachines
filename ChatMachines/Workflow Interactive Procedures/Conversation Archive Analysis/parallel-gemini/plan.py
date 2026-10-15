"""Validate a parallel assignment batch and produce its Actions matrix."""
import json
from datetime import datetime
import os
from pathlib import Path
import subprocess

TRIGGER = 'ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/parallel-gemini/trigger.json'


def build(config, root):
    paths = config.get('paths')
    instruction = config.get('instruction')
    parallel = config.get('maxParallel', 4)
    if not isinstance(paths, list) or not 1 <= len(paths) <= 256:
        raise ValueError('paths must contain 1 to 256 repository paths')
    if any(not isinstance(p, str) or not p.strip() for p in paths) or len(set(paths)) != len(paths):
        raise ValueError('paths must be nonempty, distinct strings')
    if not isinstance(instruction, str) or not instruction.strip():
        raise ValueError('instruction must be nonempty text')
    if isinstance(parallel, bool) or not isinstance(parallel, int) or not 1 <= parallel <= 16:
        raise ValueError('maxParallel must be an integer from 1 to 16')
    root = Path(root).resolve()
    for p in paths:
        relative = Path(p)
        target = root / relative
        if relative.is_absolute() or '..' in relative.parts or target.is_symlink() or not target.resolve().is_relative_to(root) or not target.exists():
            raise ValueError('Invalid or missing assigned path: ' + p)
    return {'include': [{'index': i, 'path': p} for i, p in enumerate(paths)]}, parallel, instruction


def main():
    root = Path.cwd()
    out = root / 'parallel-plan'
    out.mkdir(exist_ok=True)
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    live = os.environ['GITHUB_EVENT_NAME'] == 'workflow_dispatch'
    if live:
        inputs = event.get('inputs') or {}
        config = {'paths': json.loads(inputs['paths']), 'instruction': inputs['instruction'],
                  'maxParallel': int(inputs.get('maxParallel', 4))}
    else:
        before = event.get('before', '')
        changed = subprocess.check_output(['git','diff','--name-only',before,os.environ['GITHUB_SHA']],text=True).splitlines() if before and set(before) != {'0'} else []
        config = json.loads((root / TRIGGER).read_text())
        if type(config.get('enabled')) is not bool:
            raise ValueError('Trigger enabled must be Boolean')
        datetime.fromisoformat(config['timestamp'].replace('Z','+00:00'))
        live = TRIGGER in changed and config['enabled']
    if live:
        matrix, parallel, instruction = build(config, root)
    else:
        matrix, parallel, instruction = {'include': []}, 4, ''
    (out / 'instruction.txt').write_text(instruction)
    (out / 'assignments.json').write_text(json.dumps(matrix['include'], indent=2)+'\n')
    with open(os.environ['GITHUB_OUTPUT'],'a') as stream:
        stream.write('live='+str(live).lower()+'\n')
        stream.write('matrix='+json.dumps(matrix)+'\n')
        stream.write('parallel='+str(parallel)+'\n')
        stream.write('count='+str(len(matrix['include']))+'\n')

if __name__=='__main__': main()
