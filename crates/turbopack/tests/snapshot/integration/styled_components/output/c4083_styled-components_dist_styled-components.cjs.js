(self.TURBOPACK = self.TURBOPACK || []).push(["output/c4083_styled-components_dist_styled-components.cjs.js", {

"[project]/node_modules/.pnpm/styled-components@5.3.6_7i5myeigehqah43i5u7wbekgba/node_modules/styled-components/dist/styled-components.cjs.js (ecmascript)": (function({ r: __turbopack_require__, x: __turbopack_external_require__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, c: __turbopack_cache__, l: __turbopack_load__, p: process, __dirname, m: module, e: exports }) { !function() {

"use strict";
function e(e) {
    return e && "object" == typeof e && "default" in e ? e.default : e;
}
Object.defineProperty(exports, "__esModule", {
    value: !0
});
var t = __turbopack_require__("[project]/node_modules/.pnpm/react-is@18.2.0/node_modules/react-is/index.js (ecmascript)"), n = __turbopack_require__("[project]/node_modules/.pnpm/react@18.2.0/node_modules/react/index.js (ecmascript)"), r = e(n), o = e(__turbopack_require__("[project]/node_modules/.pnpm/shallowequal@1.1.0/node_modules/shallowequal/index.js (ecmascript)")), s = e(__turbopack_require__("[project]/node_modules/.pnpm/@emotion+stylis@0.8.5/node_modules/@emotion/stylis/dist/stylis.cjs.js (ecmascript)")), i = e(__turbopack_require__("[project]/node_modules/.pnpm/@emotion+unitless@0.7.5/node_modules/@emotion/unitless/dist/unitless.cjs.js (ecmascript)")), a = e(__turbopack_require__("[project]/node_modules/.pnpm/@emotion+is-prop-valid@1.2.0/node_modules/@emotion/is-prop-valid/dist/emotion-is-prop-valid.cjs.js (ecmascript)")), c = e(__turbopack_require__("[project]/node_modules/.pnpm/hoist-non-react-statics@3.3.2/node_modules/hoist-non-react-statics/dist/hoist-non-react-statics.cjs.js (ecmascript)"));
function u() {
    return (u = Object.assign || function(e) {
        for(var t = 1; t < arguments.length; t++){
            var n = arguments[t];
            for(var r in n)Object.prototype.hasOwnProperty.call(n, r) && (e[r] = n[r]);
        }
        return e;
    }).apply(this, arguments);
}
var l = function(e, t) {
    for(var n = [
        e[0]
    ], r = 0, o = t.length; r < o; r += 1)n.push(t[r], e[r + 1]);
    return n;
}, d = function(e) {
    return null !== e && "object" == typeof e && "[object Object]" === (e.toString ? e.toString() : Object.prototype.toString.call(e)) && !t.typeOf(e);
}, h = Object.freeze([]), p = Object.freeze({});
function f(e) {
    return "function" == typeof e;
}
function m(e) {
    return "production" !== process.env.NODE_ENV && "string" == typeof e && e || e.displayName || e.name || "Component";
}
function y(e) {
    return e && "string" == typeof e.styledComponentId;
}
var v = "undefined" != typeof process && (process.env.REACT_APP_SC_ATTR || process.env.SC_ATTR) || "data-styled", g = "undefined" != typeof window && "HTMLElement" in window, S = Boolean("boolean" == typeof SC_DISABLE_SPEEDY ? SC_DISABLE_SPEEDY : "undefined" != typeof process && void 0 !== process.env.REACT_APP_SC_DISABLE_SPEEDY && "" !== process.env.REACT_APP_SC_DISABLE_SPEEDY ? "false" !== process.env.REACT_APP_SC_DISABLE_SPEEDY && process.env.REACT_APP_SC_DISABLE_SPEEDY : "undefined" != typeof process && void 0 !== process.env.SC_DISABLE_SPEEDY && "" !== process.env.SC_DISABLE_SPEEDY ? "false" !== process.env.SC_DISABLE_SPEEDY && process.env.SC_DISABLE_SPEEDY : "production" !== process.env.NODE_ENV), w = {}, E = "production" !== process.env.NODE_ENV ? {
    1: "Cannot create styled-component for component: %s.\n\n",
    2: "Can't collect styles once you've consumed a `ServerStyleSheet`'s styles! `ServerStyleSheet` is a one off instance for each server-side render cycle.\n\n- Are you trying to reuse it across renders?\n- Are you accidentally calling collectStyles twice?\n\n",
    3: "Streaming SSR is only supported in a Node.js environment; Please do not try to call this method in the browser.\n\n",
    4: "The `StyleSheetManager` expects a valid target or sheet prop!\n\n- Does this error occur on the client and is your target falsy?\n- Does this error occur on the server and is the sheet falsy?\n\n",
    5: "The clone method cannot be used on the client!\n\n- Are you running in a client-like environment on the server?\n- Are you trying to run SSR on the client?\n\n",
    6: "Trying to insert a new style tag, but the given Node is unmounted!\n\n- Are you using a custom target that isn't mounted?\n- Does your document not have a valid head element?\n- Have you accidentally removed a style tag manually?\n\n",
    7: 'ThemeProvider: Please return an object from your "theme" prop function, e.g.\n\n```js\ntheme={() => ({})}\n```\n\n',
    8: 'ThemeProvider: Please make your "theme" prop an object.\n\n',
    9: "Missing document `<head>`\n\n",
    10: "Cannot find a StyleSheet instance. Usually this happens if there are multiple copies of styled-components loaded at once. Check out this issue for how to troubleshoot and fix the common cases where this situation can happen: https://github.com/styled-components/styled-components/issues/1941#issuecomment-417862021\n\n",
    11: "_This error was replaced with a dev-time warning, it will be deleted for v4 final._ [createGlobalStyle] received children which will not be rendered. Please use the component without passing children elements.\n\n",
    12: "It seems you are interpolating a keyframe declaration (%s) into an untagged string. This was supported in styled-components v3, but is not longer supported in v4 as keyframes are now injected on-demand. Please wrap your string in the css\\`\\` helper which ensures the styles are injected correctly. See https://www.styled-components.com/docs/api#css\n\n",
    13: "%s is not a styled component and cannot be referred to via component selector. See https://www.styled-components.com/docs/advanced#referring-to-other-components for more details.\n\n",
    14: 'ThemeProvider: "theme" prop is required.\n\n',
    15: "A stylis plugin has been supplied that is not named. We need a name for each plugin to be able to prevent styling collisions between different stylis configurations within the same app. Before you pass your plugin to `<StyleSheetManager stylisPlugins={[]}>`, please make sure each plugin is uniquely-named, e.g.\n\n```js\nObject.defineProperty(importedPlugin, 'name', { value: 'some-unique-name' });\n```\n\n",
    16: "Reached the limit of how many styled components may be created at group %s.\nYou may only create up to 1,073,741,824 components. If you're creating components dynamically,\nas for instance in your render method then you may be running into this limitation.\n\n",
    17: "CSSStyleSheet could not be found on HTMLStyleElement.\nHas styled-components' style tag been unmounted or altered by another script?\n"
} : {};
function b() {
    for(var e = arguments.length <= 0 ? void 0 : arguments[0], t = [], n = 1, r = arguments.length; n < r; n += 1)t.push(n < 0 || arguments.length <= n ? void 0 : arguments[n]);
    return t.forEach(function(t) {
        e = e.replace(/%[a-z]/, t);
    }), e;
}
function _(e) {
    for(var t = arguments.length, n = new Array(t > 1 ? t - 1 : 0), r = 1; r < t; r++)n[r - 1] = arguments[r];
    throw "production" === process.env.NODE_ENV ? new Error("An error occurred. See https://git.io/JUIaE#" + e + " for more information." + (n.length > 0 ? " Args: " + n.join(", ") : "")) : new Error(b.apply(void 0, [
        E[e]
    ].concat(n)).trim());
}
var N = function() {
    function e(e) {
        this.groupSizes = new Uint32Array(512), this.length = 512, this.tag = e;
    }
    var t = e.prototype;
    return t.indexOfGroup = function(e) {
        for(var t = 0, n = 0; n < e; n++)t += this.groupSizes[n];
        return t;
    }, t.insertRules = function(e, t) {
        if (e >= this.groupSizes.length) {
            for(var n = this.groupSizes, r = n.length, o = r; e >= o;)(o <<= 1) < 0 && _(16, "" + e);
            this.groupSizes = new Uint32Array(o), this.groupSizes.set(n), this.length = o;
            for(var s = r; s < o; s++)this.groupSizes[s] = 0;
        }
        for(var i = this.indexOfGroup(e + 1), a = 0, c = t.length; a < c; a++)this.tag.insertRule(i, t[a]) && (this.groupSizes[e]++, i++);
    }, t.clearGroup = function(e) {
        if (e < this.length) {
            var t = this.groupSizes[e], n = this.indexOfGroup(e), r = n + t;
            this.groupSizes[e] = 0;
            for(var o = n; o < r; o++)this.tag.deleteRule(n);
        }
    }, t.getGroup = function(e) {
        var t = "";
        if (e >= this.length || 0 === this.groupSizes[e]) return t;
        for(var n = this.groupSizes[e], r = this.indexOfGroup(e), o = r + n, s = r; s < o; s++)t += this.tag.getRule(s) + "/*!sc*/\n";
        return t;
    }, e;
}(), C = new Map, A = new Map, I = 1, P = function(e) {
    if (C.has(e)) return C.get(e);
    for(; A.has(I);)I++;
    var t = I++;
    return "production" !== process.env.NODE_ENV && ((0 | t) < 0 || t > 1 << 30) && _(16, "" + t), C.set(e, t), A.set(t, e), t;
}, x = function(e) {
    return A.get(e);
}, O = function(e, t) {
    t >= I && (I = t + 1), C.set(e, t), A.set(t, e);
}, R = "style[" + v + '][data-styled-version="5.3.6"]', D = new RegExp("^" + v + '\\.g(\\d+)\\[id="([\\w\\d-]+)"\\].*?"([^"]*)'), T = function(e, t, n) {
    for(var r, o = n.split(","), s = 0, i = o.length; s < i; s++)(r = o[s]) && e.registerName(t, r);
}, j = function(e, t) {
    for(var n = (t.textContent || "").split("/*!sc*/\n"), r = [], o = 0, s = n.length; o < s; o++){
        var i = n[o].trim();
        if (i) {
            var a = i.match(D);
            if (a) {
                var c = 0 | parseInt(a[1], 10), u = a[2];
                0 !== c && (O(u, c), T(e, u, a[3]), e.getTag().insertRules(c, r)), r.length = 0;
            } else r.push(i);
        }
    }
}, k = function() {
    return "undefined" != typeof __webpack_nonce__ ? __webpack_nonce__ : null;
}, V = function(e) {
    var t = document.head, n = e || t, r = document.createElement("style"), o = function(e) {
        for(var t = e.childNodes, n = t.length; n >= 0; n--){
            var r = t[n];
            if (r && 1 === r.nodeType && r.hasAttribute(v)) return r;
        }
    }(n), s = void 0 !== o ? o.nextSibling : null;
    r.setAttribute(v, "active"), r.setAttribute("data-styled-version", "5.3.6");
    var i = k();
    return i && r.setAttribute("nonce", i), n.insertBefore(r, s), r;
}, M = function() {
    function e(e) {
        var t = this.element = V(e);
        t.appendChild(document.createTextNode("")), this.sheet = function(e) {
            if (e.sheet) return e.sheet;
            for(var t = document.styleSheets, n = 0, r = t.length; n < r; n++){
                var o = t[n];
                if (o.ownerNode === e) return o;
            }
            _(17);
        }(t), this.length = 0;
    }
    var t = e.prototype;
    return t.insertRule = function(e, t) {
        try {
            return this.sheet.insertRule(t, e), this.length++, !0;
        } catch (e) {
            return !1;
        }
    }, t.deleteRule = function(e) {
        this.sheet.deleteRule(e), this.length--;
    }, t.getRule = function(e) {
        var t = this.sheet.cssRules[e];
        return void 0 !== t && "string" == typeof t.cssText ? t.cssText : "";
    }, e;
}(), z = function() {
    function e(e) {
        var t = this.element = V(e);
        this.nodes = t.childNodes, this.length = 0;
    }
    var t = e.prototype;
    return t.insertRule = function(e, t) {
        if (e <= this.length && e >= 0) {
            var n = document.createTextNode(t), r = this.nodes[e];
            return this.element.insertBefore(n, r || null), this.length++, !0;
        }
        return !1;
    }, t.deleteRule = function(e) {
        this.element.removeChild(this.nodes[e]), this.length--;
    }, t.getRule = function(e) {
        return e < this.length ? this.nodes[e].textContent : "";
    }, e;
}(), B = function() {
    function e(e) {
        this.rules = [], this.length = 0;
    }
    var t = e.prototype;
    return t.insertRule = function(e, t) {
        return e <= this.length && (this.rules.splice(e, 0, t), this.length++, !0);
    }, t.deleteRule = function(e) {
        this.rules.splice(e, 1), this.length--;
    }, t.getRule = function(e) {
        return e < this.length ? this.rules[e] : "";
    }, e;
}(), q = g, G = {
    isServer: !g,
    useCSSOMInjection: !S
}, L = function() {
    function e(e, t, n) {
        void 0 === e && (e = p), void 0 === t && (t = {}), this.options = u({}, G, {}, e), this.gs = t, this.names = new Map(n), this.server = !!e.isServer, !this.server && g && q && (q = !1, function(e) {
            for(var t = document.querySelectorAll(R), n = 0, r = t.length; n < r; n++){
                var o = t[n];
                o && "active" !== o.getAttribute(v) && (j(e, o), o.parentNode && o.parentNode.removeChild(o));
            }
        }(this));
    }
    e.registerId = function(e) {
        return P(e);
    };
    var t = e.prototype;
    return t.reconstructWithOptions = function(t, n) {
        return void 0 === n && (n = !0), new e(u({}, this.options, {}, t), this.gs, n && this.names || void 0);
    }, t.allocateGSInstance = function(e) {
        return this.gs[e] = (this.gs[e] || 0) + 1;
    }, t.getTag = function() {
        return this.tag || (this.tag = (n = (t = this.options).isServer, r = t.useCSSOMInjection, o = t.target, e = n ? new B(o) : r ? new M(o) : new z(o), new N(e)));
        var e, t, n, r, o;
    }, t.hasNameForId = function(e, t) {
        return this.names.has(e) && this.names.get(e).has(t);
    }, t.registerName = function(e, t) {
        if (P(e), this.names.has(e)) this.names.get(e).add(t);
        else {
            var n = new Set;
            n.add(t), this.names.set(e, n);
        }
    }, t.insertRules = function(e, t, n) {
        this.registerName(e, t), this.getTag().insertRules(P(e), n);
    }, t.clearNames = function(e) {
        this.names.has(e) && this.names.get(e).clear();
    }, t.clearRules = function(e) {
        this.getTag().clearGroup(P(e)), this.clearNames(e);
    }, t.clearTag = function() {
        this.tag = void 0;
    }, t.toString = function() {
        return function(e) {
            for(var t = e.getTag(), n = t.length, r = "", o = 0; o < n; o++){
                var s = x(o);
                if (void 0 !== s) {
                    var i = e.names.get(s), a = t.getGroup(o);
                    if (i && a && i.size) {
                        var c = v + ".g" + o + '[id="' + s + '"]', u = "";
                        void 0 !== i && i.forEach(function(e) {
                            e.length > 0 && (u += e + ",");
                        }), r += "" + a + c + '{content:"' + u + '"}/*!sc*/\n';
                    }
                }
            }
            return r;
        }(this);
    }, e;
}(), F = /(a)(d)/gi, Y = function(e) {
    return String.fromCharCode(e + (e > 25 ? 39 : 97));
};
function H(e) {
    var t, n = "";
    for(t = Math.abs(e); t > 52; t = t / 52 | 0)n = Y(t % 52) + n;
    return (Y(t % 52) + n).replace(F, "$1-$2");
}
var $ = function(e, t) {
    for(var n = t.length; n;)e = 33 * e ^ t.charCodeAt(--n);
    return e;
}, W = function(e) {
    return $(5381, e);
};
function U(e) {
    for(var t = 0; t < e.length; t += 1){
        var n = e[t];
        if (f(n) && !y(n)) return !1;
    }
    return !0;
}
var J = W("5.3.6"), X = function() {
    function e(e, t, n) {
        this.rules = e, this.staticRulesId = "", this.isStatic = "production" === process.env.NODE_ENV && (void 0 === n || n.isStatic) && U(e), this.componentId = t, this.baseHash = $(J, t), this.baseStyle = n, L.registerId(t);
    }
    return e.prototype.generateAndInjectStyles = function(e, t, n) {
        var r = this.componentId, o = [];
        if (this.baseStyle && o.push(this.baseStyle.generateAndInjectStyles(e, t, n)), this.isStatic && !n.hash) if (this.staticRulesId && t.hasNameForId(r, this.staticRulesId)) o.push(this.staticRulesId);
        else {
            var s = me(this.rules, e, t, n).join(""), i = H($(this.baseHash, s) >>> 0);
            if (!t.hasNameForId(r, i)) {
                var a = n(s, "." + i, void 0, r);
                t.insertRules(r, i, a);
            }
            o.push(i), this.staticRulesId = i;
        }
        else {
            for(var c = this.rules.length, u = $(this.baseHash, n.hash), l = "", d = 0; d < c; d++){
                var h = this.rules[d];
                if ("string" == typeof h) l += h, "production" !== process.env.NODE_ENV && (u = $(u, h + d));
                else if (h) {
                    var p = me(h, e, t, n), f = Array.isArray(p) ? p.join("") : p;
                    u = $(u, f + d), l += f;
                }
            }
            if (l) {
                var m = H(u >>> 0);
                if (!t.hasNameForId(r, m)) {
                    var y = n(l, "." + m, void 0, r);
                    t.insertRules(r, m, y);
                }
                o.push(m);
            }
        }
        return o.join(" ");
    }, e;
}(), Z = /^\s*\/\/.*$/gm, K = [
    ":",
    "[",
    ".",
    "#"
];
function Q(e) {
    var t, n, r, o, i = void 0 === e ? p : e, a = i.options, c = void 0 === a ? p : a, u = i.plugins, l = void 0 === u ? h : u, d = new s(c), f = [], m = function(e) {
        function t(t) {
            if (t) try {
                e(t + "}");
            } catch (e) {}
        }
        return function(n, r, o, s, i, a, c, u, l, d) {
            switch(n){
                case 1:
                    if (0 === l && 64 === r.charCodeAt(0)) return e(r + ";"), "";
                    break;
                case 2:
                    if (0 === u) return r + "/*|*/";
                    break;
                case 3:
                    switch(u){
                        case 102:
                        case 112:
                            return e(o[0] + r), "";
                        default:
                            return r + (0 === d ? "/*|*/" : "");
                    }
                case -2:
                    r.split("/*|*/}").forEach(t);
            }
        };
    }(function(e) {
        f.push(e);
    }), y = function(e, r, s) {
        return 0 === r && -1 !== K.indexOf(s[n.length]) || s.match(o) ? e : "." + t;
    };
    function v(e, s, i, a) {
        void 0 === a && (a = "&");
        var c = e.replace(Z, ""), u = s && i ? i + " " + s + " { " + c + " }" : c;
        return t = a, n = s, r = new RegExp("\\" + n + "\\b", "g"), o = new RegExp("(\\" + n + "\\b){2,}"), d(i || !s ? "" : s, u);
    }
    return d.use([].concat(l, [
        function(e, t, o) {
            2 === e && o.length && o[0].lastIndexOf(n) > 0 && (o[0] = o[0].replace(r, y));
        },
        m,
        function(e) {
            if (-2 === e) {
                var t = f;
                return f = [], t;
            }
        }
    ])), v.hash = l.length ? l.reduce(function(e, t) {
        return t.name || _(15), $(e, t.name);
    }, 5381).toString() : "", v;
}
var ee = r.createContext(), te = ee.Consumer, ne = r.createContext(), re = (ne.Consumer, new L), oe = Q();
function se() {
    return n.useContext(ee) || re;
}
function ie() {
    return n.useContext(ne) || oe;
}
function ae(e) {
    var t = n.useState(e.stylisPlugins), s = t[0], i = t[1], a = se(), c = n.useMemo(function() {
        var t = a;
        return e.sheet ? t = e.sheet : e.target && (t = t.reconstructWithOptions({
            target: e.target
        }, !1)), e.disableCSSOMInjection && (t = t.reconstructWithOptions({
            useCSSOMInjection: !1
        })), t;
    }, [
        e.disableCSSOMInjection,
        e.sheet,
        e.target
    ]), u = n.useMemo(function() {
        return Q({
            options: {
                prefix: !e.disableVendorPrefixes
            },
            plugins: s
        });
    }, [
        e.disableVendorPrefixes,
        s
    ]);
    return n.useEffect(function() {
        o(s, e.stylisPlugins) || i(e.stylisPlugins);
    }, [
        e.stylisPlugins
    ]), r.createElement(ee.Provider, {
        value: c
    }, r.createElement(ne.Provider, {
        value: u
    }, "production" !== process.env.NODE_ENV ? r.Children.only(e.children) : e.children));
}
var ce = function() {
    function e(e, t) {
        var n = this;
        this.inject = function(e, t) {
            void 0 === t && (t = oe);
            var r = n.name + t.hash;
            e.hasNameForId(n.id, r) || e.insertRules(n.id, r, t(n.rules, r, "@keyframes"));
        }, this.toString = function() {
            return _(12, String(n.name));
        }, this.name = e, this.id = "sc-keyframes-" + e, this.rules = t;
    }
    return e.prototype.getName = function(e) {
        return void 0 === e && (e = oe), this.name + e.hash;
    }, e;
}(), ue = /([A-Z])/, le = /([A-Z])/g, de = /^ms-/, he = function(e) {
    return "-" + e.toLowerCase();
};
function pe(e) {
    return ue.test(e) ? e.replace(le, he).replace(de, "-ms-") : e;
}
var fe = function(e) {
    return null == e || !1 === e || "" === e;
};
function me(e, n, r, o) {
    if (Array.isArray(e)) {
        for(var s, a = [], c = 0, u = e.length; c < u; c += 1)"" !== (s = me(e[c], n, r, o)) && (Array.isArray(s) ? a.push.apply(a, s) : a.push(s));
        return a;
    }
    if (fe(e)) return "";
    if (y(e)) return "." + e.styledComponentId;
    if (f(e)) {
        if ("function" != typeof (h = e) || h.prototype && h.prototype.isReactComponent || !n) return e;
        var l = e(n);
        return "production" !== process.env.NODE_ENV && t.isElement(l) && console.warn(m(e) + " is not a styled component and cannot be referred to via component selector. See https://www.styled-components.com/docs/advanced#referring-to-other-components for more details."), me(l, n, r, o);
    }
    var h;
    return e instanceof ce ? r ? (e.inject(r, o), e.getName(o)) : e : d(e) ? function e(t, n) {
        var r, o, s = [];
        for(var a in t)t.hasOwnProperty(a) && !fe(t[a]) && (Array.isArray(t[a]) && t[a].isCss || f(t[a]) ? s.push(pe(a) + ":", t[a], ";") : d(t[a]) ? s.push.apply(s, e(t[a], a)) : s.push(pe(a) + ": " + (r = a, null == (o = t[a]) || "boolean" == typeof o || "" === o ? "" : "number" != typeof o || 0 === o || r in i ? String(o).trim() : o + "px") + ";"));
        return n ? [
            n + " {"
        ].concat(s, [
            "}"
        ]) : s;
    }(e) : e.toString();
}
var ye = function(e) {
    return Array.isArray(e) && (e.isCss = !0), e;
};
function ve(e) {
    for(var t = arguments.length, n = new Array(t > 1 ? t - 1 : 0), r = 1; r < t; r++)n[r - 1] = arguments[r];
    return f(e) || d(e) ? ye(me(l(h, [
        e
    ].concat(n)))) : 0 === n.length && 1 === e.length && "string" == typeof e[0] ? e : ye(me(l(e, n)));
}
var ge = /invalid hook call/i, Se = new Set, we = function(e, t) {
    if ("production" !== process.env.NODE_ENV) {
        var r = "The component " + e + (t ? ' with the id of "' + t + '"' : "") + " has been created dynamically.\nYou may see this warning because you've called styled inside another component.\nTo resolve this only create new StyledComponents outside of any render method and function component.", o = console.error;
        try {
            var s = !0;
            console.error = function(e) {
                if (ge.test(e)) s = !1, Se.delete(r);
                else {
                    for(var t = arguments.length, n = new Array(t > 1 ? t - 1 : 0), i = 1; i < t; i++)n[i - 1] = arguments[i];
                    o.apply(void 0, [
                        e
                    ].concat(n));
                }
            }, n.useRef(), s && !Se.has(r) && (console.warn(r), Se.add(r));
        } catch (e) {
            ge.test(e.message) && Se.delete(r);
        } finally{
            console.error = o;
        }
    }
}, Ee = function(e, t, n) {
    return void 0 === n && (n = p), e.theme !== n.theme && e.theme || t || n.theme;
}, be = /[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~-]+/g, _e = /(^-|-$)/g;
function Ne(e) {
    return e.replace(be, "-").replace(_e, "");
}
var Ce = function(e) {
    return H(W(e) >>> 0);
};
function Ae(e) {
    return "string" == typeof e && ("production" === process.env.NODE_ENV || e.charAt(0) === e.charAt(0).toLowerCase());
}
var Ie = function(e) {
    return "function" == typeof e || "object" == typeof e && null !== e && !Array.isArray(e);
}, Pe = function(e) {
    return "__proto__" !== e && "constructor" !== e && "prototype" !== e;
};
function xe(e, t, n) {
    var r = e[n];
    Ie(t) && Ie(r) ? Oe(r, t) : e[n] = t;
}
function Oe(e) {
    for(var t = arguments.length, n = new Array(t > 1 ? t - 1 : 0), r = 1; r < t; r++)n[r - 1] = arguments[r];
    for(var o = 0, s = n; o < s.length; o++){
        var i = s[o];
        if (Ie(i)) for(var a in i)Pe(a) && xe(e, i[a], a);
    }
    return e;
}
var Re = r.createContext(), De = Re.Consumer, Te = {};
function je(e, t, o) {
    var s = y(e), i = !Ae(e), l = t.attrs, d = void 0 === l ? h : l, v = t.componentId, g = void 0 === v ? function(e, t) {
        var n = "string" != typeof e ? "sc" : Ne(e);
        Te[n] = (Te[n] || 0) + 1;
        var r = n + "-" + Ce("5.3.6" + n + Te[n]);
        return t ? t + "-" + r : r;
    }(t.displayName, t.parentComponentId) : v, S = t.displayName, w = void 0 === S ? function(e) {
        return Ae(e) ? "styled." + e : "Styled(" + m(e) + ")";
    }(e) : S, E = t.displayName && t.componentId ? Ne(t.displayName) + "-" + t.componentId : t.componentId || g, b = s && e.attrs ? Array.prototype.concat(e.attrs, d).filter(Boolean) : d, _ = t.shouldForwardProp;
    s && e.shouldForwardProp && (_ = t.shouldForwardProp ? function(n, r, o) {
        return e.shouldForwardProp(n, r, o) && t.shouldForwardProp(n, r, o);
    } : e.shouldForwardProp);
    var N, C = new X(o, E, s ? e.componentStyle : void 0), A = C.isStatic && 0 === d.length, I = function(e, t) {
        return function(e, t, r, o) {
            var s = e.attrs, i = e.componentStyle, c = e.defaultProps, l = e.foldedComponentIds, d = e.shouldForwardProp, h = e.styledComponentId, m = e.target;
            "production" !== process.env.NODE_ENV && n.useDebugValue(h);
            var y = function(e, t, n) {
                void 0 === e && (e = p);
                var r = u({}, t, {
                    theme: e
                }), o = {};
                return n.forEach(function(e) {
                    var t, n, s, i = e;
                    for(t in f(i) && (i = i(r)), i)r[t] = o[t] = "className" === t ? (n = o[t], s = i[t], n && s ? n + " " + s : n || s) : i[t];
                }), [
                    r,
                    o
                ];
            }(Ee(t, n.useContext(Re), c) || p, t, s), v = y[0], g = y[1], S = function(e, t, r, o) {
                var s = se(), i = ie(), a = t ? e.generateAndInjectStyles(p, s, i) : e.generateAndInjectStyles(r, s, i);
                return "production" !== process.env.NODE_ENV && n.useDebugValue(a), "production" !== process.env.NODE_ENV && !t && o && o(a), a;
            }(i, o, v, "production" !== process.env.NODE_ENV ? e.warnTooManyClasses : void 0), w = r, E = g.$as || t.$as || g.as || t.as || m, b = Ae(E), _ = g !== t ? u({}, t, {}, g) : t, N = {};
            for(var C in _)"$" !== C[0] && "as" !== C && ("forwardedAs" === C ? N.as = _[C] : (d ? d(C, a, E) : !b || a(C)) && (N[C] = _[C]));
            return t.style && g.style !== t.style && (N.style = u({}, t.style, {}, g.style)), N.className = Array.prototype.concat(l, h, S !== h ? S : null, t.className, g.className).filter(Boolean).join(" "), N.ref = w, n.createElement(E, N);
        }(N, e, t, A);
    };
    return I.displayName = w, (N = r.forwardRef(I)).attrs = b, N.componentStyle = C, N.displayName = w, N.shouldForwardProp = _, N.foldedComponentIds = s ? Array.prototype.concat(e.foldedComponentIds, e.styledComponentId) : h, N.styledComponentId = E, N.target = s ? e.target : e, N.withComponent = function(e) {
        var n = t.componentId, r = function(e, t) {
            if (null == e) return {};
            var n, r, o = {}, s = Object.keys(e);
            for(r = 0; r < s.length; r++)n = s[r], t.indexOf(n) >= 0 || (o[n] = e[n]);
            return o;
        }(t, [
            "componentId"
        ]), s = n && n + "-" + (Ae(e) ? e : Ne(m(e)));
        return je(e, u({}, r, {
            attrs: b,
            componentId: s
        }), o);
    }, Object.defineProperty(N, "defaultProps", {
        get: function() {
            return this._foldedDefaultProps;
        },
        set: function(t) {
            this._foldedDefaultProps = s ? Oe({}, e.defaultProps, t) : t;
        }
    }), "production" !== process.env.NODE_ENV && (we(w, E), N.warnTooManyClasses = function(e, t) {
        var n = {}, r = !1;
        return function(o) {
            if (!r && (n[o] = !0, Object.keys(n).length >= 200)) {
                var s = t ? ' with the id of "' + t + '"' : "";
                console.warn("Over 200 classes were generated for component " + e + s + ".\nConsider using the attrs method, together with a style object for frequently changed styles.\nExample:\n  const Component = styled.div.attrs(props => ({\n    style: {\n      background: props.background,\n    },\n  }))`width: 100%;`\n\n  <Component />"), r = !0, n = {};
            }
        };
    }(w, E)), N.toString = function() {
        return "." + N.styledComponentId;
    }, i && c(N, e, {
        attrs: !0,
        componentStyle: !0,
        displayName: !0,
        foldedComponentIds: !0,
        shouldForwardProp: !0,
        styledComponentId: !0,
        target: !0,
        withComponent: !0
    }), N;
}
var ke = function(e) {
    return function e(n, r, o) {
        if (void 0 === o && (o = p), !t.isValidElementType(r)) return _(1, String(r));
        var s = function() {
            return n(r, o, ve.apply(void 0, arguments));
        };
        return s.withConfig = function(t) {
            return e(n, r, u({}, o, {}, t));
        }, s.attrs = function(t) {
            return e(n, r, u({}, o, {
                attrs: Array.prototype.concat(o.attrs, t).filter(Boolean)
            }));
        }, s;
    }(je, e);
};
[
    "a",
    "abbr",
    "address",
    "area",
    "article",
    "aside",
    "audio",
    "b",
    "base",
    "bdi",
    "bdo",
    "big",
    "blockquote",
    "body",
    "br",
    "button",
    "canvas",
    "caption",
    "cite",
    "code",
    "col",
    "colgroup",
    "data",
    "datalist",
    "dd",
    "del",
    "details",
    "dfn",
    "dialog",
    "div",
    "dl",
    "dt",
    "em",
    "embed",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "head",
    "header",
    "hgroup",
    "hr",
    "html",
    "i",
    "iframe",
    "img",
    "input",
    "ins",
    "kbd",
    "keygen",
    "label",
    "legend",
    "li",
    "link",
    "main",
    "map",
    "mark",
    "marquee",
    "menu",
    "menuitem",
    "meta",
    "meter",
    "nav",
    "noscript",
    "object",
    "ol",
    "optgroup",
    "option",
    "output",
    "p",
    "param",
    "picture",
    "pre",
    "progress",
    "q",
    "rp",
    "rt",
    "ruby",
    "s",
    "samp",
    "script",
    "section",
    "select",
    "small",
    "source",
    "span",
    "strong",
    "style",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "textarea",
    "tfoot",
    "th",
    "thead",
    "time",
    "title",
    "tr",
    "track",
    "u",
    "ul",
    "var",
    "video",
    "wbr",
    "circle",
    "clipPath",
    "defs",
    "ellipse",
    "foreignObject",
    "g",
    "image",
    "line",
    "linearGradient",
    "marker",
    "mask",
    "path",
    "pattern",
    "polygon",
    "polyline",
    "radialGradient",
    "rect",
    "stop",
    "svg",
    "text",
    "textPath",
    "tspan"
].forEach(function(e) {
    ke[e] = ke(e);
});
var Ve = function() {
    function e(e, t) {
        this.rules = e, this.componentId = t, this.isStatic = U(e), L.registerId(this.componentId + 1);
    }
    var t = e.prototype;
    return t.createStyles = function(e, t, n, r) {
        var o = r(me(this.rules, t, n, r).join(""), ""), s = this.componentId + e;
        n.insertRules(s, s, o);
    }, t.removeStyles = function(e, t) {
        t.clearRules(this.componentId + e);
    }, t.renderStyles = function(e, t, n, r) {
        e > 2 && L.registerId(this.componentId + e), this.removeStyles(e, n), this.createStyles(e, t, n, r);
    }, e;
}(), Me = /^\s*<\/[a-z]/i, ze = function() {
    function e() {
        var e = this;
        this._emitSheetCSS = function() {
            var t = e.instance.toString();
            if (!t) return "";
            var n = k();
            return "<style " + [
                n && 'nonce="' + n + '"',
                v + '="true"',
                'data-styled-version="5.3.6"'
            ].filter(Boolean).join(" ") + ">" + t + "</style>";
        }, this.getStyleTags = function() {
            return e.sealed ? _(2) : e._emitSheetCSS();
        }, this.getStyleElement = function() {
            var t;
            if (e.sealed) return _(2);
            var n = ((t = {})[v] = "", t["data-styled-version"] = "5.3.6", t.dangerouslySetInnerHTML = {
                __html: e.instance.toString()
            }, t), o = k();
            return o && (n.nonce = o), [
                r.createElement("style", u({}, n, {
                    key: "sc-0-0"
                }))
            ];
        }, this.seal = function() {
            e.sealed = !0;
        }, this.instance = new L({
            isServer: !0
        }), this.sealed = !1;
    }
    var t = e.prototype;
    return t.collectStyles = function(e) {
        return this.sealed ? _(2) : r.createElement(ae, {
            sheet: this.instance
        }, e);
    }, t.interleaveWithNodeStream = function(e) {
        if (g) return _(3);
        if (this.sealed) return _(2);
        this.seal();
        var t = __turbopack_require__((()=>{
            const e = new Error("Cannot find module 'stream'");
            e.code = 'MODULE_NOT_FOUND';
            throw e;
        })()), n = (t.Readable, t.Transform), r = e, o = this.instance, s = this._emitSheetCSS, i = new n({
            transform: function(e, t, n) {
                var r = e.toString(), i = s();
                if (o.clearTag(), Me.test(r)) {
                    var a = r.indexOf(">") + 1, c = r.slice(0, a), u = r.slice(a);
                    this.push(c + i + u);
                } else this.push(i + r);
                n();
            }
        });
        return r.on("error", function(e) {
            i.emit("error", e);
        }), r.pipe(i);
    }, e;
}(), Be = {
    StyleSheet: L,
    masterSheet: re
};
"production" !== process.env.NODE_ENV && "undefined" != typeof navigator && "ReactNative" === navigator.product && console.warn("It looks like you've imported 'styled-components' on React Native.\nPerhaps you're looking to import 'styled-components/native'?\nRead more about this at https://www.styled-components.com/docs/basics#react-native"), "production" !== process.env.NODE_ENV && "test" !== process.env.NODE_ENV && "undefined" != typeof window && (window["__styled-components-init__"] = window["__styled-components-init__"] || 0, 1 === window["__styled-components-init__"] && console.warn("It looks like there are several instances of 'styled-components' initialized in this application. This may cause dynamic styles to not render properly, errors during the rehydration process, a missing theme prop, and makes your application bigger without good reason.\n\nSee https://s-c.sh/2BAXzed for more info."), window["__styled-components-init__"] += 1), exports.ServerStyleSheet = ze, exports.StyleSheetConsumer = te, exports.StyleSheetContext = ee, exports.StyleSheetManager = ae, exports.ThemeConsumer = De, exports.ThemeContext = Re, exports.ThemeProvider = function(e) {
    var t = n.useContext(Re), o = n.useMemo(function() {
        return function(e, t) {
            if (!e) return _(14);
            if (f(e)) {
                var n = e(t);
                return "production" === process.env.NODE_ENV || null !== n && !Array.isArray(n) && "object" == typeof n ? n : _(7);
            }
            return Array.isArray(e) || "object" != typeof e ? _(8) : t ? u({}, t, {}, e) : e;
        }(e.theme, t);
    }, [
        e.theme,
        t
    ]);
    return e.children ? r.createElement(Re.Provider, {
        value: o
    }, e.children) : null;
}, exports.__PRIVATE__ = Be, exports.createGlobalStyle = function(e) {
    for(var t = arguments.length, o = new Array(t > 1 ? t - 1 : 0), s = 1; s < t; s++)o[s - 1] = arguments[s];
    var i = ve.apply(void 0, [
        e
    ].concat(o)), a = "sc-global-" + Ce(JSON.stringify(i)), c = new Ve(i, a);
    function l(e) {
        var t = se(), o = ie(), s = n.useContext(Re), c = n.useRef(t.allocateGSInstance(a)).current;
        return "production" !== process.env.NODE_ENV && r.Children.count(e.children) && console.warn("The global style component " + a + " was given child JSX. createGlobalStyle does not render children."), "production" !== process.env.NODE_ENV && i.some(function(e) {
            return "string" == typeof e && -1 !== e.indexOf("@import");
        }) && console.warn("Please do not use @import CSS syntax in createGlobalStyle at this time, as the CSSOM APIs we use in production do not handle it well. Instead, we recommend using a library such as react-helmet to inject a typical <link> meta tag to the stylesheet, or simply embedding it manually in your index.html <head> section for a simpler app."), t.server && d(c, e, t, s, o), null;
    }
    function d(e, t, n, r, o) {
        if (c.isStatic) c.renderStyles(e, w, n, o);
        else {
            var s = u({}, t, {
                theme: Ee(t, r, l.defaultProps)
            });
            c.renderStyles(e, s, n, o);
        }
    }
    return "production" !== process.env.NODE_ENV && we(a), r.memo(l);
}, exports.css = ve, exports.default = ke, exports.isStyledComponent = y, exports.keyframes = function(e) {
    "production" !== process.env.NODE_ENV && "undefined" != typeof navigator && "ReactNative" === navigator.product && console.warn("`keyframes` cannot be used on ReactNative, only on the web. To do animation in ReactNative please use Animated.");
    for(var t = arguments.length, n = new Array(t > 1 ? t - 1 : 0), r = 1; r < t; r++)n[r - 1] = arguments[r];
    var o = ve.apply(void 0, [
        e
    ].concat(n)).join(""), s = Ce(o);
    return new ce(s, o);
}, exports.useTheme = function() {
    return n.useContext(Re);
}, exports.version = "5.3.6", exports.withTheme = function(e) {
    var t = r.forwardRef(function(t, o) {
        var s = n.useContext(Re), i = e.defaultProps, a = Ee(t, s, i);
        return "production" !== process.env.NODE_ENV && void 0 === a && console.warn('[withTheme] You are not using a ThemeProvider nor passing a theme prop or a theme in defaultProps in component class "' + m(e) + '"'), r.createElement(e, u({}, t, {
            theme: a,
            ref: o
        }));
    });
    return c(t, e), t.displayName = "WithTheme(" + m(e) + ")", t;
};

}.call(this) }),
}]);


//# sourceMappingURL=c4083_styled-components_dist_styled-components.cjs.js.3a53a101534e3e08.map