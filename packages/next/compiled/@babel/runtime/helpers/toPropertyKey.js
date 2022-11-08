var _typeof = require("next/dist/compiled/@babel/runtime/helpers/typeof")["default"];

var toPrimitive = require("./toPrimitive.js");

function _toPropertyKey(arg) {
  var key = toPrimitive(arg, "string");
  return _typeof(key) === "symbol" ? key : String(key);
}

module.exports = _toPropertyKey;
module.exports["default"] = module.exports, module.exports.__esModule = true;