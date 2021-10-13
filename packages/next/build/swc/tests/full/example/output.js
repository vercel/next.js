import a from "other";
function _arrayWithHoles(b) {
    if (Array.isArray(b)) return b;
}
function _classCallCheck(c, d) {
    if (!(c instanceof d)) throw new TypeError("Cannot call a class as a function");
}
function _iterableToArrayLimit(b, e) {
    var f = [], g = !0, h = !1, i = void 0;
    try {
        for(var j, k = b[Symbol.iterator](); !(g = (j = k.next()).done) && (f.push(j.value), !e || f.length !== e); g = !0);
    } catch (l) {
        h = !0, i = l;
    } finally{
        try {
            g || null == k.return || k.return();
        } finally{
            if (h) throw i;
        }
    }
    return f;
}
function _nonIterableRest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance");
}
function _slicedToArray(b, e) {
    return _arrayWithHoles(b) || _iterableToArrayLimit(b, e) || _nonIterableRest();
}
var foo = _slicedToArray(a, 1)[0], Foo = function() {
    "use strict";
    _classCallCheck(this, Foo);
};
export var __N_SSG = !0;
export default function Home() {
    return React.createElement("div", null);
};
