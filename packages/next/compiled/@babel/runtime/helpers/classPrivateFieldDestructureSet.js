var classApplyDescriptorDestructureSet = require("./classApplyDescriptorDestructureSet.js");

var classExtractFieldDescriptor = require("./classExtractFieldDescriptor.js");

function _classPrivateFieldDestructureSet(receiver, privateMap) {
  var descriptor = classExtractFieldDescriptor(receiver, privateMap, "set");
  return classApplyDescriptorDestructureSet(receiver, descriptor);
}

module.exports = _classPrivateFieldDestructureSet;
module.exports["default"] = module.exports, module.exports.__esModule = true;