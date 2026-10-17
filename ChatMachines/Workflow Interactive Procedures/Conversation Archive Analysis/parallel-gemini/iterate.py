"""Process an ordered queue using exactly one Gemini worker."""
import argparse,json,os,time,subprocess,sys
from pathlib import Path

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--config",required=True)
    parser.add_argument("--output",default="iterator-results")
    args=parser.parse_args()
    config=json.loads(Path(args.config).read_text())
    if config.get("maxParallel")!=1: raise ValueError("Iterator requires maxParallel=1")
    paths=config["paths"]
    if not paths or len(paths)!=len(set(paths)): raise ValueError("Queue must be nonempty and distinct")
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    instruction=out/"instruction.txt";instruction.write_text(config["instruction"])
    records=[{"index":i,"path":p,"status":"pending"} for i,p in enumerate(paths)]
    def checkpoint():
        (out/"index.json").write_text(json.dumps(records,indent=2)+"\n")
        (out/"state.json").write_text(json.dumps({"worker_count":1,"source_commit":os.environ.get("GITHUB_SHA"),"total":len(records),"completed":sum(r["status"]=="completed" for r in records),"failed":sum(r["status"]=="failed" for r in records),"current":next((r["index"] for r in records if r["status"]=="running"),None)},indent=2)+"\n")
    checkpoint()
    last_start=0
    for record in records:
        delay=max(0,65-(time.monotonic()-last_start))
        if delay: time.sleep(delay)
        record["status"]="running";checkpoint()
        last_start=time.monotonic()
        dest=out/("task-%03d"%record["index"])
        print("START",record["index"],record["path"],flush=True)
        code=subprocess.run([sys.executable,str(Path(__file__).with_name("run_task.py")),"--path",record["path"],"--instruction-file",str(instruction),"--output",str(dest)]).returncode
        result=dest/"result.json"
        if result.exists(): record.update(json.loads(result.read_text()))
        else: record.update(status="failed",error="No result.json",exit_code=code)
        checkpoint()
        print("END",record["index"],record["status"],flush=True)
    if any(r["status"]!="completed" for r in records): raise SystemExit("Queue finished with failed assignments; see index.json")
if __name__=="__main__":main()
