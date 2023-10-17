function _classCheckPrivateStaticFieldDescriptor(descriptor, action) {
  if (descriptor === undefined) {
    throw new TypeError("attempted to " + action + " private static field before its declaration");
  }
}

module.exports = _classCheckPrivateStaticFieldDescriptor;
module.exports["default"] = module.exports, module.exports.__esModule = true;