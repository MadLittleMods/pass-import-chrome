// Turn Map and Set into plain objects and arrays
function jsonReplacer(key, value) {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  } else if (value instanceof Set) {
    return Array.from(value.values());
  } else {
    return value;
  }
}

module.exports = {
  jsonReplacer,
};
