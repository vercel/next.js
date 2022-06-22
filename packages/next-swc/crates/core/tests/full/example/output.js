function b(c, a) {
    (null == a || a > c.length) && (a = c.length);
    for(var b = 0, d = new Array(a); b < a; b++)d[b] = c[b];
    return d;
}
import a from "other";
(function(a, c) {
    return function(a) {
        if (Array.isArray(a)) return a;
    }(a) || function(b, e) {
        var f, g, a = null == b ? null : "undefined" != typeof Symbol && b[Symbol.iterator] || b["@@iterator"];
        if (null != a) {
            var c = [], d = !0, h = !1;
            try {
                for(a = a.call(b); !(d = (f = a.next()).done) && (c.push(f.value), !e || c.length !== e); d = !0);
            } catch (i) {
                h = !0, g = i;
            } finally{
                try {
                    d || null == a.return || a.return();
                } finally{
                    if (h) throw g;
                }
            }
            return c;
        }
    }(a, c) || function e(a, d) {
        if (a) {
            if ("string" == typeof a) return b(a, d);
            var c = Object.prototype.toString.call(a).slice(8, -1);
            if ("Object" === c && a.constructor && (c = a.constructor.name), "Map" === c || "Set" === c) return Array.from(c);
            if ("Arguments" === c || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(c)) return b(a, d);
        }
    }(a, c) || function() {
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
