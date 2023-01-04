function _classCheckPrivateStaticAccess(receiver, classConstructor) {
  if (receiver !== classConstructor) {
    throw new TypeError("Private static access of wrong provenance");
  }
}

module.exports = _classCheckPrivateStaticAccess;
module.exports["default"] = module.exports, module.exports.__esModule = true;