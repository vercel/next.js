(self.TURBOPACK = self.TURBOPACK || []).push(["output/083ed_@emotion_serialize_dist_emotion-serialize.cjs.js", {

"[project]/node_modules/.pnpm/@emotion+serialize@1.1.0/node_modules/@emotion/serialize/dist/emotion-serialize.cjs.js (ecmascript)": (function({ r: __turbopack_require__, x: __turbopack_external_require__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, c: __turbopack_cache__, l: __turbopack_load__, p: process, __dirname, m: module, e: exports }) { !function() {

'use strict';
if (process.env.NODE_ENV === "production") {
    module.exports = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+serialize@1.1.0/node_modules/@emotion/serialize/dist/emotion-serialize.cjs.prod.js (ecmascript)");
} else {
    module.exports = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+serialize@1.1.0/node_modules/@emotion/serialize/dist/emotion-serialize.cjs.dev.js (ecmascript)");
}

}.call(this) }),
"[project]/node_modules/.pnpm/@emotion+serialize@1.1.0/node_modules/@emotion/serialize/dist/emotion-serialize.cjs.prod.js (ecmascript)": (function({ r: __turbopack_require__, x: __turbopack_external_require__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, c: __turbopack_cache__, l: __turbopack_load__, p: process, __dirname, m: module, e: exports }) { !function() {

'use strict';
Object.defineProperty(exports, '__esModule', {
    value: true
});
var hashString = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+hash@0.9.0/node_modules/@emotion/hash/dist/emotion-hash.cjs.js (ecmascript)");
var unitless = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+unitless@0.8.0/node_modules/@emotion/unitless/dist/emotion-unitless.cjs.js (ecmascript)");
var memoize = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+memoize@0.8.0/node_modules/@emotion/memoize/dist/emotion-memoize.cjs.js (ecmascript)");
function _interopDefault(e) {
    return e && e.__esModule ? e : {
        'default': e
    };
}
var hashString__default = _interopDefault(hashString);
var unitless__default = _interopDefault(unitless);
var memoize__default = _interopDefault(memoize);
var hyphenateRegex = /[A-Z]|^ms/g;
var animationRegex = /_EMO_([^_]+?)_([^]*?)_EMO_/g;
var isCustomProperty = function isCustomProperty(property) {
    return property.charCodeAt(1) === 45;
};
var isProcessableValue = function isProcessableValue(value) {
    return value != null && typeof value !== 'boolean';
};
var processStyleName = memoize__default['default'](function(styleName) {
    return isCustomProperty(styleName) ? styleName : styleName.replace(hyphenateRegex, '-$&').toLowerCase();
});
var processStyleValue = function processStyleValue(key, value) {
    switch(key){
        case 'animation':
        case 'animationName':
            {
                if (typeof value === 'string') {
                    return value.replace(animationRegex, function(match, p1, p2) {
                        cursor = {
                            name: p1,
                            styles: p2,
                            next: cursor
                        };
                        return p1;
                    });
                }
            }
    }
    if (unitless__default['default'][key] !== 1 && !isCustomProperty(key) && typeof value === 'number' && value !== 0) {
        return value + 'px';
    }
    return value;
};
var noComponentSelectorMessage = 'Component selectors can only be used in conjunction with ' + '@emotion/babel-plugin, the swc Emotion plugin, or another Emotion-aware ' + 'compiler transform.';
function handleInterpolation(mergedProps, registered, interpolation) {
    if (interpolation == null) {
        return '';
    }
    if (interpolation.__emotion_styles !== undefined) {
        return interpolation;
    }
    switch(typeof interpolation){
        case 'boolean':
            {
                return '';
            }
        case 'object':
            {
                if (interpolation.anim === 1) {
                    cursor = {
                        name: interpolation.name,
                        styles: interpolation.styles,
                        next: cursor
                    };
                    return interpolation.name;
                }
                if (interpolation.styles !== undefined) {
                    var next = interpolation.next;
                    if (next !== undefined) {
                        while(next !== undefined){
                            cursor = {
                                name: next.name,
                                styles: next.styles,
                                next: cursor
                            };
                            next = next.next;
                        }
                    }
                    var styles = interpolation.styles + ";";
                    return styles;
                }
                return createStringFromObject(mergedProps, registered, interpolation);
            }
        case 'function':
            {
                if (mergedProps !== undefined) {
                    var previousCursor = cursor;
                    var result = interpolation(mergedProps);
                    cursor = previousCursor;
                    return handleInterpolation(mergedProps, registered, result);
                }
                break;
            }
    }
    if (registered == null) {
        return interpolation;
    }
    var cached = registered[interpolation];
    return cached !== undefined ? cached : interpolation;
}
function createStringFromObject(mergedProps, registered, obj) {
    var string = '';
    if (Array.isArray(obj)) {
        for(var i = 0; i < obj.length; i++){
            string += handleInterpolation(mergedProps, registered, obj[i]) + ";";
        }
    } else {
        for(var _key in obj){
            var value = obj[_key];
            if (typeof value !== 'object') {
                if (registered != null && registered[value] !== undefined) {
                    string += _key + "{" + registered[value] + "}";
                } else if (isProcessableValue(value)) {
                    string += processStyleName(_key) + ":" + processStyleValue(_key, value) + ";";
                }
            } else {
                if (_key === 'NO_COMPONENT_SELECTOR' && "production" !== 'production') {
                    throw new Error(noComponentSelectorMessage);
                }
                if (Array.isArray(value) && typeof value[0] === 'string' && (registered == null || registered[value[0]] === undefined)) {
                    for(var _i = 0; _i < value.length; _i++){
                        if (isProcessableValue(value[_i])) {
                            string += processStyleName(_key) + ":" + processStyleValue(_key, value[_i]) + ";";
                        }
                    }
                } else {
                    var interpolated = handleInterpolation(mergedProps, registered, value);
                    switch(_key){
                        case 'animation':
                        case 'animationName':
                            {
                                string += processStyleName(_key) + ":" + interpolated + ";";
                                break;
                            }
                        default:
                            {
                                string += _key + "{" + interpolated + "}";
                            }
                    }
                }
            }
        }
    }
    return string;
}
var labelPattern = /label:\s*([^\s;\n{]+)\s*(;|$)/g;
var cursor;
var serializeStyles = function serializeStyles(args, registered, mergedProps) {
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && args[0].styles !== undefined) {
        return args[0];
    }
    var stringMode = true;
    var styles = '';
    cursor = undefined;
    var strings = args[0];
    if (strings == null || strings.raw === undefined) {
        stringMode = false;
        styles += handleInterpolation(mergedProps, registered, strings);
    } else {
        styles += strings[0];
    }
    for(var i = 1; i < args.length; i++){
        styles += handleInterpolation(mergedProps, registered, args[i]);
        if (stringMode) {
            styles += strings[i];
        }
    }
    labelPattern.lastIndex = 0;
    var identifierName = '';
    var match;
    while((match = labelPattern.exec(styles)) !== null){
        identifierName += '-' + match[1];
    }
    var name = hashString__default['default'](styles) + identifierName;
    return {
        name: name,
        styles: styles,
        next: cursor
    };
};
exports.serializeStyles = serializeStyles;

}.call(this) }),
"[project]/node_modules/.pnpm/@emotion+serialize@1.1.0/node_modules/@emotion/serialize/dist/emotion-serialize.cjs.dev.js (ecmascript)": (function({ r: __turbopack_require__, x: __turbopack_external_require__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, c: __turbopack_cache__, l: __turbopack_load__, p: process, __dirname, m: module, e: exports }) { !function() {

'use strict';
Object.defineProperty(exports, '__esModule', {
    value: true
});
var hashString = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+hash@0.9.0/node_modules/@emotion/hash/dist/emotion-hash.cjs.js (ecmascript)");
var unitless = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+unitless@0.8.0/node_modules/@emotion/unitless/dist/emotion-unitless.cjs.js (ecmascript)");
var memoize = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+memoize@0.8.0/node_modules/@emotion/memoize/dist/emotion-memoize.cjs.js (ecmascript)");
function _interopDefault(e) {
    return e && e.__esModule ? e : {
        'default': e
    };
}
var hashString__default = _interopDefault(hashString);
var unitless__default = _interopDefault(unitless);
var memoize__default = _interopDefault(memoize);
var ILLEGAL_ESCAPE_SEQUENCE_ERROR = "You have illegal escape sequence in your template literal, most likely inside content's property value.\nBecause you write your CSS inside a JavaScript string you actually have to do double escaping, so for example \"content: '\\00d7';\" should become \"content: '\\\\00d7';\".\nYou can read more about this here:\nhttps://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#ES2018_revision_of_illegal_escape_sequences";
var UNDEFINED_AS_OBJECT_KEY_ERROR = "You have passed in falsy value as style object's key (can happen when in example you pass unexported component as computed key).";
var hyphenateRegex = /[A-Z]|^ms/g;
var animationRegex = /_EMO_([^_]+?)_([^]*?)_EMO_/g;
var isCustomProperty = function isCustomProperty(property) {
    return property.charCodeAt(1) === 45;
};
var isProcessableValue = function isProcessableValue(value) {
    return value != null && typeof value !== 'boolean';
};
var processStyleName = memoize__default['default'](function(styleName) {
    return isCustomProperty(styleName) ? styleName : styleName.replace(hyphenateRegex, '-$&').toLowerCase();
});
var processStyleValue = function processStyleValue(key, value) {
    switch(key){
        case 'animation':
        case 'animationName':
            {
                if (typeof value === 'string') {
                    return value.replace(animationRegex, function(match, p1, p2) {
                        cursor = {
                            name: p1,
                            styles: p2,
                            next: cursor
                        };
                        return p1;
                    });
                }
            }
    }
    if (unitless__default['default'][key] !== 1 && !isCustomProperty(key) && typeof value === 'number' && value !== 0) {
        return value + 'px';
    }
    return value;
};
if (process.env.NODE_ENV !== 'production') {
    var contentValuePattern = /(var|attr|counters?|url|(((repeating-)?(linear|radial))|conic)-gradient)\(|(no-)?(open|close)-quote/;
    var contentValues = [
        'normal',
        'none',
        'initial',
        'inherit',
        'unset'
    ];
    var oldProcessStyleValue = processStyleValue;
    var msPattern = /^-ms-/;
    var hyphenPattern = /-(.)/g;
    var hyphenatedCache = {};
    processStyleValue = function processStyleValue(key, value) {
        if (key === 'content') {
            if (typeof value !== 'string' || contentValues.indexOf(value) === -1 && !contentValuePattern.test(value) && (value.charAt(0) !== value.charAt(value.length - 1) || value.charAt(0) !== '"' && value.charAt(0) !== "'")) {
                throw new Error("You seem to be using a value for 'content' without quotes, try replacing it with `content: '\"" + value + "\"'`");
            }
        }
        var processed = oldProcessStyleValue(key, value);
        if (processed !== '' && !isCustomProperty(key) && key.indexOf('-') !== -1 && hyphenatedCache[key] === undefined) {
            hyphenatedCache[key] = true;
            console.error("Using kebab-case for css properties in objects is not supported. Did you mean " + key.replace(msPattern, 'ms-').replace(hyphenPattern, function(str, _char) {
                return _char.toUpperCase();
            }) + "?");
        }
        return processed;
    };
}
var noComponentSelectorMessage = 'Component selectors can only be used in conjunction with ' + '@emotion/babel-plugin, the swc Emotion plugin, or another Emotion-aware ' + 'compiler transform.';
function handleInterpolation(mergedProps, registered, interpolation) {
    if (interpolation == null) {
        return '';
    }
    if (interpolation.__emotion_styles !== undefined) {
        if (process.env.NODE_ENV !== 'production' && interpolation.toString() === 'NO_COMPONENT_SELECTOR') {
            throw new Error(noComponentSelectorMessage);
        }
        return interpolation;
    }
    switch(typeof interpolation){
        case 'boolean':
            {
                return '';
            }
        case 'object':
            {
                if (interpolation.anim === 1) {
                    cursor = {
                        name: interpolation.name,
                        styles: interpolation.styles,
                        next: cursor
                    };
                    return interpolation.name;
                }
                if (interpolation.styles !== undefined) {
                    var next = interpolation.next;
                    if (next !== undefined) {
                        while(next !== undefined){
                            cursor = {
                                name: next.name,
                                styles: next.styles,
                                next: cursor
                            };
                            next = next.next;
                        }
                    }
                    var styles = interpolation.styles + ";";
                    if (process.env.NODE_ENV !== 'production' && interpolation.map !== undefined) {
                        styles += interpolation.map;
                    }
                    return styles;
                }
                return createStringFromObject(mergedProps, registered, interpolation);
            }
        case 'function':
            {
                if (mergedProps !== undefined) {
                    var previousCursor = cursor;
                    var result = interpolation(mergedProps);
                    cursor = previousCursor;
                    return handleInterpolation(mergedProps, registered, result);
                } else if (process.env.NODE_ENV !== 'production') {
                    console.error('Functions that are interpolated in css calls will be stringified.\n' + 'If you want to have a css call based on props, create a function that returns a css call like this\n' + 'let dynamicStyle = (props) => css`color: ${props.color}`\n' + 'It can be called directly with props or interpolated in a styled call like this\n' + "let SomeComponent = styled('div')`${dynamicStyle}`");
                }
                break;
            }
        case 'string':
            if (process.env.NODE_ENV !== 'production') {
                var matched = [];
                var replaced = interpolation.replace(animationRegex, function(match, p1, p2) {
                    var fakeVarName = "animation" + matched.length;
                    matched.push("const " + fakeVarName + " = keyframes`" + p2.replace(/^@keyframes animation-\w+/, '') + "`");
                    return "${" + fakeVarName + "}";
                });
                if (matched.length) {
                    console.error('`keyframes` output got interpolated into plain string, please wrap it with `css`.\n\n' + 'Instead of doing this:\n\n' + [].concat(matched, [
                        "`" + replaced + "`"
                    ]).join('\n') + '\n\nYou should wrap it with `css` like this:\n\n' + ("css`" + replaced + "`"));
                }
            }
            break;
    }
    if (registered == null) {
        return interpolation;
    }
    var cached = registered[interpolation];
    return cached !== undefined ? cached : interpolation;
}
function createStringFromObject(mergedProps, registered, obj) {
    var string = '';
    if (Array.isArray(obj)) {
        for(var i = 0; i < obj.length; i++){
            string += handleInterpolation(mergedProps, registered, obj[i]) + ";";
        }
    } else {
        for(var _key in obj){
            var value = obj[_key];
            if (typeof value !== 'object') {
                if (registered != null && registered[value] !== undefined) {
                    string += _key + "{" + registered[value] + "}";
                } else if (isProcessableValue(value)) {
                    string += processStyleName(_key) + ":" + processStyleValue(_key, value) + ";";
                }
            } else {
                if (_key === 'NO_COMPONENT_SELECTOR' && process.env.NODE_ENV !== 'production') {
                    throw new Error(noComponentSelectorMessage);
                }
                if (Array.isArray(value) && typeof value[0] === 'string' && (registered == null || registered[value[0]] === undefined)) {
                    for(var _i = 0; _i < value.length; _i++){
                        if (isProcessableValue(value[_i])) {
                            string += processStyleName(_key) + ":" + processStyleValue(_key, value[_i]) + ";";
                        }
                    }
                } else {
                    var interpolated = handleInterpolation(mergedProps, registered, value);
                    switch(_key){
                        case 'animation':
                        case 'animationName':
                            {
                                string += processStyleName(_key) + ":" + interpolated + ";";
                                break;
                            }
                        default:
                            {
                                if (process.env.NODE_ENV !== 'production' && _key === 'undefined') {
                                    console.error(UNDEFINED_AS_OBJECT_KEY_ERROR);
                                }
                                string += _key + "{" + interpolated + "}";
                            }
                    }
                }
            }
        }
    }
    return string;
}
var labelPattern = /label:\s*([^\s;\n{]+)\s*(;|$)/g;
var sourceMapPattern;
if (process.env.NODE_ENV !== 'production') {
    sourceMapPattern = /\/\*#\ssourceMappingURL=data:application\/json;\S+\s+\*\//g;
}
var cursor;
var serializeStyles = function serializeStyles(args, registered, mergedProps) {
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && args[0].styles !== undefined) {
        return args[0];
    }
    var stringMode = true;
    var styles = '';
    cursor = undefined;
    var strings = args[0];
    if (strings == null || strings.raw === undefined) {
        stringMode = false;
        styles += handleInterpolation(mergedProps, registered, strings);
    } else {
        if (process.env.NODE_ENV !== 'production' && strings[0] === undefined) {
            console.error(ILLEGAL_ESCAPE_SEQUENCE_ERROR);
        }
        styles += strings[0];
    }
    for(var i = 1; i < args.length; i++){
        styles += handleInterpolation(mergedProps, registered, args[i]);
        if (stringMode) {
            if (process.env.NODE_ENV !== 'production' && strings[i] === undefined) {
                console.error(ILLEGAL_ESCAPE_SEQUENCE_ERROR);
            }
            styles += strings[i];
        }
    }
    var sourceMap;
    if (process.env.NODE_ENV !== 'production') {
        styles = styles.replace(sourceMapPattern, function(match) {
            sourceMap = match;
            return '';
        });
    }
    labelPattern.lastIndex = 0;
    var identifierName = '';
    var match;
    while((match = labelPattern.exec(styles)) !== null){
        identifierName += '-' + match[1];
    }
    var name = hashString__default['default'](styles) + identifierName;
    if (process.env.NODE_ENV !== 'production') {
        return {
            name: name,
            styles: styles,
            map: sourceMap,
            next: cursor,
            toString: function toString() {
                return "You have tried to stringify object returned from `css` function. It isn't supposed to be used directly (e.g. as value of the `className` prop), but rather handed to emotion so it can handle it (e.g. as value of `css` prop).";
            }
        };
    }
    return {
        name: name,
        styles: styles,
        next: cursor
    };
};
exports.serializeStyles = serializeStyles;

}.call(this) }),
}]);


//# sourceMappingURL=083ed_@emotion_serialize_dist_emotion-serialize.cjs.js.0db53c7bdcba826d.map