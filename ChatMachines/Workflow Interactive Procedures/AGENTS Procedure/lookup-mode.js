function lookupMode(matchedExample, lookupTable) {
  if (!matchedExample || !Number.isInteger(matchedExample.example)) {
    throw new Error("matchedExample must contain an integer example.");
  }
  const key = String(matchedExample.example);
  if (!lookupTable || !Object.hasOwn(lookupTable, key)) {
    throw new Error("No mode found for example " + key + ".");
  }
  return lookupTable[key];
}

module.exports = { lookupMode };
