import a from "other";
function _arrayWithHoles(a) {
    if (Array.isArray(a)) return a;
}
function _classCallCheck(a, b) {
    if (!(a instanceof b)) throw new TypeError("Cannot call a class as a function");
}
function _iterableToArrayLimit(a, b) {
    var c = [], d = !0, e = !1, f = void 0;
    try {
        for(var g, h = a[Symbol.iterator](); !(d = (g = h.next()).done) && (c.push(g.value), !b || c.length !== b); d = !0);
    } catch (a) {
        e = !0, f = a;
    } finally{
        try {
            d || null == h.return || h.return();
        } finally{
            if (e) throw f;
        }
    }
    return c;
}
function _nonIterableRest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance");
}
function _slicedToArray(a, b) {
    return _arrayWithHoles(a) || _iterableToArrayLimit(a, b) || _nonIterableRest();
}
var foo = _slicedToArray(a, 1)[0], Foo = function() {
    "use strict";
    _classCallCheck(this, Foo);
};
export var __N_SSG = !0;
export default function a() {
    return React.createElement("div", null);
};
