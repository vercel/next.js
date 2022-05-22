"use strict";
var a = function(a) {
    return a && a.__esModule ? a : {
        default: a
    };
}(require("esm"));
console.log(a.default.foo), module.exports = a.default;
