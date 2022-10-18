function t(t, r) {
    (null == r || r > t.length) && (r = t.length);
    for(var n = 0, e = new Array(r); n < r; n++)e[n] = t[n];
    return e;
}
import r from "other";
(function(r, n) {
    return function(t) {
        if (Array.isArray(t)) return t;
    }(r) || function(t, r) {
        var n, e, o = null == t ? null : "undefined" != typeof Symbol && t[Symbol.iterator] || t["@@iterator"];
        if (null != o) {
            var u = [], l = !0, i = !1;
            try {
                for(o = o.call(t); !(l = (n = o.next()).done) && (u.push(n.value), !r || u.length !== r); l = !0);
            } catch (a) {
                i = !0, e = a;
            } finally{
                try {
                    l || null == o.return || o.return();
                } finally{
                    if (i) throw e;
                }
            }
            return u;
        }
    }(r, n) || function(r, n) {
        if (r) {
            if ("string" == typeof r) return t(r, n);
            var e = Object.prototype.toString.call(r).slice(8, -1);
            if ("Object" === e && r.constructor && (e = r.constructor.name), "Map" === e || "Set" === e) return Array.from(e);
            if ("Arguments" === e || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(e)) return t(r, n);
        }
    }(r, n) || function() {
        throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    }();
})(r, 1)[0];
export var __N_SSG = !0;
export default function n() {
    return React.createElement("div", null);
}
