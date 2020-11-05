module.exports =
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 178:
/***/ (function(module) {

(function (global, factory) {
	 true ? module.exports = factory() :
	0;
}(this, (function () { 'use strict';

	var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$';
	var unsafeChars = /[<>\b\f\n\r\t\0\u2028\u2029]/g;
	var reserved = /^(?:do|if|in|for|int|let|new|try|var|byte|case|char|else|enum|goto|long|this|void|with|await|break|catch|class|const|final|float|short|super|throw|while|yield|delete|double|export|import|native|return|switch|throws|typeof|boolean|default|extends|finally|package|private|abstract|continue|debugger|function|volatile|interface|protected|transient|implements|instanceof|synchronized)$/;
	var escaped = {
	    '<': '\\u003C',
	    '>': '\\u003E',
	    '/': '\\u002F',
	    '\\': '\\\\',
	    '\b': '\\b',
	    '\f': '\\f',
	    '\n': '\\n',
	    '\r': '\\r',
	    '\t': '\\t',
	    '\0': '\\0',
	    '\u2028': '\\u2028',
	    '\u2029': '\\u2029'
	};
	var objectProtoOwnPropertyNames = Object.getOwnPropertyNames(Object.prototype).sort().join('\0');
	function devalue(value) {
	    var counts = new Map();
	    function walk(thing) {
	        if (typeof thing === 'function') {
	            throw new Error("Cannot stringify a function");
	        }
	        if (counts.has(thing)) {
	            counts.set(thing, counts.get(thing) + 1);
	            return;
	        }
	        counts.set(thing, 1);
	        if (!isPrimitive(thing)) {
	            var type = getType(thing);
	            switch (type) {
	                case 'Number':
	                case 'String':
	                case 'Boolean':
	                case 'Date':
	                case 'RegExp':
	                    return;
	                case 'Array':
	                    thing.forEach(walk);
	                    break;
	                case 'Set':
	                case 'Map':
	                    Array.from(thing).forEach(walk);
	                    break;
	                default:
	                    var proto = Object.getPrototypeOf(thing);
	                    if (proto !== Object.prototype &&
	                        proto !== null &&
	                        Object.getOwnPropertyNames(proto).sort().join('\0') !== objectProtoOwnPropertyNames) {
	                        throw new Error("Cannot stringify arbitrary non-POJOs");
	                    }
	                    if (Object.getOwnPropertySymbols(thing).length > 0) {
	                        throw new Error("Cannot stringify POJOs with symbolic keys");
	                    }
	                    Object.keys(thing).forEach(function (key) { return walk(thing[key]); });
	            }
	        }
	    }
	    walk(value);
	    var names = new Map();
	    Array.from(counts)
	        .filter(function (entry) { return entry[1] > 1; })
	        .sort(function (a, b) { return b[1] - a[1]; })
	        .forEach(function (entry, i) {
	        names.set(entry[0], getName(i));
	    });
	    function stringify(thing) {
	        if (names.has(thing)) {
	            return names.get(thing);
	        }
	        if (isPrimitive(thing)) {
	            return stringifyPrimitive(thing);
	        }
	        var type = getType(thing);
	        switch (type) {
	            case 'Number':
	            case 'String':
	            case 'Boolean':
	                return "Object(" + stringify(thing.valueOf()) + ")";
	            case 'RegExp':
	                return "new RegExp(" + stringifyString(thing.source) + ", \"" + thing.flags + "\")";
	            case 'Date':
	                return "new Date(" + thing.getTime() + ")";
	            case 'Array':
	                var members = thing.map(function (v, i) { return i in thing ? stringify(v) : ''; });
	                var tail = thing.length === 0 || (thing.length - 1 in thing) ? '' : ',';
	                return "[" + members.join(',') + tail + "]";
	            case 'Set':
	            case 'Map':
	                return "new " + type + "([" + Array.from(thing).map(stringify).join(',') + "])";
	            default:
	                var obj = "{" + Object.keys(thing).map(function (key) { return safeKey(key) + ":" + stringify(thing[key]); }).join(',') + "}";
	                var proto = Object.getPrototypeOf(thing);
	                if (proto === null) {
	                    return Object.keys(thing).length > 0
	                        ? "Object.assign(Object.create(null)," + obj + ")"
	                        : "Object.create(null)";
	                }
	                return obj;
	        }
	    }
	    var str = stringify(value);
	    if (names.size) {
	        var params_1 = [];
	        var statements_1 = [];
	        var values_1 = [];
	        names.forEach(function (name, thing) {
	            params_1.push(name);
	            if (isPrimitive(thing)) {
	                values_1.push(stringifyPrimitive(thing));
	                return;
	            }
	            var type = getType(thing);
	            switch (type) {
	                case 'Number':
	                case 'String':
	                case 'Boolean':
	                    values_1.push("Object(" + stringify(thing.valueOf()) + ")");
	                    break;
	                case 'RegExp':
	                    values_1.push(thing.toString());
	                    break;
	                case 'Date':
	                    values_1.push("new Date(" + thing.getTime() + ")");
	                    break;
	                case 'Array':
	                    values_1.push("Array(" + thing.length + ")");
	                    thing.forEach(function (v, i) {
	                        statements_1.push(name + "[" + i + "]=" + stringify(v));
	                    });
	                    break;
	                case 'Set':
	                    values_1.push("new Set");
	                    statements_1.push(name + "." + Array.from(thing).map(function (v) { return "add(" + stringify(v) + ")"; }).join('.'));
	                    break;
	                case 'Map':
	                    values_1.push("new Map");
	                    statements_1.push(name + "." + Array.from(thing).map(function (_a) {
	                        var k = _a[0], v = _a[1];
	                        return "set(" + stringify(k) + ", " + stringify(v) + ")";
	                    }).join('.'));
	                    break;
	                default:
	                    values_1.push(Object.getPrototypeOf(thing) === null ? 'Object.create(null)' : '{}');
	                    Object.keys(thing).forEach(function (key) {
	                        statements_1.push("" + name + safeProp(key) + "=" + stringify(thing[key]));
	                    });
	            }
	        });
	        statements_1.push("return " + str);
	        return "(function(" + params_1.join(',') + "){" + statements_1.join(';') + "}(" + values_1.join(',') + "))";
	    }
	    else {
	        return str;
	    }
	}
	function getName(num) {
	    var name = '';
	    do {
	        name = chars[num % chars.length] + name;
	        num = ~~(num / chars.length) - 1;
	    } while (num >= 0);
	    return reserved.test(name) ? name + "_" : name;
	}
	function isPrimitive(thing) {
	    return Object(thing) !== thing;
	}
	function stringifyPrimitive(thing) {
	    if (typeof thing === 'string')
	        return stringifyString(thing);
	    if (thing === void 0)
	        return 'void 0';
	    if (thing === 0 && 1 / thing < 0)
	        return '-0';
	    var str = String(thing);
	    if (typeof thing === 'number')
	        return str.replace(/^(-)?0\./, '$1.');
	    return str;
	}
	function getType(thing) {
	    return Object.prototype.toString.call(thing).slice(8, -1);
	}
	function escapeUnsafeChar(c) {
	    return escaped[c] || c;
	}
	function escapeUnsafeChars(str) {
	    return str.replace(unsafeChars, escapeUnsafeChar);
	}
	function safeKey(key) {
	    return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key) ? key : escapeUnsafeChars(JSON.stringify(key));
	}
	function safeProp(key) {
	    return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key) ? "." + key : "[" + escapeUnsafeChars(JSON.stringify(key)) + "]";
	}
	function stringifyString(str) {
	    var result = '"';
	    for (var i = 0; i < str.length; i += 1) {
	        var char = str.charAt(i);
	        var code = char.charCodeAt(0);
	        if (char === '"') {
	            result += '\\"';
	        }
	        else if (char in escaped) {
	            result += escaped[char];
	        }
	        else if (code >= 0xd800 && code <= 0xdfff) {
	            var next = str.charCodeAt(i + 1);
	            // If this is the beginning of a [high, low] surrogate pair,
	            // add the next two characters, otherwise escape
	            if (code <= 0xdbff && (next >= 0xdc00 && next <= 0xdfff)) {
	                result += char + str[++i];
	            }
	            else {
	                result += "\\u" + code.toString(16).toUpperCase();
	            }
	        }
	        else {
	            result += char;
	        }
	    }
	    result += '"';
	    return result;
	}

	return devalue;

})));


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		if(__webpack_module_cache__[moduleId]) {
/******/ 			return __webpack_module_cache__[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	__webpack_require__.ab = __dirname + "/";/************************************************************************/
/******/ 	// module exports must be returned from runtime so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(178);
/******/ })()
;