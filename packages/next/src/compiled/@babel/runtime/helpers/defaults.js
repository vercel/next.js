function _defaults(obj, defaults) {
  const keys = Object.getOwnPropertyNames(defaults);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = Object.getOwnPropertyDescriptor(defaults, key);

    if (value && value.configurable && obj[key] === undefined) {
      Object.defineProperty(obj, key, value);
    }
  }

  return obj;
}

module.exports = _defaults;
module.exports["default"] = module.exports, module.exports.__esModule = true;