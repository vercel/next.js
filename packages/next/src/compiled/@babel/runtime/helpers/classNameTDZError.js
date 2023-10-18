function _classNameTDZError(name) {
  throw new Error("Class \"" + name + "\" cannot be referenced in computed property keys.");
}

module.exports = _classNameTDZError;
module.exports["default"] = module.exports, module.exports.__esModule = true;