import json, pathlib, sys

root = pathlib.Path(__file__).resolve().parents[1]
url = sys.argv[1].rstrip('/') + '/mcp'
if not url.startswith('https://'):
    raise SystemExit('Tunnel URL must begin with https://')
path = root / '.mcp.json'
path.write_text(json.dumps({'mcpServers': {'solver_architecture_kb': {'type': 'http', 'url': url}}}, indent=2) + '\n', encoding='utf-8')
print(path)
