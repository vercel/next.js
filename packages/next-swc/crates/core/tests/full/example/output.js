function t(t, r) {
    (null == r || r > t.length) && (r = t.length);
    for(var n = 0, e = new Array(r); n < r; n++)e[n] = t[n];
    return e;
}
import r from "other";
var n = function(r, n) {
    return function(t) {
        if (Array.isArray(t)) return t;
    }(r) || function(t, r) {
        var n, e, o = null == t ? null : "undefined" != typeof Symbol && t[Symbol.iterator] || t["@@iterator"];
        if (null != o) {
            var u = [], l = !0, a = !1;
            try {
                for(o = o.call(t); !(l = (n = o.next()).done) && (u.push(n.value), !r || u.length !== r); l = !0);
            } catch (i) {
                a = !0, e = i;
            } finally{
                try {
                    l || null == o.return || o.return();
                } finally{
                    if (a) throw e;
                }
            }
            return u;
        }
    }(r, n) || function r(n, e) {
        if (n) {
            if ("string" == typeof n) return t(n, e);
            var o = Object.prototype.toString.call(n).slice(8, -1);
            if ("Object" === o && n.constructor && (o = n.constructor.name), "Map" === o || "Set" === o) return Array.from(o);
            if ("Arguments" === o || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(o)) return t(n, e);
        }
    }(r, n) || function() {
        throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    }();
}(r, 1);
n[0];
export var __N_SSG = !0;
export default function e() {
    return React.createElement("div", null);
};
