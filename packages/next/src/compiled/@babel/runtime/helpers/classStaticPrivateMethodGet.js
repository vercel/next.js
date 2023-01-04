var classCheckPrivateStaticAccess = require("./classCheckPrivateStaticAccess.js");

function _classStaticPrivateMethodGet(receiver, classConstructor, method) {
  classCheckPrivateStaticAccess(receiver, classConstructor);
  return method;
}

module.exports = _classStaticPrivateMethodGet;
module.exports["default"] = module.exports, module.exports.__esModule = true;