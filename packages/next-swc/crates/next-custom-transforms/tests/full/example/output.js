function r(r, t) {
    (null == t || t > r.length) && (t = r.length);
    for(var e = 0, n = Array(t); e < t; e++)n[e] = r[e];
    return n;
}
import t from "other";
((function(r) {
    if (Array.isArray(r)) return r;
})(t) || function(r, t) {
    var e, n, o = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
    if (null != o) {
        var a = [], l = !0, u = !1;
        try {
            for(o = o.call(r); !(l = (e = o.next()).done) && (a.push(e.value), !t || a.length !== t); l = !0);
        } catch (r) {
            u = !0, n = r;
        } finally{
            try {
                l || null == o.return || o.return();
            } finally{
                if (u) throw n;
            }
        }
        return a;
    }
}(t, 1) || function(t, e) {
    if (t) {
        if ("string" == typeof t) return r(t, e);
        var n = Object.prototype.toString.call(t).slice(8, -1);
        if ("Object" === n && t.constructor && (n = t.constructor.name), "Map" === n || "Set" === n) return Array.from(n);
        if ("Arguments" === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return r(t, e);
    }
}(t, 1) || function() {
    throw TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}())[0];
export var __N_SSG = !0;
export default function e() {
    return React.createElement("div", null);
}
