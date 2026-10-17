import argparse, hashlib, json, math, pathlib, re
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parents[1]
KB_PATH = ROOT / 'data' / 'knowledge.jsonl'
ONTOLOGY = json.loads((ROOT / 'assets' / 'ontology.json').read_text(encoding='utf-8'))
TOKEN = re.compile(r"[a-z0-9][a-z0-9_-]+")

def tokens(value):
    return TOKEN.findall(value.lower())

def records():
    return [json.loads(x) for x in KB_PATH.read_text(encoding='utf-8').splitlines() if x.strip()]

def record_text(r):
    fields = [r.get('title',''), r.get('problem',''), r.get('solver_family',''), r.get('solver_pattern','')]
    for key in ('problem_tags','applicability','failure_modes','validation'):
        fields.extend(r.get(key, []))
    return ' '.join(fields)

def semantic_rank(query, items):
    docs = [Counter(tokens(record_text(r))) for r in items]
    q = Counter(tokens(query))
    n = max(1, len(docs))
    df = Counter(t for d in docs for t in d)
    def vec(c): return {t: f * (math.log((n + 1)/(df[t] + 1)) + 1) for t, f in c.items()}
    qv = vec(q)
    def cosine(d):
        dv = vec(d); dot = sum(qv.get(t,0)*v for t,v in dv.items())
        return dot / ((sum(v*v for v in qv.values())**.5 or 1)*(sum(v*v for v in dv.values())**.5 or 1))
    return sorted(((cosine(d), r) for d, r in zip(docs, items)), key=lambda x: x[0], reverse=True)

def classify(goal):
    lower = goal.lower(); result = {}
    aliases = {
      'objective': {'diagnose':['bug','cause','diagnos'], 'create':['create','build','write','design'], 'decide':['choose','decide','select'], 'optimize':['optimiz','best','maximum'], 'verify':['verify','test','audit']},
      'structure': {'causal':['cause','why'], 'combinatorial':['schedule','route','allocate'], 'sequential':['workflow','process','steps'], 'ill-structured':['unknown','unclear','open-ended']},
      'observability': {'latent-state':['hidden','unknown cause'], 'noisy-measurement':['noisy','uncertain data']},
      'stakes': {'safety-critical':['safety','medical','legal'], 'costly':['expensive','high stakes'], 'reversible':['draft','prototype']},
      'interaction': {'human-in-loop':['approval','review'], 'multi-agent':['agents','team'], 'controller-governed':['controller','orchestrator']}
    }
    for perspective, values in ONTOLOGY['perspectives'].items():
        hits = [label for label, cues in aliases.get(perspective,{}).items() if any(c in lower for c in cues)]
        result[perspective] = {'labels': hits or ['unresolved'], 'coverage': 'inferred' if hits else 'needs-evidence'}
    return {'goal': goal, 'perspectives': result, 'ontology_version': ONTOLOGY['version'], 'warning':'Labels are candidate representations, not final truth.'}

def retrieve(goal, limit=5):
    ranked = semantic_rank(goal, records())[:max(1,min(int(limit),20))]
    return [{'score':round(s,4), **r} for s,r in ranked]

def architecture(goal, constraints=''):
    cls = classify(goal); hits = retrieve(goal+' '+constraints, 5)
    families = []
    for h in hits:
        if h['solver_family'] not in families: families.append(h['solver_family'])
    return {
      'problem_representation': cls,
      'evidence': hits,
      'candidate_architectures': [
        {'name':'ontology-guided case synthesis','families':families[:3] or ['retrieval_and_synthesis'],'tradeoff':'Fast and evidence-linked; limited by corpus coverage.'},
        {'name':'fresh model plus adversarial validation','families':['creative_design','verification'],'tradeoff':'Can escape corpus bias; costs more and needs stronger tests.'}
      ],
      'selected_architecture': {
        'stages':['frame exact objective and authority','classify across every ontology perspective','retrieve positive and disconfirming analogies','generate at least two architectures','check assumption and interface compatibility','select and express executable task graph','run mechanical and semantic validation','stop on satisfied gates or explicit impasse'],
        'deterministic_operations':['schema validation','provenance preservation','ID generation','coverage accounting'],
        'semantic_operations':['classification','analogy judgment','architecture composition','adequacy evaluation'],
        'stop_conditions':['all mandatory acceptance tests pass','a required authority or input is unavailable','new evidence no longer changes the selected architecture materially']
      },
      'coverage_gaps':[p for p,v in cls['perspectives'].items() if v['coverage']=='needs-evidence'],
      'warning':'Selection is a defeasible recommendation derived from the current KB, not proof of optimality.'
    }

TOOLS = [
 {'name':'classify_problem','description':'Classify a goal across every explicit ontology perspective.','inputSchema':{'type':'object','properties':{'goal':{'type':'string'}},'required':['goal']}},
 {'name':'retrieve_solver_patterns','description':'Retrieve provenance-bearing analogous problem and solver records.','inputSchema':{'type':'object','properties':{'query':{'type':'string'},'limit':{'type':'integer','minimum':1,'maximum':20}},'required':['query']}},
 {'name':'design_solver_architecture','description':'Compose and validate an executable solver architecture from classification and retrieved cases.','inputSchema':{'type':'object','properties':{'goal':{'type':'string'},'constraints':{'type':'string'}},'required':['goal']}},
 {'name':'ingest_knowledge','description':'Append an authorized, provenance-bearing problem-solver record.','inputSchema':{'type':'object','properties':{'record':{'type':'object'}},'required':['record']}},
 {'name':'kb_stats','description':'Report ontology and corpus coverage.','inputSchema':{'type':'object','properties':{}}}
]

def call_tool(name, a):
    if name == 'classify_problem': return classify(a['goal'])
    if name == 'retrieve_solver_patterns': return retrieve(a['query'], a.get('limit',5))
    if name == 'design_solver_architecture': return architecture(a['goal'], a.get('constraints',''))
    if name == 'kb_stats':
        rs=records(); return {'records':len(rs),'solver_families':dict(Counter(r.get('solver_family','unknown') for r in rs)),'ontology':ONTOLOGY}
    if name == 'ingest_knowledge':
        r=a['record']; required=['title','problem','solver_family','solver_pattern','source']
        missing=[x for x in required if not r.get(x)]
        if missing: raise ValueError('Missing required fields: '+', '.join(missing))
        r.setdefault('id','kb-'+hashlib.sha256(json.dumps(r,sort_keys=True).encode()).hexdigest()[:16])
        r.setdefault('problem_tags',[]); r.setdefault('applicability',[]); r.setdefault('failure_modes',[]); r.setdefault('validation',[])
        with KB_PATH.open('a',encoding='utf-8') as f: f.write(json.dumps(r,ensure_ascii=False)+'\n')
        return {'ingested':r['id'],'source':r['source']}
    raise ValueError('Unknown tool')

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health': self.reply(200, {'status':'ok','records':len(records())})
        else: self.reply(404, {'error':'not found'})
    def do_POST(self):
        if self.path != '/mcp': return self.reply(404, {'error':'not found'})
        try:
            body=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))) or b'{}'); method=body.get('method'); rid=body.get('id')
            if method == 'initialize': result={'protocolVersion':'2025-03-26','capabilities':{'tools':{}},'serverInfo':{'name':'solver-architecture-kb','version':'0.1.0'}}
            elif method == 'notifications/initialized': return self.reply(202, {})
            elif method == 'tools/list': result={'tools':TOOLS}
            elif method == 'tools/call':
                out=call_tool(body['params']['name'],body['params'].get('arguments',{})); result={'content':[{'type':'text','text':json.dumps(out,ensure_ascii=False,indent=2)}],'structuredContent':out}
            elif method == 'ping': result={}
            else: raise ValueError('Unsupported method: '+str(method))
            self.reply(200, {'jsonrpc':'2.0','id':rid,'result':result})
        except Exception as e: self.reply(200, {'jsonrpc':'2.0','id':locals().get('rid'),'error':{'code':-32603,'message':str(e)}})
    def reply(self,status,obj):
        data=json.dumps(obj).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
    def log_message(self, *_): pass

if __name__ == '__main__':
    p=argparse.ArgumentParser(); p.add_argument('--host',default='127.0.0.1'); p.add_argument('--port',type=int,default=8765); a=p.parse_args()
    ThreadingHTTPServer((a.host,a.port),Handler).serve_forever()
