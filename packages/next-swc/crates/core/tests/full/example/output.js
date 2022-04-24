function b(c, a) {
    (null == a || a > c.length) && (a = c.length);
    for(var b = 0, d = new Array(a); b < a; b++)d[b] = c[b];
    return d;
}
import a from "other";
(function(c, b) {
    return function(c) {
        if (Array.isArray(c)) return c;
    }(c) || function(c, b) {
        var d, e, a = null == c ? null : "undefined" != typeof Symbol && c[Symbol.iterator] || c["@@iterator"];
        if (null != a) {
            var b = [], c = !0, f = !1;
            try {
                for(a = a.call(c); !(c = (d = a.next()).done) && (b.push(d.value), !b || b.length !== b); c = !0);
            } catch (g) {
                f = !0, e = g;
            } finally{
                try {
                    c || null == a.return || a.return();
                } finally{
                    if (f) throw e;
                }
            }
            return b;
        }
    }(c, b) || function(a, d) {
        if (a) {
            if ("string" == typeof a) return b(a, d);
            var c = Object.prototype.toString.call(a).slice(8, -1);
            if ("Object" === c && a.constructor && (c = a.constructor.name), "Map" === c || "Set" === c) return Array.from(c);
            if ("Arguments" === c || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(c)) return b(a, d);
        }
    }(c, b) || function() {
        throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    }();
})(a, 1)[0];
var c = function() {
    "use strict";
    !function(a, b) {
        if (!(a instanceof b)) throw new TypeError("Cannot call a class as a function");
    }(this, c);
};
export var __N_SSG = !0;
export default function d() {
    return React.createElement("div", null);
};
