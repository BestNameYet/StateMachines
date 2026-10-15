const fs = require('node:fs');
const path = require('node:path');

function schemaFromType(source) {
  const tokens = source.match(/"(?:\\.|[^"\\])*"|[A-Za-z]+|[<>{}:,|]/g) || [];
  let at = 0;
  function expect(token) { if (tokens[at++] !== token) throw Error('Invalid return type: ' + source); }
  function parse() {
    let result;
    const token = tokens[at++];
    if (token === '<') { result = parse(); expect('>'); }
    else if (token === 'Array') { expect('<'); result = {type:'array', items:parse()}; expect('>'); }
    else if (token === '{') {
      const properties = {};
      while (tokens[at] !== '}') {
        const key = JSON.parse(tokens[at++]); expect(':'); properties[key] = parse();
        if (tokens[at] === ',') at++; else break;
      }
      expect('}'); result = {type:'object', properties, required:Object.keys(properties)};
    } else if (token?.startsWith('"')) result = {const:JSON.parse(token)};
    else if (token === 'any') result = {};
    else if (token === 'filename') result = {type:'string', format:'file-reference'};
    else if (['string','integer','boolean'].includes(token)) result = {type:token};
    else throw Error('Unsupported return type: ' + token);
    if (tokens[at] === '|') { at++; result = {anyOf:[result,parse()]}; }
    return result;
  }
  const schema = parse();
  if (at !== tokens.length) throw Error('Unconsumed return type: ' + source);
  return schema;
}

function inputsFor(entries) {
  const text = entries.filter(([key]) => ['instruction','steptext'].includes(key)).map(([,v])=>v).join('\n');
  const bindings = [...text.matchAll(/:\s*\$\{(\w+)\}/g)];
  if (!bindings.length) return [];
  const binding = bindings.at(-1), name = binding[1];
  let end = binding.index - 1;
  // A human-readable qualification may follow the type, e.g. (less than 100 words).
  while (end >= 0 && text[end] !== '>') end--;
  let depth = 0, begin = end;
  for (; begin >= 0; begin--) {
    if (text[begin] === '>') depth++;
    if (text[begin] === '<' && --depth === 0) break;
    // Only '<' decrements depth.
    if (text[begin] !== '<') continue;
  }
  if (begin < 0) throw Error('Missing return type for ' + name);
  let schema=schemaFromType(text.slice(begin,end+1));
  if(name==='toolInvocations') {
    const definition=entries.find(([key])=>key==='return')?.[1];
    const names=definition.required.map(variable=>variable.slice(2,-1));
    const nullable=type=>({anyOf:[{type},{type:'null'}]});
    const properties=Object.fromEntries(names.map(key=>[key,
      key==='final_output_after_completion_of_tool_call'?{}:
      nullable(['frombyte','tobyte'].includes(key)?'integer':key==='new'?'boolean':'string')]));
    properties.outcome={anyOf:definition.Outcome.enum.map(value=>({const:value}))};
    properties.specifiedOperatorByUser=nullable('string');
    properties.chosenOperator={type:'string'};
    properties.http_method={type:'string'};
    properties.url={type:'string'};
    schema={type:'array',items:{type:'object',properties,required:[...names,'specifiedOperatorByUser','chosenOperator','outcome'],toolInvocation:true}};
  }
  return [{name,schema}];
}

function validate(value, schema, where = 'value', context = {}) {
  if (schema.anyOf) {
    if (!schema.anyOf.some(option => { try { validate(value,option,where,context); return true; } catch { return false; } })) throw Error(where + ' does not match an allowed type/value.');
    return;
  }
  if (Object.hasOwn(schema,'const') && value !== schema.const) throw Error(where + ' must equal ' + schema.const);
  const kind = schema.type;
  if (kind === 'null' && value !== null) throw Error(where + ' must be null.');
  if (kind === 'string' && typeof value !== 'string') throw Error(where + ' must be a string.');
  if (kind === 'integer' && !Number.isInteger(value)) throw Error(where + ' must be an integer.');
  if (kind === 'boolean' && typeof value !== 'boolean') throw Error(where + ' must be Boolean.');
  if (kind === 'array') {
    if (!Array.isArray(value)) throw Error(where + ' must be an array.');
    value.forEach((item,i)=>validate(item,schema.items,where+'['+i+']',context));
  }
  if (kind === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(where + ' must be an object.');
    for (const key of schema.required || []) if (!Object.hasOwn(value,key)) throw Error(where + '.' + key + ' is required.');
    for (const [key,child] of Object.entries(schema.properties || {})) if (Object.hasOwn(value,key)) validate(value[key],child,where+'.'+key,{...context,newFile:value.newFile === true});
    if(schema.toolInvocation && (Object.hasOwn(value,'http_method') || Object.hasOwn(value,'url'))) {
      for(const key of ['http_method','url'])if(typeof value[key]!=='string'||!value[key])throw Error(where+'.'+key+' is required for web tools.');
    }
    if (Object.hasOwn(value,'newFile') && typeof value.newFile !== 'boolean') throw Error(where + '.newFile must be Boolean.');
    if (Number.isInteger(value.frombyte) && Number.isInteger(value.tobyte) && (value.frombyte < 0 || value.tobyte < value.frombyte)) throw Error(where + ' has an invalid byte range.');
  }
  if (schema.format === 'file-reference') {
    if (!value.trim() || value.includes('\0') || path.isAbsolute(value)) throw Error(where + ' must be a relative filename.');
    const root = path.resolve(context.root), file = path.resolve(root,value);
    if (!file.startsWith(root + path.sep)) throw Error(where + ' is outside the file workspace.');
    const designatedNew = context.newFile || context.newFiles?.includes(value);
    if (!designatedNew && (!fs.existsSync(file) || !fs.statSync(file).isFile())) throw Error(where + ': existing file not found: ' + value + '. Designate it as new if appropriate.');
  }
}
module.exports = {schemaFromType,inputsFor,validate};
