"use strict";

var _styledComponents = _interopRequireDefault(require("styled-components"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

var Named = _styledComponents["default"].div(["\n  width: 100%;\n"]);

var NamedWithInterpolation = _styledComponents["default"].div(["\n  color: ", ";\n"], function (color) {
  return props.color;
});

var Wrapped = (0, _styledComponents["default"])(Inner)(["color: red;"]);
