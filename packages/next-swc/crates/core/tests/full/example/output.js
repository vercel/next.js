function b(c, a) {
    (null == a || a > c.length) && (a = c.length);
    for(var b = 0, d = new Array(a); b < a; b++)d[b] = c[b];
    return d;
}
import a from "other";
(function(c, b) {
    return (function(c) {
        if (Array.isArray(c)) return c;
    })(c) || (function(c, b) {
        var g, h, a = null == c ? null : "undefined" != typeof Symbol && c[Symbol.iterator] || c["@@iterator"];
        if (null != a) {
            var d = [], e = !0, i = !1;
            try {
                for(a = a.call(c); !(e = (g = a.next()).done) && (d.push(g.value), !b || d.length !== b); e = !0);
            } catch (j) {
                i = !0, h = j;
            } finally{
                try {
                    e || null == a.return || a.return();
                } finally{
                    if (i) throw h;
                }
            }
            return d;
        }
    })(c, b) || (function(a, d) {
        if (a) {
            if ("string" == typeof a) return b(a, d);
            var c = Object.prototype.toString.call(a).slice(8, -1);
            if ("Object" === c && a.constructor && (c = a.constructor.name), "Map" === c || "Set" === c) return Array.from(c);
            if ("Arguments" === c || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(c)) return b(a, d);
        }
    })(c, b) || (function() {
        throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    })();
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
