'use strict';
// Input: official github/rest-api-description OpenAPI JSON. No runtime dependencies.
const fs=require('node:fs');
function build(spec,revision){
 const commands={};
 const resolve=p=>{const visited=new Set();while(p?.$ref){if(!p.$ref.startsWith('#/')||visited.has(p.$ref))throw Error('Unsupported OpenAPI reference');visited.add(p.$ref);p=p.$ref.slice(2).split('/').reduce((o,k)=>o[k.replace(/~1/g,'/').replace(/~0/g,'~')],spec);}return p;};
 for(const [route,item] of Object.entries(spec.paths))for(const [method,op] of Object.entries(item)){
  if(op.operationId?.startsWith('issues/')||op.operationId?.startsWith('issue-search/')||/\/issues(?:\/|$)/.test(route))continue;
  if(!op.operationId||!['get','post','put','patch','delete','head','options'].includes(method))continue;
  if(commands[op.operationId])throw Error('Duplicate operationId: '+op.operationId);
  const parameters=[...(item.parameters||[]),...(op.parameters||[])].map(resolve);
  if(parameters.some(p=>p.$ref))throw Error('Resolve parameter references before building');
  commands[op.operationId]={method:method.toUpperCase(),server:op.servers?.[0]?.url||'https://api.github.com',route,description:op.summary||'',parameters:parameters.map(p=>({name:p.name,in:p.in,required:!!p.required})),bodyRequired:!!resolve(op.requestBody)?.required,documentation:op.externalDocs?.url||null};
 }
 return {schema_version:1,source:'https://github.com/github/rest-api-description',revision,commands};
}
if(require.main===module){const [input,revision,output]=process.argv.slice(2);if(!input||!/^[a-f0-9]{40}$/.test(revision||'')||!output)throw Error('Usage: node build-catalog.js openapi.json <source-commit-sha> command-catalog.json');fs.writeFileSync(output,JSON.stringify(build(JSON.parse(fs.readFileSync(input,'utf8')),revision),null,2)+'\n');}
module.exports={build};
