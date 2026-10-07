from __future__ import annotations
import argparse, json, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
HERE=Path(__file__).resolve().parent
if str(HERE) not in sys.path: sys.path.insert(0,str(HERE))
import server_integration as api

TOOLS=[
 {"name":"retrieve_context","description":"Query canonical Solver execution KB.","inputSchema":{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":20}},"required":["query"]}},
 {"name":"controller_start","description":"Start MIS; KB retrieval occurs before q1.","inputSchema":{"type":"object","properties":{"desired_state":{"type":"string"}},"required":["desired_state"]}},
 {"name":"controller_respond","description":"Submit exact-schema MIS response.","inputSchema":{"type":"object","properties":{"transaction_id":{"type":"string"},"response":{"type":"object"}},"required":["transaction_id","response"]}},
 {"name":"controller_status","description":"Get MIS transaction status.","inputSchema":{"type":"object","properties":{"transaction_id":{"type":"string"}},"required":["transaction_id"]}},
 {"name":"controller_receipt","description":"Get MIS receipt including kb_retrieval event 0.","inputSchema":{"type":"object","properties":{"transaction_id":{"type":"string"}},"required":["transaction_id"]}},
 {"name":"controller_finalize","description":"Attach post-execution report.","inputSchema":{"type":"object","properties":{"transaction_id":{"type":"string"},"report":{"type":"object"}},"required":["transaction_id","report"]}},
]

def call_tool(name,a):
    if name=="retrieve_context": return api.retrieve_context(a["query"],a.get("limit",5))
    if name=="controller_start": return api.controller_start(a["desired_state"])
    if name=="controller_respond": return api.controller_respond(a["transaction_id"],a["response"])
    if name=="controller_status": return api.controller_status(a["transaction_id"])
    if name=="controller_receipt": return api.controller_receipt(a["transaction_id"])
    if name=="controller_finalize": return api.controller_finalize(a["transaction_id"],a["report"])
    raise ValueError("unknown tool")

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path=="/health": return self.reply(200,{"status":"ok","server":"mis-solver-query","version":"1.0.0"})
        return self.reply(404,{"error":"not found"})
    def do_POST(self):
        if self.path!="/mcp": return self.reply(404,{"error":"not found"})
        rid=None
        try:
            body=json.loads(self.rfile.read(int(self.headers.get("Content-Length","0"))) or b"{}")
            method=body.get("method"); rid=body.get("id")
            if method=="initialize": result={"protocolVersion":"2025-03-26","capabilities":{"tools":{}},"serverInfo":{"name":"mis-solver-query","version":"1.0.0"}}
            elif method=="notifications/initialized": return self.reply(202,{})
            elif method=="tools/list": result={"tools":TOOLS}
            elif method=="tools/call":
                out=call_tool(body["params"]["name"],body["params"].get("arguments",{}))
                result={"content":[{"type":"text","text":json.dumps(out,ensure_ascii=False,indent=2)}],"structuredContent":out}
            elif method=="ping": result={}
            else: raise ValueError("unsupported method: "+str(method))
            return self.reply(200,{"jsonrpc":"2.0","id":rid,"result":result})
        except Exception as exc:
            return self.reply(200,{"jsonrpc":"2.0","id":rid,"error":{"code":-32603,"message":f"{type(exc).__name__}: {exc}"}})
    def reply(self,status,obj):
        data=json.dumps(obj).encode(); self.send_response(status); self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(data))); self.end_headers(); self.wfile.write(data)
    def log_message(self,*_): pass

def main():
    p=argparse.ArgumentParser(); p.add_argument("--host",default="127.0.0.1"); p.add_argument("--port",type=int,default=8765); a=p.parse_args()
    ThreadingHTTPServer((a.host,a.port),Handler).serve_forever()
if __name__=="__main__": main()
