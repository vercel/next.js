"use strict";

var _styledComponents = _interopRequireDefault(require("styled-components"));

var _templateObject, _templateObject2, _templateObject3, _templateObject4, _templateObject5;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _taggedTemplateLiteral(strings, raw) { if (!raw) { raw = strings.slice(0); } return Object.freeze(Object.defineProperties(strings, { raw: { value: Object.freeze(raw) } })); }

var Simple = _styledComponents["default"].div(_templateObject || (_templateObject = _taggedTemplateLiteral(["width:100%;"])));

var Interpolation = _styledComponents["default"].div(_templateObject2 || (_templateObject2 = _taggedTemplateLiteral(["content:\"  ", "  \";"])), function (props) {
  return props.text;
});

var SpecialCharacters = _styledComponents["default"].div(_templateObject3 || (_templateObject3 = _taggedTemplateLiteral(["content:\"  ", "  \";color:red;"])), function (props) {
  return props.text;
});

var Comment = _styledComponents["default"].div(_templateObject4 || (_templateObject4 = _taggedTemplateLiteral(["color:red;"])));

var Parens = _styledComponents["default"].div(_templateObject5 || (_templateObject5 = _taggedTemplateLiteral(["&:hover{color:blue;}"])));
