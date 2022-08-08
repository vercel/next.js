"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

var _styledComponents = _interopRequireWildcard(require("styled-components"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function _getRequireWildcardCache(nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") { return { "default": obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj["default"] = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

var Named = _styledComponents["default"].div.withConfig({
  displayName: "code__Named"
})(["\n  width: 100%;\n"]);

var NamedWithInterpolation = _styledComponents["default"].div.withConfig({
  displayName: "code__NamedWithInterpolation"
})(["\n  color: ", ";\n"], function (color) {
  return props.color;
});

var Wrapped = (0, _styledComponents["default"])(Inner).withConfig({
  displayName: "code__Wrapped"
})(["\n  color: red;\n"]);

var Foo = _styledComponents["default"].div.withConfig({
  displayName: "code__Foo"
})({
  color: 'green'
});

var style = (0, _styledComponents.css)(["\n  background: green;\n"]);
var GlobalStyle = (0, _styledComponents.createGlobalStyle)(["\n  html {\n    background: silver;\n  }\n"]);
