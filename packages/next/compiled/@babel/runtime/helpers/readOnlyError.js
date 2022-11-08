function _readOnlyError(name) {
  throw new TypeError("\"" + name + "\" is read-only");
}

module.exports = _readOnlyError;
module.exports["default"] = module.exports, module.exports.__esModule = true;