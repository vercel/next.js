var classApplyDescriptorGet = require("./classApplyDescriptorGet.js");
var classExtractFieldDescriptor = require("./classExtractFieldDescriptor.js");
function _classPrivateFieldGet(receiver, privateMap) {
  var descriptor = classExtractFieldDescriptor(receiver, privateMap, "get");
  return classApplyDescriptorGet(receiver, descriptor);
}
module.exports = _classPrivateFieldGet, module.exports.__esModule = true, module.exports["default"] = module.exports;