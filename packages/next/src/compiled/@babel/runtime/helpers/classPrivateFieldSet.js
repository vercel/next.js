var classApplyDescriptorSet = require("./classApplyDescriptorSet.js");
var classExtractFieldDescriptor = require("./classExtractFieldDescriptor.js");
function _classPrivateFieldSet(receiver, privateMap, value) {
  var descriptor = classExtractFieldDescriptor(receiver, privateMap, "set");
  classApplyDescriptorSet(receiver, descriptor, value);
  return value;
}
module.exports = _classPrivateFieldSet, module.exports.__esModule = true, module.exports["default"] = module.exports;