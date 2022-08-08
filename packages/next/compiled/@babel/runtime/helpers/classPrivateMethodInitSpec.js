var checkPrivateRedeclaration = require("./checkPrivateRedeclaration.js");

function _classPrivateMethodInitSpec(obj, privateSet) {
  checkPrivateRedeclaration(obj, privateSet);
  privateSet.add(obj);
}

module.exports = _classPrivateMethodInitSpec;
module.exports["default"] = module.exports, module.exports.__esModule = true;