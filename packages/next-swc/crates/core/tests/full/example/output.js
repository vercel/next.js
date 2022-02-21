function a(a, b) {
    (null == b || b > a.length) && (b = a.length);
    for(var c = 0, d = new Array(b); c < b; c++)d[c] = a[c];
    return d;
}
import b from "other";
(function(a, c) {
    return (function(a) {
        if (Array.isArray(a)) return a;
    })(a) || (function(a, c) {
        var d, e, f = null == a ? null : "undefined" != typeof Symbol && a[Symbol.iterator] || a["@@iterator"];
        if (null != f) {
            var g = [], h = !0, i = !1;
            try {
                for(f = f.call(a); !(h = (d = f.next()).done) && (g.push(d.value), !c || g.length !== c); h = !0);
            } catch (j) {
                i = !0, e = j;
            } finally{
                try {
                    h || null == f.return || f.return();
                } finally{
                    if (i) throw e;
                }
            }
            return g;
        }
    })(a, c) || (function(b, c) {
        if (b) {
            if ("string" == typeof b) return a(b, c);
            var d = Object.prototype.toString.call(b).slice(8, -1);
            if ("Object" === d && b.constructor && (d = b.constructor.name), "Map" === d || "Set" === d) return Array.from(d);
            if ("Arguments" === d || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(d)) return a(b, c);
        }
    })(a, c) || (function() {
        throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    })();
})(b, 1)[0];
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
