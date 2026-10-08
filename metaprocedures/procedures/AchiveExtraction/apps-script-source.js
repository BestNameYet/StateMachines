(input) => {
  const stamp = new Date().toISOString();
  const archives = {};
  const findings = [];
  const results = [];
  const errors = [];
  const ids = {};
  const createOutput = (name, contents, mime) => {
    const blob = Utilities.newBlob(contents, mime || 'application/octet-stream', name);
    return input.destination.folder_id
      ? DriveApp.getFolderById(input.destination.folder_id).createFile(blob)
      : DriveApp.createFile(blob);
  };
  for (const item of input.archives) {
    if (!item.id || !item.alias || archives[item.alias]) throw new Error('Invalid or duplicate archive alias');
    const f = DriveApp.getFileById(item.id);
    archives[item.alias] = {file:f,initial:{id:f.getId(),name:f.getName(),size:f.getSize(),updated:String(f.getLastUpdated()),mimeType:f.getMimeType()}};
    ids[item.id] = true;
  }
  const cache = {};
  for (const action of input.actions) {
    const record = {id:action.id,type:action.type,archive:action.archive,status:'PENDING'};
    results.push(record);
    try {
      const target = archives[action.archive];
      if (!target) throw new Error('Unknown archive alias: '+ action.archive);
      const f = target.file;
      if (action.type === 'inspect') {
        record.metadata = target.initial;
        record.status = 'PASS';
      } else if (action.type === 'copy_archive') {
        const copy = input.destination.folder_id
          ? f.makeCopy(action.output_name || f.getName(),DriveApp.getFolderById(input.destination.folder_id))
          : f.makeCopy(action.output_name || f.getName());
        record.output = {id:copy.getId(),name:copy.getName(),url:copy.getUrl()};
        record.status = 'PASS';
      } else if (action.type === 'list_entries' || action.type === 'extract_selected') {
        if (!cache[action.archive]) cache[action.archive] = Utilities.unzip(f.getBlob());
        const blobs = cache[action.archive];
        if (action.type === 'list_entries') {
          record.entries = blobs.map(b=>({name:b.getName(),size:b.getSize()}));
          record.count = record.entries.length;
        } else {
          if (!Array.isArray(action.entries)||action.entries.length===0) throw new Error('extract_selected requires nonempty entries');
          const names = {};
          for(const name of action.entries) { if(typeof name !== 'string'||names[name]) throw new Error('Invalid/duplicate entry name');names[name]=true; }
          const found = {};
          record.output = [];
          for (const blob of blobs) {
            const name=blob.getName();
            if (!names[name]) continue;
            if (found[name]) throw new Error('Ambiguous duplicate ZIP entry: '+name);
            found[name]=true;
            const safeName = name.replace(/\\/g,'/').split('/').filter(Boolean).pop();
            if (!safeName || safeName==='.' || safeName==='..') throw new Error('Unsafe entry basename');
            const output = createOutput(action.output_prefix ? action.output_prefix+'-'+safeName : safeName, blob.getBytes(), blob.getContentType());
            record.output.push({entry:name,file_id:output.getId(),url:output.getUrl(),bytes:output.getSize()});
          }
          record.missing = action.entries.filter(name=>!found[name]);
          if(record.missing.length) throw new Error('Requested entries not found: '+record.missing.join(', '));
        }
        record.status='PASS';
      } else {
        throw new Error('Unsupported action type: '+action.type);
      }
    } catch (e) {
      record.status='FAIL';
      record.error=String(e && e.message || e);
      errors.push({action_id:action.id,message:record.error});
      if ((action.on_error || input.execution.on_error) !== 'continue') break;
    }
  }
  const sources = Object.keys(archives).map(alias=>{
    const f=archives[alias].file;const initial=archives[alias].initial;
    const now={size:f.getSize(),updated:String(f.getLastUpdated())};
    return {alias,id:initial.id,initial,final:now,preserved:initial.size===now.size && initial.updated===now.updated};
  });
  const report = {
    response_type:'archive_extraction_execution',run_id:input.run_id,started_at:stamp,finished_at:new Date().toISOString(),
    sources,actions:results,errors,all_actions_passed:errors.length===0 && results.length===input.actions.length,
    source_preserved:sources.every(s=>s.preserved),verification_status:'REQUIRES_INDEPENDENT_DRIVE_READBACK'
  };
  const reportName=(input.destination.report_prefix||'archive-extraction')+'-'+input.run_id+'.json';
  const resultFile=createOutput(reportName, JSON.stringify(report,null,2), 'application/json');
  return {run_id:input.run_id,report_file_id:resultFile.getId(),report_file_url:resultFile.getUrl(),action_count:results.length,error_count:errors.length,source_preserved:report.source_preserved};
}
