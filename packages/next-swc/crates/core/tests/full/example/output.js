import a from "other";
function _arrayLikeToArray(a, b) {
    (null == b || b > a.length) && (b = a.length);
    for(var b = 0, d = new Array(b); b < b; b++)d[b] = a[b];
    return d;
}
function _arrayWithHoles(a) {
    if (Array.isArray(a)) return a;
}
function _classCallCheck(a, b) {
    if (!(a instanceof b)) throw new TypeError("Cannot call a class as a function");
}
function _iterableToArrayLimit(a, b) {
    var c, d, e = null == a ? null : "undefined" != typeof Symbol && a[Symbol.iterator] || a["@@iterator"];
    if (null != e) {
        var f = [], g = !0, h = !1;
        try {
            for(e = e.call(a); !(g = (c = e.next()).done) && (f.push(c.value), !b || f.length !== b); g = !0);
        } catch (i) {
            h = !0, d = i;
        } finally{
            try {
                g || null == e.return || e.return();
            } finally{
                if (h) throw d;
            }
        }
        return f;
    }
}
function _nonIterableRest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _slicedToArray(a, b) {
    return _arrayWithHoles(a) || _iterableToArrayLimit(a, b) || _unsupportedIterableToArray(a, b) || _nonIterableRest();
}
function _unsupportedIterableToArray(a, b) {
    if (a) {
        if ("string" == typeof a) return _arrayLikeToArray(a, b);
        var c = Object.prototype.toString.call(a).slice(8, -1);
        if ("Object" === c && a.constructor && (c = a.constructor.name), "Map" === c || "Set" === c) return Array.from(c);
        if ("Arguments" === c || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(c)) return _arrayLikeToArray(a, b);
    }
}
var _other = _slicedToArray(a, 1), foo = _other[0], Foo = function() {
    "use strict";
    _classCallCheck(this, Foo);
};
export var __N_SSG = !0;
export default function a() {
    return React.createElement("div", null);
};
