function r(r, t) {
    (null == t || t > r.length) && (t = r.length);
    for(var n = 0, e = new Array(t); n < t; n++)e[n] = r[n];
    return e;
}
import t from "other";
(function(t, n) {
    return function(r) {
        if (Array.isArray(r)) return r;
    }(t) || function(r, t) {
        var n, e, l = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
        if (null != l) {
            var u = [], o = !0, f = !1;
            try {
                for(l = l.call(r); !(o = (n = l.next()).done) && (u.push(n.value), !t || u.length !== t); o = !0);
            } catch (i) {
                f = !0, e = i;
            } finally{
                try {
                    o || null == l.return || l.return();
                } finally{
                    if (f) throw e;
                }
            }
            return u;
        }
    }(t, n) || function t(n, e) {
        if (n) {
            if ("string" == typeof n) return r(n, e);
            var l = Object.prototype.toString.call(n).slice(8, -1);
            if ("Object" === l && n.constructor && (l = n.constructor.name), "Map" === l || "Set" === l) return Array.from(l);
            if ("Arguments" === l || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(l)) return r(n, e);
        }
    }(t, n) || function() {
        throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    }();
})(t, 1)[0];
export var __N_SSG = !0;
export default function n() {
    return React.createElement("div", null);
};
