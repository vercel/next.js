import a from "other";
function _arrayWithHoles(b) {
    if (Array.isArray(b)) return b;
}
function _iterableToArrayLimit(b, c) {
    var d = [], e = !0, f = !1, g = void 0;
    try {
        for(var h, i = b[Symbol.iterator](); !(e = (h = i.next()).done) && (d.push(h.value), !c || d.length !== c); e = !0);
    } catch (j) {
        f = !0, g = j;
    } finally{
        try {
            e || null == i.return || i.return();
        } finally{
            if (f) throw g;
        }
    }
    return d;
}
function _nonIterableRest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance");
}
function _slicedToArray(b, c) {
    return _arrayWithHoles(b) || _iterableToArrayLimit(b, c) || _nonIterableRest();
}
var foo = _slicedToArray(a, 1)[0];
export var __N_SSG = !0;
export default function Home() {
    return React.createElement("div", null);
};
