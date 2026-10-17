"""Reusable guided storyboard-building screen implementation."""
import copy
import json
from .script_validation import identifier, validate_script, validate_screen
from .token_codec import encode

PHASES = ('START', 'ID', 'VERSION', 'BLURB', 'BUNDLE', 'ENTRY', 'CONFIG', 'VERIFY', 'REVIEW', 'SUCCESS', 'EXIT')
EXAMPLES = {'ID':'my-script', 'VERSION':'1', 'BLURB':'A guided procedure.',
            'BUNDLE':'["FIRST","SECOND"]', 'ENTRY':'FIRST',
            'CONFIG':'{"text":"Hello {name}","bindings":{"name":"Creator"},"blurb":"Read and continue."}'}


def advance(address, response, store):
    """Collect one value or apply one creator-approved navigation choice."""
    result = copy.deepcopy(address)
    phase, draft = result['screen'], result['bindings']
    value = str(response)
    if value == 'EXIT':
        result['screen'] = 'EXIT'
    elif phase == 'START' and value == 'BEGIN':
        result['screen'] = 'ID'
    elif phase in EXAMPLES:
        collect(phase, value, draft, store)
        draft['return_phase'] = phase
        result['screen'] = 'VERIFY'
    elif phase == 'VERIFY' and value in ('APPROVE', 'CANCEL'):
        result['screen'] = draft['return_phase'] if value == 'CANCEL' else next_phase(draft)
    elif phase == 'REVIEW' and value in ('SAVE', 'START_OVER'):
        if value == 'START_OVER':
            result['bindings'], result['screen'] = {}, 'ID'
        else:
            draft['compiled'] = compile_script(draft)
            store.check_publish(draft['compiled'])
            result['screen'] = 'SUCCESS'
    else:
        raise ValueError('Use a displayed choice, or supply the value requested by this input screen.')
    result['step'] += 1
    return result


def collect(phase, value, draft, store):
    """Validate and stage the value requested by one creator input screen."""
    if phase == 'ID':
        draft['id'] = identifier(value)
    elif phase == 'VERSION':
        version = json.loads(value)
        if type(version) is not int or version < 1:
            raise ValueError('Version must be a positive integer.')
        draft['version'] = version
    elif phase == 'BLURB':
        draft['description'] = value
    elif phase == 'BUNDLE':
        draft['screens'] = bundle(json.loads(value), store)
        draft['order'] = list(draft['screens'])
    elif phase == 'ENTRY':
        if value not in draft['screens'] or value == 'FINAL_SUCCESS':
            raise ValueError('Choose an entry screen from the displayed bundle, not FINAL_SUCCESS.')
        draft['entry'] = value
        draft['order'] = [value] + [name for name in draft['order'] if name != value]
        draft['index'] = 0
    elif phase == 'CONFIG':
        config = json.loads(value)
        if not isinstance(config, dict) or set(config) - {'text', 'bindings', 'blurb', 'binding_paths'}:
            raise ValueError('Enter text, bindings, optional blurb and optional binding_paths presentation.')
        screen = copy.deepcopy(config)
        screen.setdefault('bindings', {})
        screen.setdefault('blurb', '')
        screen['terminal'], screen['transitions'] = True, {}
        validate_screen(screen, {}, allow_unwired_paths=True)
        draft['candidate'] = screen


def bundle(items, store):
    """Bundle named blank screens or versioned text-screen references."""
    if not isinstance(items, list) or not items or len(items) > 30:
        raise ValueError('Enter an array of 1–30 screen names or references.')
    screens = {}
    for item in items:
        name = identifier(item if isinstance(item, str) else item['id'])
        if name in screens or name == 'FINAL_SUCCESS':
            raise ValueError('Screen IDs must be unique; FINAL_SUCCESS is reserved.')
        screen = {'text':'', 'bindings':{}, 'blurb':''}
        if isinstance(item, dict):
            if type(item.get('version')) is not int or item['version'] < 1:
                raise ValueError('Referenced screen version must be a positive integer.')
            source = store.script(identifier(item['script']), item['version'])['screens'][item['screen']]
            if 'handler' in source:
                raise ValueError('Bundle ordinary text screens, not a builder handler.')
            screen.update({key:copy.deepcopy(source.get(key, screen[key])) for key in screen})
            screen['source'] = {key:item[key] for key in ('script', 'version', 'screen')}
        if isinstance(item, dict) and 'binding_paths' in source:
            screen['binding_paths'] = copy.deepcopy(source['binding_paths'])
        screens[name] = screen
    screens['FINAL_SUCCESS'] = {'text':'Procedure completed successfully.', 'bindings':{}, 'blurb':''}
    return screens


def next_phase(draft):
    """Commit an approved staged value and select the next creator field."""
    phase = draft['return_phase']
    if phase == 'CONFIG':
        name = draft['order'][draft['index']]
        source = draft['screens'][name].get('source')
        draft['screens'][name] = draft.pop('candidate')
        if source:
            draft['screens'][name]['source'] = source
        draft['index'] += 1
        return 'CONFIG' if draft['index'] < len(draft['order']) else 'REVIEW'
    return {'ID':'VERSION', 'VERSION':'BLURB', 'BLURB':'BUNDLE', 'BUNDLE':'ENTRY', 'ENTRY':'CONFIG'}[phase]


def compile_script(draft):
    """Bind the chosen storyboard order to reusable CONTINUE transitions."""
    script = {key:copy.deepcopy(draft[key]) for key in ('id', 'version', 'description', 'entry', 'screens')}
    for index, name in enumerate(draft['order']):
        final = index == len(draft['order']) - 1
        script['screens'][name]['terminal'] = final
        script['screens'][name]['transitions'] = {} if final else {'CONTINUE':draft['order'][index + 1]}
    return validate_script(script)


def apply_effect(address, store):
    """Publish only on actual arrival at the approved success screen."""
    if address['screen'] == 'SUCCESS':
        store.publish_script(address['bindings']['compiled'])


def view(address):
    """Describe the current creator screen and its displayed input contract."""
    phase, draft = address['screen'], address['bindings']
    if phase in EXAMPLES:
        text = input_prompt(phase, draft)
        return text, [EXAMPLES[phase], 'EXIT']
    if phase == 'START':
        return 'SCRIPT BUILDER — Bundle screens, choose entry, configure text/bindings, verify, then save. BEGIN starts.', ['BEGIN', 'EXIT']
    if phase == 'VERIFY':
        field = draft['return_phase']
        keys = {'ID':'id', 'VERSION':'version', 'BLURB':'description', 'BUNDLE':'screens', 'ENTRY':'entry', 'CONFIG':'candidate'}
        return 'VERIFY '+field+'\n'+json.dumps(draft[keys[field]], indent=2)+'\nAPPROVE continues. CANCEL re-enters this field.', ['APPROVE','CANCEL','EXIT']
    if phase == 'REVIEW':
        return 'REVIEW COMPLETE STORYBOARD\n'+json.dumps(compile_script(draft), indent=2)+'\nSAVE publishes this immutable version. START_OVER discards the draft.', ['SAVE','START_OVER','EXIT']
    if phase == 'SUCCESS':
        script = draft['compiled']
        token = encode({'script':script['id'],'version':script['version'],'screen':script['entry'],
                        'bindings':{},'step':0,'terminal':address.get('terminal')})
        return 'SCRIPT BUILDER SUCCESS — Saved '+script['id']+' v'+str(script['version'])+'\nStart command: transaction('+json.dumps({'value':token})+')', []
    return 'Builder exited. No draft was published.', []


def input_prompt(phase, draft):
    """Explain one typed value input without requiring spreadsheet writes."""
    prompts = {'ID':'Enter script ID.', 'VERSION':'Enter positive integer version.',
               'BLURB':'Enter the script description/blurb as plain text.',
               'BUNDLE':'Enter a JSON array of screen IDs, or references: {"id":"LOCAL","script":"demo","version":1,"screen":"START"}. FINAL_SUCCESS is appended.',
               'ENTRY':'Choose entry from '+', '.join(draft.get('order', []))+'. It moves to the front; remaining screens keep their order.',
               'CONFIG':'Set text, bindings and blurb for '+current_name(draft)+'. Current defaults: '+json.dumps(draft.get('screens', {}).get(current_name(draft), {}))}
    return prompts[phase]+'\nSend transaction with the terminal ID as value and your entry as response. The displayed response is an example; replace it with your value. EXIT discards the draft.'


def current_name(draft):
    """Return the screen currently being configured, if one is selected."""
    order = draft.get('order', [])
    index = draft.get('index', 0)
    return order[index] if index < len(order) else ''
