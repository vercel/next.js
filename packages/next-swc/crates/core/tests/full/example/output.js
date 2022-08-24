function n(n, t) {
    (null == t || t > n.length) && (t = n.length);
    for(var r = 0, e = new Array(t); r < t; r++)e[r] = n[r];
    return e;
}
import t from "other";
(function(t, r) {
    return function(n) {
        if (Array.isArray(n)) return n;
    }(t) || function(n, t) {
        var r, e, o = null == n ? null : "undefined" != typeof Symbol && n[Symbol.iterator] || n["@@iterator"];
        if (null != o) {
            var u = [], l = !0, f = !1;
            try {
                for(o = o.call(n); !(l = (r = o.next()).done) && (u.push(r.value), !t || u.length !== t); l = !0);
            } catch (i) {
                f = !0, e = i;
            } finally{
                try {
                    l || null == o.return || o.return();
                } finally{
                    if (f) throw e;
                }
            }
            return u;
        }
    }(t, r) || function t(r, e) {
        if (r) {
            if ("string" == typeof r) return n(r, e);
            var o = Object.prototype.toString.call(r).slice(8, -1);
            if ("Object" === o && r.constructor && (o = r.constructor.name), "Map" === o || "Set" === o) return Array.from(o);
            if ("Arguments" === o || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(o)) return n(r, e);
        }
    }(t, r) || function() {
        throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    }();
})(t, 1)[0];
var r = function() {
    "use strict";
    !function(n, t) {
        if (!(n instanceof t)) throw new TypeError("Cannot call a class as a function");
    }(this, r);
};
export var __N_SSG = !0;
export default function e() {
    return React.createElement("div", null);
};
