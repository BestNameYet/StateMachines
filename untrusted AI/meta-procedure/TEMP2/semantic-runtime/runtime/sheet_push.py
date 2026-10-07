"""Send a rendered delivery outward to an Apps Script web app."""
import json
import os
from pathlib import Path
import urllib.request


def push_delivery(delivery):
    """Return true only after Apps Script confirms the matching delivery."""
    settings = renderer_settings()
    url = settings.get('url', '')
    if not url:
        return False
    if not url.startswith('https://script.google.com/macros/s/') or not url.endswith('/exec'):
        raise ValueError('Expected deployed Apps Script HTTPS URL')
    key = Path(settings['key_file']).read_text().strip()
    payload = {'key': key, 'delivery': delivery}
    request = urllib.request.Request(url, data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(request, timeout=30) as response:
        acknowledgement = json.load(response)
    if acknowledgement.get('status') != 'RENDERED' or acknowledgement.get('delivery_id') != delivery['delivery_id']:
        raise ValueError('Renderer did not acknowledge delivery')
    return True


def renderer_settings():
    """Use environment overrides or the user's local renderer configuration."""
    if 'SEMANTIC_RENDERER_URL' in os.environ:
        return {'url': os.environ['SEMANTIC_RENDERER_URL'],
                'key_file': os.environ.get('SEMANTIC_RENDERER_KEY_FILE', '')}
    path = Path(os.environ.get('LOCALAPPDATA', '')) / 'SemanticRuntime' / 'renderer.json'
    return json.loads(path.read_text()) if path.is_file() else {}
