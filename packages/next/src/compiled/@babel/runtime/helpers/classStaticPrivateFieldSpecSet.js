var classApplyDescriptorSet = require("./classApplyDescriptorSet.js");
var classCheckPrivateStaticAccess = require("./classCheckPrivateStaticAccess.js");
var classCheckPrivateStaticFieldDescriptor = require("./classCheckPrivateStaticFieldDescriptor.js");
function _classStaticPrivateFieldSpecSet(receiver, classConstructor, descriptor, value) {
  classCheckPrivateStaticAccess(receiver, classConstructor);
  classCheckPrivateStaticFieldDescriptor(descriptor, "set");
  classApplyDescriptorSet(receiver, descriptor, value);
  return value;
}
module.exports = _classStaticPrivateFieldSpecSet, module.exports.__esModule = true, module.exports["default"] = module.exports;