var classApplyDescriptorDestructureSet = require("./classApplyDescriptorDestructureSet.js");
var classCheckPrivateStaticAccess = require("./classCheckPrivateStaticAccess.js");
var classCheckPrivateStaticFieldDescriptor = require("./classCheckPrivateStaticFieldDescriptor.js");
function _classStaticPrivateFieldDestructureSet(receiver, classConstructor, descriptor) {
  classCheckPrivateStaticAccess(receiver, classConstructor);
  classCheckPrivateStaticFieldDescriptor(descriptor, "set");
  return classApplyDescriptorDestructureSet(receiver, descriptor);
}
module.exports = _classStaticPrivateFieldDestructureSet, module.exports.__esModule = true, module.exports["default"] = module.exports;