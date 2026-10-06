const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function extractSharedChat(htmlPath, outJsonPath) {
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Input HTML file not found: ${htmlPath}`);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const enqueuedChunks = [];

  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const context = {
    window: {
      __reactRouterContext: {
        streamController: {
          enqueue(chunk) {
            enqueuedChunks.push(chunk);
          },
          close() {}
        }
      }
    }
  };
  vm.createContext(context);

  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const scriptContent = match[1];
    if (scriptContent.includes('streamController.enqueue')) {
      try {
        vm.runInContext(scriptContent, context);
      } catch (err) {
        // Fallback handled below.
      }
    }
  }

  if (enqueuedChunks.length === 0) {
    const marker = '.streamController.enqueue(';
    let cursor = 0;
    while (true) {
      const start = html.indexOf(marker, cursor);
      if (start === -1) break;
      const argStart = start + marker.length;
      let argEnd = html.indexOf(');\n</script>', argStart);
      if (argEnd === -1) argEnd = html.indexOf(');</script>', argStart);
      if (argEnd !== -1) {
        const rawArg = html.slice(argStart, argEnd).trim();
        try {
          const parsed = vm.runInNewContext(rawArg);
          enqueuedChunks.push(parsed);
        } catch {
          try {
            enqueuedChunks.push(JSON.parse(rawArg));
          } catch {}
        }
      }
      cursor = argStart + 1;
    }
  }

  const mainPayloadStr = enqueuedChunks.find(
    chunk => typeof chunk === 'string' && chunk.trim().startsWith('[')
  );

  if (!mainPayloadStr) {
    throw new Error('Could not find serialized React Router / turbo-stream payload in HTML');
  }

  const raw = JSON.parse(mainPayloadStr.trim());
  if (!Array.isArray(raw)) {
    throw new Error('Expected parsed turbo-stream payload to be a flat array');
  }

  const cache = new Map();

  function decode(slot) {
    if (slot === -5 || slot === -1) return undefined;
    if (slot === -2) return NaN;
    if (slot === -3) return Infinity;
    if (slot === -4) return -Infinity;
    if (typeof slot !== 'number' || slot < 0 || slot >= raw.length) {
      return slot;
    }
    if (cache.has(slot)) {
      return cache.get(slot);
    }

    const item = raw[slot];
    if (item === null || typeof item !== 'object') {
      cache.set(slot, item);
      return item;
    }

    if (Array.isArray(item)) {
      if (item.length === 2 && item[0] === 'P') {
        const prom = { __promise: item[1] };
        cache.set(slot, prom);
        return prom;
      }
      if (item.length === 2 && item[0] === 'D') {
        const date = new Date(item[1]);
        cache.set(slot, date);
        return date;
      }
      const arr = [];
      cache.set(slot, arr);
      for (let i = 0; i < item.length; i++) {
        arr.push(decode(item[i]));
      }
      return arr;
    }

    const obj = {};
    cache.set(slot, obj);
    for (const [k, vSlot] of Object.entries(item)) {
      let propName;
      if (k.startsWith('_')) {
        const keyIdx = parseInt(k.slice(1), 10);
        propName = raw[keyIdx];
      } else {
        propName = k;
      }
      const propVal = decode(vSlot);
      if (propName !== undefined && propVal !== undefined) {
        obj[propName] = propVal;
      }
    }
    return obj;
  }

  const root = decode(0);

  let conversation = root?.loaderData?.['routes/share.$shareId.($action)']?.serverResponse?.data;

  if (!conversation) {
    const visited = new Set();
    function findConvo(target, depth = 0) {
      if (!target || typeof target !== 'object' || depth > 8 || visited.has(target)) return null;
      visited.add(target);
      if (target.conversation_id && (target.mapping || target.linear_conversation)) {
        return target;
      }
      for (const val of Object.values(target)) {
        const found = findConvo(val, depth + 1);
        if (found) return found;
      }
      return null;
    }
    conversation = findConvo(root);
  }

  if (!conversation) {
    throw new Error('Decoded stream data did not yield a valid shared conversation object');
  }

  if (typeof conversation.title !== 'string' || conversation.title.length === 0) {
    throw new Error(`Validation failed: missing title in conversation (got ${conversation.title})`);
  }
  if (typeof conversation.conversation_id !== 'string' || conversation.conversation_id.length === 0) {
    throw new Error('Validation failed: missing conversation_id');
  }
  if (!conversation.mapping || typeof conversation.mapping !== 'object') {
    throw new Error('Validation failed: conversation.mapping is not an object');
  }
  const mappingKeys = Object.keys(conversation.mapping);
  if (mappingKeys.length === 0) {
    throw new Error('Validation failed: conversation.mapping contains 0 message nodes');
  }
  if (!Array.isArray(conversation.linear_conversation) || conversation.linear_conversation.length === 0) {
    throw new Error('Validation failed: linear_conversation is missing or empty');
  }

  const sampleNode = conversation.linear_conversation.find(n => n?.message?.author?.role);
  if (!sampleNode) {
    throw new Error('Validation failed: no message nodes with author.role found');
  }

  fs.mkdirSync(path.dirname(outJsonPath), { recursive: true });
  fs.writeFileSync(outJsonPath, JSON.stringify(conversation, null, 2) + '\n', 'utf8');

  console.log('Successfully extracted shared conversation:');
  console.log(`- Title: "${conversation.title}"`);
  console.log(`- Conversation ID: ${conversation.conversation_id}`);
  console.log(`- Mapping nodes: ${mappingKeys.length}`);
  console.log(`- Linear conversation turns: ${conversation.linear_conversation.length}`);
  console.log(`- Model: ${conversation.default_model_slug || 'N/A'}`);
  console.log(`- Written to: ${outJsonPath}`);
}

const inputHtml = path.resolve('untrusted AI/shared-chat-page.html');
const outputJson = path.resolve('untrusted AI/shared-chat.json');
extractSharedChat(inputHtml, outputJson);
