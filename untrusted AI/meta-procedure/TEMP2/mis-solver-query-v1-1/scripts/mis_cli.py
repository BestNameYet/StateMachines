import json
from server_integration import CONTROLLER
print("MIS + Solver KB query interactive CLI. Enter desired state:")
out=CONTROLLER.start(input().strip())
while True:
    print(json.dumps(out,ensure_ascii=False,indent=2))
    txid=out.get("transaction_id")
    if out.get("complete"): break
    print("Enter JSON response:")
    response=json.loads(input())
    out=CONTROLLER.respond(txid,response)
