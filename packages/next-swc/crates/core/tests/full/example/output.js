function a(a, b) {
    (null == b || b > a.length) && (b = a.length);
    for(var c = 0, d = new Array(b); c < b; c++)d[c] = a[c];
    return d;
}
import b from "other";
(function(b, c) {
    return function(a) {
        if (Array.isArray(a)) return a;
    }(b) || function(a, b) {
        var c, d, e = null == a ? null : "undefined" != typeof Symbol && a[Symbol.iterator] || a["@@iterator"];
        if (null != e) {
            var f = [], g = !0, h = !1;
            try {
                for(e = e.call(a); !(g = (c = e.next()).done) && (f.push(c.value), !b || f.length !== b); g = !0);
            } catch (i) {
                h = !0, d = i;
            } finally{
                try {
                    g || null == e.return || e.return();
                } finally{
                    if (h) throw d;
                }
            }
            return f;
        }
    }(b, c) || function b(c, d) {
        if (c) {
            if ("string" == typeof c) return a(c, d);
            var e = Object.prototype.toString.call(c).slice(8, -1);
            if ("Object" === e && c.constructor && (e = c.constructor.name), "Map" === e || "Set" === e) return Array.from(e);
            if ("Arguments" === e || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(e)) return a(c, d);
        }
    }(b, c) || function() {
        throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    }();
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
