function r(r, e) {
    (null == e || e > r.length) && (e = r.length);
    for(var n = 0, o = Array(e); n < e; n++)o[n] = r[n];
    return o;
}
import t from "other";
((function(r) {
    if (Array.isArray(r)) return r;
})(t) || function(r, e) {
    var n, o, a = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
    if (null != a) {
        var l = [], u = !0, i = !1;
        try {
            for(a = a.call(r); !(u = (n = a.next()).done) && (l.push(n.value), !e || l.length !== e); u = !0);
        } catch (r) {
            i = !0, o = r;
        } finally{
            try {
                u || null == a.return || a.return();
            } finally{
                if (i) throw o;
            }
        }
        return l;
    }
}(t, 1) || function(e, n) {
    if (e) {
        if ("string" == typeof e) return r(e, n);
        var o = Object.prototype.toString.call(e).slice(8, -1);
        if ("Object" === o && e.constructor && (o = e.constructor.name), "Map" === o || "Set" === o) return Array.from(o);
        if ("Arguments" === o || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(o)) return r(e, n);
    }
}(t, 1) || function() {
    throw TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}())[0];
export var __N_SSG = !0;
export default function e() {
    return React.createElement("div", null);
}
