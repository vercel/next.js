(self.TURBOPACK = self.TURBOPACK || []).push(["output/6395b_@emotion_cache_dist_emotion-cache.cjs.js", {

"[project]/node_modules/.pnpm/@emotion+cache@11.10.3/node_modules/@emotion/cache/dist/emotion-cache.cjs.js (ecmascript)": (function({ r: __turbopack_require__, x: __turbopack_external_require__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, c: __turbopack_cache__, l: __turbopack_load__, p: process, __dirname, m: module, e: exports }) { !function() {

'use strict';
if (process.env.NODE_ENV === "production") {
    module.exports = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+cache@11.10.3/node_modules/@emotion/cache/dist/emotion-cache.cjs.prod.js (ecmascript)");
} else {
    module.exports = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+cache@11.10.3/node_modules/@emotion/cache/dist/emotion-cache.cjs.dev.js (ecmascript)");
}

}.call(this) }),
"[project]/node_modules/.pnpm/@emotion+cache@11.10.3/node_modules/@emotion/cache/dist/emotion-cache.cjs.prod.js (ecmascript)": (function({ r: __turbopack_require__, x: __turbopack_external_require__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, c: __turbopack_cache__, l: __turbopack_load__, p: process, __dirname, m: module, e: exports }) { !function() {

'use strict';
Object.defineProperty(exports, '__esModule', {
    value: true
});
var sheet = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+sheet@1.2.0/node_modules/@emotion/sheet/dist/emotion-sheet.cjs.js (ecmascript)");
var stylis = __turbopack_require__("[project]/node_modules/.pnpm/stylis@4.0.13/node_modules/stylis/dist/umd/stylis.js (ecmascript)");
var weakMemoize = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+weak-memoize@0.3.0/node_modules/@emotion/weak-memoize/dist/emotion-weak-memoize.cjs.js (ecmascript)");
var memoize = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+memoize@0.8.0/node_modules/@emotion/memoize/dist/emotion-memoize.cjs.js (ecmascript)");
function _interopDefault(e) {
    return e && e.__esModule ? e : {
        'default': e
    };
}
var weakMemoize__default = _interopDefault(weakMemoize);
var memoize__default = _interopDefault(memoize);
var identifierWithPointTracking = function identifierWithPointTracking(begin, points, index) {
    var previous = 0;
    var character = 0;
    while(true){
        previous = character;
        character = stylis.peek();
        if (previous === 38 && character === 12) {
            points[index] = 1;
        }
        if (stylis.token(character)) {
            break;
        }
        stylis.next();
    }
    return stylis.slice(begin, stylis.position);
};
var toRules = function toRules(parsed, points) {
    var index = -1;
    var character = 44;
    do {
        switch(stylis.token(character)){
            case 0:
                if (character === 38 && stylis.peek() === 12) {
                    points[index] = 1;
                }
                parsed[index] += identifierWithPointTracking(stylis.position - 1, points, index);
                break;
            case 2:
                parsed[index] += stylis.delimit(character);
                break;
            case 4:
                if (character === 44) {
                    parsed[++index] = stylis.peek() === 58 ? '&\f' : '';
                    points[index] = parsed[index].length;
                    break;
                }
            default:
                parsed[index] += stylis.from(character);
        }
    }while (character = stylis.next())
    return parsed;
};
var getRules = function getRules(value, points) {
    return stylis.dealloc(toRules(stylis.alloc(value), points));
};
var fixedElements = new WeakMap();
var compat = function compat(element) {
    if (element.type !== 'rule' || !element.parent || element.length < 1) {
        return;
    }
    var value = element.value, parent = element.parent;
    var isImplicitRule = element.column === parent.column && element.line === parent.line;
    while(parent.type !== 'rule'){
        parent = parent.parent;
        if (!parent) return;
    }
    if (element.props.length === 1 && value.charCodeAt(0) !== 58 && !fixedElements.get(parent)) {
        return;
    }
    if (isImplicitRule) {
        return;
    }
    fixedElements.set(element, true);
    var points = [];
    var rules = getRules(value, points);
    var parentRules = parent.props;
    for(var i = 0, k = 0; i < rules.length; i++){
        for(var j = 0; j < parentRules.length; j++, k++){
            element.props[k] = points[i] ? rules[i].replace(/&\f/g, parentRules[j]) : parentRules[j] + " " + rules[i];
        }
    }
};
var removeLabel = function removeLabel(element) {
    if (element.type === 'decl') {
        var value = element.value;
        if (value.charCodeAt(0) === 108 && value.charCodeAt(2) === 98) {
            element["return"] = '';
            element.value = '';
        }
    }
};
var isBrowser = typeof document !== 'undefined';
var getServerStylisCache = isBrowser ? undefined : weakMemoize__default['default'](function() {
    return memoize__default['default'](function() {
        var cache = {};
        return function(name) {
            return cache[name];
        };
    });
});
var defaultStylisPlugins = [
    stylis.prefixer
];
var createCache = function createCache(options) {
    var key = options.key;
    if (isBrowser && key === 'css') {
        var ssrStyles = document.querySelectorAll("style[data-emotion]:not([data-s])");
        Array.prototype.forEach.call(ssrStyles, function(node) {
            var dataEmotionAttribute = node.getAttribute('data-emotion');
            if (dataEmotionAttribute.indexOf(' ') === -1) {
                return;
            }
            document.head.appendChild(node);
            node.setAttribute('data-s', '');
        });
    }
    var stylisPlugins = options.stylisPlugins || defaultStylisPlugins;
    var inserted = {};
    var container;
    var nodesToHydrate = [];
    if (isBrowser) {
        container = options.container || document.head;
        Array.prototype.forEach.call(document.querySelectorAll("style[data-emotion^=\"" + key + " \"]"), function(node) {
            var attrib = node.getAttribute("data-emotion").split(' ');
            for(var i = 1; i < attrib.length; i++){
                inserted[attrib[i]] = true;
            }
            nodesToHydrate.push(node);
        });
    }
    var _insert;
    var omnipresentPlugins = [
        compat,
        removeLabel
    ];
    if (isBrowser) {
        var currentSheet;
        var finalizingPlugins = [
            stylis.stringify,
            stylis.rulesheet(function(rule) {
                currentSheet.insert(rule);
            })
        ];
        var serializer = stylis.middleware(omnipresentPlugins.concat(stylisPlugins, finalizingPlugins));
        var stylis$1 = function stylis$1(styles) {
            return stylis.serialize(stylis.compile(styles), serializer);
        };
        _insert = function insert(selector, serialized, sheet, shouldCache) {
            currentSheet = sheet;
            stylis$1(selector ? selector + "{" + serialized.styles + "}" : serialized.styles);
            if (shouldCache) {
                cache.inserted[serialized.name] = true;
            }
        };
    } else {
        var _finalizingPlugins = [
            stylis.stringify
        ];
        var _serializer = stylis.middleware(omnipresentPlugins.concat(stylisPlugins, _finalizingPlugins));
        var _stylis = function _stylis(styles) {
            return stylis.serialize(stylis.compile(styles), _serializer);
        };
        var serverStylisCache = getServerStylisCache(stylisPlugins)(key);
        var getRules = function getRules(selector, serialized) {
            var name = serialized.name;
            if (serverStylisCache[name] === undefined) {
                serverStylisCache[name] = _stylis(selector ? selector + "{" + serialized.styles + "}" : serialized.styles);
            }
            return serverStylisCache[name];
        };
        _insert = function _insert(selector, serialized, sheet, shouldCache) {
            var name = serialized.name;
            var rules = getRules(selector, serialized);
            if (cache.compat === undefined) {
                if (shouldCache) {
                    cache.inserted[name] = true;
                }
                return rules;
            } else {
                if (shouldCache) {
                    cache.inserted[name] = rules;
                } else {
                    return rules;
                }
            }
        };
    }
    var cache = {
        key: key,
        sheet: new sheet.StyleSheet({
            key: key,
            container: container,
            nonce: options.nonce,
            speedy: options.speedy,
            prepend: options.prepend,
            insertionPoint: options.insertionPoint
        }),
        nonce: options.nonce,
        inserted: inserted,
        registered: {},
        insert: _insert
    };
    cache.sheet.hydrate(nodesToHydrate);
    return cache;
};
exports.default = createCache;

}.call(this) }),
"[project]/node_modules/.pnpm/@emotion+cache@11.10.3/node_modules/@emotion/cache/dist/emotion-cache.cjs.dev.js (ecmascript)": (function({ r: __turbopack_require__, x: __turbopack_external_require__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, c: __turbopack_cache__, l: __turbopack_load__, p: process, __dirname, m: module, e: exports }) { !function() {

'use strict';
Object.defineProperty(exports, '__esModule', {
    value: true
});
var sheet = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+sheet@1.2.0/node_modules/@emotion/sheet/dist/emotion-sheet.cjs.js (ecmascript)");
var stylis = __turbopack_require__("[project]/node_modules/.pnpm/stylis@4.0.13/node_modules/stylis/dist/umd/stylis.js (ecmascript)");
var weakMemoize = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+weak-memoize@0.3.0/node_modules/@emotion/weak-memoize/dist/emotion-weak-memoize.cjs.js (ecmascript)");
var memoize = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+memoize@0.8.0/node_modules/@emotion/memoize/dist/emotion-memoize.cjs.js (ecmascript)");
function _interopDefault(e) {
    return e && e.__esModule ? e : {
        'default': e
    };
}
var weakMemoize__default = _interopDefault(weakMemoize);
var memoize__default = _interopDefault(memoize);
var identifierWithPointTracking = function identifierWithPointTracking(begin, points, index) {
    var previous = 0;
    var character = 0;
    while(true){
        previous = character;
        character = stylis.peek();
        if (previous === 38 && character === 12) {
            points[index] = 1;
        }
        if (stylis.token(character)) {
            break;
        }
        stylis.next();
    }
    return stylis.slice(begin, stylis.position);
};
var toRules = function toRules(parsed, points) {
    var index = -1;
    var character = 44;
    do {
        switch(stylis.token(character)){
            case 0:
                if (character === 38 && stylis.peek() === 12) {
                    points[index] = 1;
                }
                parsed[index] += identifierWithPointTracking(stylis.position - 1, points, index);
                break;
            case 2:
                parsed[index] += stylis.delimit(character);
                break;
            case 4:
                if (character === 44) {
                    parsed[++index] = stylis.peek() === 58 ? '&\f' : '';
                    points[index] = parsed[index].length;
                    break;
                }
            default:
                parsed[index] += stylis.from(character);
        }
    }while (character = stylis.next())
    return parsed;
};
var getRules = function getRules(value, points) {
    return stylis.dealloc(toRules(stylis.alloc(value), points));
};
var fixedElements = new WeakMap();
var compat = function compat(element) {
    if (element.type !== 'rule' || !element.parent || element.length < 1) {
        return;
    }
    var value = element.value, parent = element.parent;
    var isImplicitRule = element.column === parent.column && element.line === parent.line;
    while(parent.type !== 'rule'){
        parent = parent.parent;
        if (!parent) return;
    }
    if (element.props.length === 1 && value.charCodeAt(0) !== 58 && !fixedElements.get(parent)) {
        return;
    }
    if (isImplicitRule) {
        return;
    }
    fixedElements.set(element, true);
    var points = [];
    var rules = getRules(value, points);
    var parentRules = parent.props;
    for(var i = 0, k = 0; i < rules.length; i++){
        for(var j = 0; j < parentRules.length; j++, k++){
            element.props[k] = points[i] ? rules[i].replace(/&\f/g, parentRules[j]) : parentRules[j] + " " + rules[i];
        }
    }
};
var removeLabel = function removeLabel(element) {
    if (element.type === 'decl') {
        var value = element.value;
        if (value.charCodeAt(0) === 108 && value.charCodeAt(2) === 98) {
            element["return"] = '';
            element.value = '';
        }
    }
};
var ignoreFlag = 'emotion-disable-server-rendering-unsafe-selector-warning-please-do-not-use-this-the-warning-exists-for-a-reason';
var isIgnoringComment = function isIgnoringComment(element) {
    return element.type === 'comm' && element.children.indexOf(ignoreFlag) > -1;
};
var createUnsafeSelectorsAlarm = function createUnsafeSelectorsAlarm(cache) {
    return function(element, index, children) {
        if (element.type !== 'rule' || cache.compat) return;
        var unsafePseudoClasses = element.value.match(/(:first|:nth|:nth-last)-child/g);
        if (unsafePseudoClasses) {
            var isNested = element.parent === children[0];
            var commentContainer = isNested ? children[0].children : children;
            for(var i = commentContainer.length - 1; i >= 0; i--){
                var node = commentContainer[i];
                if (node.line < element.line) {
                    break;
                }
                if (node.column < element.column) {
                    if (isIgnoringComment(node)) {
                        return;
                    }
                    break;
                }
            }
            unsafePseudoClasses.forEach(function(unsafePseudoClass) {
                console.error("The pseudo class \"" + unsafePseudoClass + "\" is potentially unsafe when doing server-side rendering. Try changing it to \"" + unsafePseudoClass.split('-child')[0] + "-of-type\".");
            });
        }
    };
};
var isImportRule = function isImportRule(element) {
    return element.type.charCodeAt(1) === 105 && element.type.charCodeAt(0) === 64;
};
var isPrependedWithRegularRules = function isPrependedWithRegularRules(index, children) {
    for(var i = index - 1; i >= 0; i--){
        if (!isImportRule(children[i])) {
            return true;
        }
    }
    return false;
};
var nullifyElement = function nullifyElement(element) {
    element.type = '';
    element.value = '';
    element["return"] = '';
    element.children = '';
    element.props = '';
};
var incorrectImportAlarm = function incorrectImportAlarm(element, index, children) {
    if (!isImportRule(element)) {
        return;
    }
    if (element.parent) {
        console.error("`@import` rules can't be nested inside other rules. Please move it to the top level and put it before regular rules. Keep in mind that they can only be used within global styles.");
        nullifyElement(element);
    } else if (isPrependedWithRegularRules(index, children)) {
        console.error("`@import` rules can't be after other rules. Please put your `@import` rules before your other rules.");
        nullifyElement(element);
    }
};
var isBrowser = typeof document !== 'undefined';
var getServerStylisCache = isBrowser ? undefined : weakMemoize__default['default'](function() {
    return memoize__default['default'](function() {
        var cache = {};
        return function(name) {
            return cache[name];
        };
    });
});
var defaultStylisPlugins = [
    stylis.prefixer
];
var createCache = function createCache(options) {
    var key = options.key;
    if (process.env.NODE_ENV !== 'production' && !key) {
        throw new Error("You have to configure `key` for your cache. Please make sure it's unique (and not equal to 'css') as it's used for linking styles to your cache.\n" + "If multiple caches share the same key they might \"fight\" for each other's style elements.");
    }
    if (isBrowser && key === 'css') {
        var ssrStyles = document.querySelectorAll("style[data-emotion]:not([data-s])");
        Array.prototype.forEach.call(ssrStyles, function(node) {
            var dataEmotionAttribute = node.getAttribute('data-emotion');
            if (dataEmotionAttribute.indexOf(' ') === -1) {
                return;
            }
            document.head.appendChild(node);
            node.setAttribute('data-s', '');
        });
    }
    var stylisPlugins = options.stylisPlugins || defaultStylisPlugins;
    if (process.env.NODE_ENV !== 'production') {
        if (/[^a-z-]/.test(key)) {
            throw new Error("Emotion key must only contain lower case alphabetical characters and - but \"" + key + "\" was passed");
        }
    }
    var inserted = {};
    var container;
    var nodesToHydrate = [];
    if (isBrowser) {
        container = options.container || document.head;
        Array.prototype.forEach.call(document.querySelectorAll("style[data-emotion^=\"" + key + " \"]"), function(node) {
            var attrib = node.getAttribute("data-emotion").split(' ');
            for(var i = 1; i < attrib.length; i++){
                inserted[attrib[i]] = true;
            }
            nodesToHydrate.push(node);
        });
    }
    var _insert;
    var omnipresentPlugins = [
        compat,
        removeLabel
    ];
    if (process.env.NODE_ENV !== 'production') {
        omnipresentPlugins.push(createUnsafeSelectorsAlarm({
            get compat () {
                return cache.compat;
            }
        }), incorrectImportAlarm);
    }
    if (isBrowser) {
        var currentSheet;
        var finalizingPlugins = [
            stylis.stringify,
            process.env.NODE_ENV !== 'production' ? function(element) {
                if (!element.root) {
                    if (element["return"]) {
                        currentSheet.insert(element["return"]);
                    } else if (element.value && element.type !== stylis.COMMENT) {
                        currentSheet.insert(element.value + "{}");
                    }
                }
            } : stylis.rulesheet(function(rule) {
                currentSheet.insert(rule);
            })
        ];
        var serializer = stylis.middleware(omnipresentPlugins.concat(stylisPlugins, finalizingPlugins));
        var stylis$1 = function stylis$1(styles) {
            return stylis.serialize(stylis.compile(styles), serializer);
        };
        _insert = function insert(selector, serialized, sheet, shouldCache) {
            currentSheet = sheet;
            if (process.env.NODE_ENV !== 'production' && serialized.map !== undefined) {
                currentSheet = {
                    insert: function insert(rule) {
                        sheet.insert(rule + serialized.map);
                    }
                };
            }
            stylis$1(selector ? selector + "{" + serialized.styles + "}" : serialized.styles);
            if (shouldCache) {
                cache.inserted[serialized.name] = true;
            }
        };
    } else {
        var _finalizingPlugins = [
            stylis.stringify
        ];
        var _serializer = stylis.middleware(omnipresentPlugins.concat(stylisPlugins, _finalizingPlugins));
        var _stylis = function _stylis(styles) {
            return stylis.serialize(stylis.compile(styles), _serializer);
        };
        var serverStylisCache = getServerStylisCache(stylisPlugins)(key);
        var getRules = function getRules(selector, serialized) {
            var name = serialized.name;
            if (serverStylisCache[name] === undefined) {
                serverStylisCache[name] = _stylis(selector ? selector + "{" + serialized.styles + "}" : serialized.styles);
            }
            return serverStylisCache[name];
        };
        _insert = function _insert(selector, serialized, sheet, shouldCache) {
            var name = serialized.name;
            var rules = getRules(selector, serialized);
            if (cache.compat === undefined) {
                if (shouldCache) {
                    cache.inserted[name] = true;
                }
                if (process.env.NODE_ENV === 'development' && serialized.map !== undefined) {
                    return rules + serialized.map;
                }
                return rules;
            } else {
                if (shouldCache) {
                    cache.inserted[name] = rules;
                } else {
                    return rules;
                }
            }
        };
    }
    var cache = {
        key: key,
        sheet: new sheet.StyleSheet({
            key: key,
            container: container,
            nonce: options.nonce,
            speedy: options.speedy,
            prepend: options.prepend,
            insertionPoint: options.insertionPoint
        }),
        nonce: options.nonce,
        inserted: inserted,
        registered: {},
        insert: _insert
    };
    cache.sheet.hydrate(nodesToHydrate);
    return cache;
};
exports.default = createCache;

}.call(this) }),
}]);


//# sourceMappingURL=6395b_@emotion_cache_dist_emotion-cache.cjs.js.9a126457a4ee1a1d.map