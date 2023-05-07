function r(r, t) {
    (null == t || t > r.length) && (t = r.length);
    for(var n = 0, e = Array(t); n < t; n++)e[n] = r[n];
    return e;
}
import t from "other";
(function(t, n) {
    return function(r) {
        if (Array.isArray(r)) return r;
    }(t) || function(r, t) {
        var n, e, o = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
        if (null != o) {
            var a = [], l = !0, u = !1;
            try {
                for(o = o.call(r); !(l = (n = o.next()).done) && (a.push(n.value), !t || a.length !== t); l = !0);
            } catch (r) {
                u = !0, e = r;
            } finally{
                try {
                    l || null == o.return || o.return();
                } finally{
                    if (u) throw e;
                }
            }
            return a;
        }
    }(t, n) || function(t, n) {
        if (t) {
            if ("string" == typeof t) return r(t, n);
            var e = Object.prototype.toString.call(t).slice(8, -1);
            if ("Object" === e && t.constructor && (e = t.constructor.name), "Map" === e || "Set" === e) return Array.from(e);
            if ("Arguments" === e || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(e)) return r(t, n);
        }
    }(t, n) || function() {
        throw TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    }();
})(t, 1)[0];
export var __N_SSG = !0;
export default function n() {
    return React.createElement("div", null);
}
