var classApplyDescriptorGet = require("./classApplyDescriptorGet.js");
var classCheckPrivateStaticAccess = require("./classCheckPrivateStaticAccess.js");
var classCheckPrivateStaticFieldDescriptor = require("./classCheckPrivateStaticFieldDescriptor.js");
function _classStaticPrivateFieldSpecGet(receiver, classConstructor, descriptor) {
  classCheckPrivateStaticAccess(receiver, classConstructor);
  classCheckPrivateStaticFieldDescriptor(descriptor, "get");
  return classApplyDescriptorGet(receiver, descriptor);
}
module.exports = _classStaticPrivateFieldSpecGet, module.exports.__esModule = true, module.exports["default"] = module.exports;