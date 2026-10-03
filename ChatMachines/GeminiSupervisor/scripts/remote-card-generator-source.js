(input) => {
  const WIDTH = 1440;
  const HEIGHT = 900;
  const ROW_HEIGHT = 20;
  const CHAR_WIDTH = 12;
  const PAD_X = 24;
  const PAD_Y = 20;
  const FONT_SIZE = 20;
  const RAW_ROWS = Math.floor((HEIGHT - (2 * PAD_Y)) / ROW_HEIGHT);
  const ROWS = RAW_ROWS - (RAW_ROWS % 2);
  const COLUMNS = Math.floor((WIDTH - (2 * PAD_X)) / CHAR_WIDTH);
  const INDEX_PREFIX_CHARS = 8;

  if (!input || typeof input.agents_md !== 'string') {
    throw new Error('arguments.agents_md must be the complete Agents.md text');
  }

  function entryChars(value) {
    return JSON.stringify(value).length + INDEX_PREFIX_CHARS;
  }

  function splitLineToRenderableItems(text, eol) {
    if (text === '') return [{ type: 'content', text: '', eol: eol }];
    const chunks = [];
    let current = '';
    for (const ch of text) {
      const candidate = current + ch;
      const probe = { type: 'content', text: candidate, eol: '\r\n' };
      if (current && entryChars(probe) > COLUMNS) {
        chunks.push({ type: 'content', text: current, eol: '' });
        current = ch;
      } else {
        current = candidate;
      }
    }
    chunks.push({ type: 'content', text: current, eol: eol });
    return chunks;
  }

  function projectAgents(text) {
    const items = [];
    const re = /(.*?)(\r\n|\n|\r|$)/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match[0] === '' && re.lastIndex === text.length) break;
      items.push.apply(items, splitLineToRenderableItems(match[1], match[2]));
      if (match[2] === '') break;
    }

    const targetItemCount = Math.ceil(items.length / ROWS) * ROWS;
    while (items.length < targetItemCount) {
      let splitIndex = -1;
      let longest = 1;
      for (let i = 0; i < items.length; i++) {
        const length = items[i] && items[i].text ? items[i].text.length : 0;
        if (length > longest) {
          longest = length;
          splitIndex = i;
        }
      }
      if (splitIndex < 0) throw new Error('Cannot balance projected rows without inventing content');
      const original = items[splitIndex];
      const midpoint = Math.ceil(original.text.length / 2);
      items.splice(
        splitIndex,
        1,
        { type: 'content', text: original.text.slice(0, midpoint), eol: '' },
        { type: 'content', text: original.text.slice(midpoint), eol: original.eol }
      );
    }

    for (const item of items) {
      if (entryChars(item) > COLUMNS) {
        throw new Error('Projected row exceeds card width');
      }
    }
    return items;
  }

  function randomInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error('Invalid random range');
    const SPACE = 0x10000000;
    const limit = SPACE - (SPACE % maxExclusive);
    while (true) {
      const hex = Utilities.getUuid().replace(/-/g, '').slice(0, 7);
      const value = parseInt(hex, 16);
      if (value < limit) return value % maxExclusive;
    }
  }

  function shuffle(values) {
    const out = values.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function randomCardName() {
    return Utilities.getUuid().replace(/-/g, '') + '.png';
  }

  function xmlEscape(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function visibleLine(value, index) {
    return '[' + index + '] ' + JSON.stringify(value);
  }

  function cardSvg(slots) {
    if (!Array.isArray(slots) || slots.length !== ROWS) {
      throw new Error('Every card must contain exactly ' + ROWS + ' visible rows');
    }
    let texts = '';
    for (let row = 0; row < slots.length; row++) {
      const line = visibleLine(slots[row], row);
      if (line.length > COLUMNS) throw new Error('Rendered row exceeds card width');
      const y = PAD_Y + ((row + 1) * ROW_HEIGHT) - 3;
      texts += '<text x="' + PAD_X + '" y="' + y + '">' + xmlEscape(line) + '</text>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + WIDTH + '" height="' + HEIGHT + '" viewBox="0 0 ' + WIDTH + ' ' + HEIGHT + '">' +
      '<rect width="100%" height="100%" fill="white"/>' +
      '<g xml:space="preserve" fill="black" font-family="DejaVu Sans Mono, monospace" font-size="' + FONT_SIZE + 'px">' + texts + '</g>' +
      '</svg>';
  }

  const canonical = projectAgents(input.agents_md);
  if (canonical.length % ROWS !== 0) throw new Error('Canonical row count is not card-aligned');

  const shuffledCopy = shuffle(canonical);
  const referenceCardCount = canonical.length / ROWS;
  const mixedCardCount = referenceCardCount * 2;
  const deck = [];

  for (let start = 0; start < canonical.length; start += ROWS) {
    const slots = canonical.slice(start, start + ROWS);
    deck.push({ file: randomCardName(), svg: cardSvg(slots) });
  }

  const pairsPerCard = ROWS / 2;
  for (let pairStart = 0; pairStart < canonical.length; pairStart += pairsPerCard) {
    const orderedOnOddVisibleRow = randomInt(2) === 0;
    const slots = [];
    for (let j = 0; j < pairsPerCard; j++) {
      const ordered = canonical[pairStart + j];
      const randomized = shuffledCopy[pairStart + j];
      if (orderedOnOddVisibleRow) {
        slots.push(ordered, randomized);
      } else {
        slots.push(randomized, ordered);
      }
    }
    deck.push({ file: randomCardName(), svg: cardSvg(slots) });
  }

  if (deck.length !== referenceCardCount + mixedCardCount) {
    throw new Error('Deck size invariant failed');
  }

  const mixedDeckOrder = shuffle(deck);
  return {
    protocol: 'agents-png-remote-deck-v1',
    run: String(input.run || ''),
    source_blob_sha: String(input.source_blob_sha || ''),
    viewport: {
      width_px: WIDTH,
      height_px: HEIGHT,
      character_height_px: ROW_HEIGHT,
      conservative_character_width_px: CHAR_WIDTH,
      rows: ROWS,
      columns: COLUMNS
    },
    item_count: canonical.length,
    ordered_card_count: referenceCardCount,
    mixed_card_count: mixedCardCount,
    total_card_count: mixedDeckOrder.length,
    cards: mixedDeckOrder
  };
}