function _checkPrivateRedeclaration(obj, privateCollection) {
  if (privateCollection.has(obj)) {
    throw new TypeError("Cannot initialize the same private elements twice on an object");
  }
}

module.exports = _checkPrivateRedeclaration;
module.exports["default"] = module.exports, module.exports.__esModule = true;