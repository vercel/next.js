module.exports =
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 667:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const getNumberOfLines = __nccwpck_require__(495)/* .getNumberOfLines */ .y;
const getUnfinishedLine = __nccwpck_require__(495)/* .getUnfinishedLine */ .P;

class CodeNode {
	constructor(generatedCode) {
		this.generatedCode = generatedCode;
	}

	clone() {
		return new CodeNode(this.generatedCode);
	}

	getGeneratedCode() {
		return this.generatedCode;
	}

	getMappings(mappingsContext) {
		const lines = getNumberOfLines(this.generatedCode);
		const mapping = Array(lines+1).join(";");
		if(lines > 0) {
			mappingsContext.unfinishedGeneratedLine = getUnfinishedLine(this.generatedCode);
			if(mappingsContext.unfinishedGeneratedLine > 0) {
				return mapping + "A";
			} else {
				return mapping;
			}
		} else {
			const prevUnfinished = mappingsContext.unfinishedGeneratedLine;
			mappingsContext.unfinishedGeneratedLine += getUnfinishedLine(this.generatedCode);
			if(prevUnfinished === 0 && mappingsContext.unfinishedGeneratedLine > 0) {
				return "A";
			} else {
				return "";
			}
		}
	}

	addGeneratedCode(generatedCode) {
		this.generatedCode += generatedCode;
	}

	mapGeneratedCode(fn) {
		const generatedCode = fn(this.generatedCode);
		return new CodeNode(generatedCode);
	}

	getNormalizedNodes() {
		return [this];
	}

	merge(otherNode) {
		if(otherNode instanceof CodeNode) {
			this.generatedCode += otherNode.generatedCode;
			return this;
		}
		return false;
	}
}

module.exports = CodeNode;


/***/ }),

/***/ 432:
/***/ ((module) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


class MappingsContext {
	constructor() {
		this.sourcesIndices = new Map();
		this.sourcesContent = new Map();
		this.hasSourceContent = false;
		this.currentOriginalLine = 1;
		this.currentSource = 0;
		this.unfinishedGeneratedLine = false;
	}

	ensureSource(source, originalSource) {
		let idx = this.sourcesIndices.get(source);
		if(typeof idx === "number") {
			return idx;
		}
		idx = this.sourcesIndices.size;
		this.sourcesIndices.set(source, idx);
		this.sourcesContent.set(source, originalSource)
		if(typeof originalSource === "string")
			this.hasSourceContent = true;
		return idx;
	}

	getArrays() {
		const sources = [];
		const sourcesContent = [];

		for(const pair of this.sourcesContent) {
			sources.push(pair[0]);
			sourcesContent.push(pair[1]);
		}

		return {
			sources,
			sourcesContent
		};
	}
}
module.exports = MappingsContext;


/***/ }),

/***/ 664:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const base64VLQ = __nccwpck_require__(430);
const getNumberOfLines = __nccwpck_require__(495)/* .getNumberOfLines */ .y;
const getUnfinishedLine = __nccwpck_require__(495)/* .getUnfinishedLine */ .P;

const LINE_MAPPING = ";AAAA";

class SingleLineNode {

	constructor(generatedCode, source, originalSource, line) {
		this.generatedCode = generatedCode;
		this.originalSource = originalSource;
		this.source = source;
		this.line = line || 1;
		this._numberOfLines = getNumberOfLines(this.generatedCode);
		this._endsWithNewLine = generatedCode[generatedCode.length - 1] === "\n";
	}

	clone() {
		return new SingleLineNode(this.generatedCode, this.source, this.originalSource, this.line);
	}

	getGeneratedCode() {
		return this.generatedCode;
	}

	getMappings(mappingsContext) {
		if(!this.generatedCode)
			return "";
		const lines = this._numberOfLines;
		const sourceIdx = mappingsContext.ensureSource(this.source, this.originalSource);
		let mappings = "A"; // generated column 0
		if(mappingsContext.unfinishedGeneratedLine)
			mappings = "," + base64VLQ.encode(mappingsContext.unfinishedGeneratedLine);
		mappings += base64VLQ.encode(sourceIdx - mappingsContext.currentSource); // source index
		mappings += base64VLQ.encode(this.line - mappingsContext.currentOriginalLine); // original line index
		mappings += "A"; // original column 0
		mappingsContext.currentSource = sourceIdx;
		mappingsContext.currentOriginalLine = this.line;
		const unfinishedGeneratedLine = mappingsContext.unfinishedGeneratedLine = getUnfinishedLine(this.generatedCode)
		mappings += Array(lines).join(LINE_MAPPING);
		if(unfinishedGeneratedLine === 0) {
			mappings += ";";
		} else {
			if(lines !== 0)
				mappings += LINE_MAPPING;
		}
		return mappings;
	}

	getNormalizedNodes() {
		return [this];
	}

	mapGeneratedCode(fn) {
		const generatedCode = fn(this.generatedCode);
		return new SingleLineNode(generatedCode, this.source, this.originalSource, this.line);
	}

	merge(otherNode) {
		if(otherNode instanceof SingleLineNode) {
			return this.mergeSingleLineNode(otherNode);
		}
		return false;
	}

	mergeSingleLineNode(otherNode) {
		if(this.source === otherNode.source &&
			this.originalSource === otherNode.originalSource) {
			if(this.line === otherNode.line) {
				this.generatedCode += otherNode.generatedCode;
				this._numberOfLines += otherNode._numberOfLines;
				this._endsWithNewLine = otherNode._endsWithNewLine;
				return this;
			} else if(this.line + 1 === otherNode.line && 
				this._endsWithNewLine &&
				this._numberOfLines === 1 && 
				otherNode._numberOfLines <= 1) {
				return new SourceNode(this.generatedCode + otherNode.generatedCode, this.source, this.originalSource, this.line);
			}
		}
		return false;
	}
}

module.exports = SingleLineNode;

const SourceNode = __nccwpck_require__(176); // circular dependency


/***/ }),

/***/ 361:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const CodeNode = __nccwpck_require__(667);
const SourceNode = __nccwpck_require__(176);
const MappingsContext = __nccwpck_require__(432);
const getNumberOfLines = __nccwpck_require__(495)/* .getNumberOfLines */ .y;

class SourceListMap {

	constructor(generatedCode, source, originalSource) {
		if(Array.isArray(generatedCode)) {
			this.children = generatedCode;
		} else {
			this.children = [];
			if(generatedCode || source)
				this.add(generatedCode, source, originalSource);
		}
	}

	add(generatedCode, source, originalSource) {
		if(typeof generatedCode === "string") {
			if(source) {
				this.children.push(new SourceNode(generatedCode, source, originalSource));
			} else if(this.children.length > 0 && this.children[this.children.length - 1] instanceof CodeNode) {
				this.children[this.children.length - 1].addGeneratedCode(generatedCode);
			} else {
				this.children.push(new CodeNode(generatedCode));
			}
		} else if(generatedCode.getMappings && generatedCode.getGeneratedCode) {
			this.children.push(generatedCode);
		} else if(generatedCode.children) {
			generatedCode.children.forEach(function(sln) {
				this.children.push(sln);
			}, this);
		} else {
			throw new Error("Invalid arguments to SourceListMap.protfotype.add: Expected string, Node or SourceListMap");
		}
	};

	preprend(generatedCode, source, originalSource) {
		if(typeof generatedCode === "string") {
			if(source) {
				this.children.unshift(new SourceNode(generatedCode, source, originalSource));
			} else if(this.children.length > 0 && this.children[this.children.length - 1].preprendGeneratedCode) {
				this.children[this.children.length - 1].preprendGeneratedCode(generatedCode);
			} else {
				this.children.unshift(new CodeNode(generatedCode));
			}
		} else if(generatedCode.getMappings && generatedCode.getGeneratedCode) {
			this.children.unshift(generatedCode);
		} else if(generatedCode.children) {
			generatedCode.children.slice().reverse().forEach(function(sln) {
				this.children.unshift(sln);
			}, this);
		} else {
			throw new Error("Invalid arguments to SourceListMap.protfotype.prerend: Expected string, Node or SourceListMap");
		}
	};

	mapGeneratedCode(fn) {
		const normalizedNodes = [];
		this.children.forEach(function(sln) {
			sln.getNormalizedNodes().forEach(function(newNode) {
				normalizedNodes.push(newNode);
			});
		});
		const optimizedNodes = [];
		normalizedNodes.forEach(function(sln) {
			sln = sln.mapGeneratedCode(fn);
			if(optimizedNodes.length === 0) {
				optimizedNodes.push(sln);
			} else {
				const last = optimizedNodes[optimizedNodes.length - 1];
				const mergedNode = last.merge(sln);
				if(mergedNode) {
					optimizedNodes[optimizedNodes.length - 1] = mergedNode;
				} else {
					optimizedNodes.push(sln);
				}
			}
		});
		return new SourceListMap(optimizedNodes);
	};

	toString() {
		return this.children.map(function(sln) {
			return sln.getGeneratedCode();
		}).join("");
	};

	toStringWithSourceMap(options) {
		const mappingsContext = new MappingsContext();
		const source = this.children.map(function(sln) {
			return sln.getGeneratedCode();
		}).join("");
		const mappings = this.children.map(function(sln) {
			return sln.getMappings(mappingsContext);
		}).join("");
		const arrays = mappingsContext.getArrays();
		return {
			source,
			map: {
				version: 3,
				file: options && options.file,
				sources: arrays.sources,
				sourcesContent: mappingsContext.hasSourceContent ? arrays.sourcesContent : undefined,
				mappings: mappings
			}
		};
	}
}

module.exports = SourceListMap;


/***/ }),

/***/ 176:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const base64VLQ = __nccwpck_require__(430);
const getNumberOfLines = __nccwpck_require__(495)/* .getNumberOfLines */ .y;
const getUnfinishedLine = __nccwpck_require__(495)/* .getUnfinishedLine */ .P;

const LINE_MAPPING = ";AACA";

class SourceNode {

	constructor(generatedCode, source, originalSource, startingLine) {
		this.generatedCode = generatedCode;
		this.originalSource = originalSource;
		this.source = source;
		this.startingLine = startingLine || 1;
		this._numberOfLines = getNumberOfLines(this.generatedCode);
		this._endsWithNewLine = generatedCode[generatedCode.length - 1] === "\n";
	}

	clone() {
		return new SourceNode(this.generatedCode, this.source, this.originalSource, this.startingLine);
	}

	getGeneratedCode() {
		return this.generatedCode;
	}

	addGeneratedCode(code) {
		this.generatedCode += code;
		this._numberOfLines += getNumberOfLines(code);
		this._endsWithNewLine = code[code.length - 1] === "\n";
	}

	getMappings(mappingsContext) {
		if(!this.generatedCode)
			return "";
		const lines = this._numberOfLines;
		const sourceIdx = mappingsContext.ensureSource(this.source, this.originalSource);
		let mappings = "A"; // generated column 0
		if(mappingsContext.unfinishedGeneratedLine)
			mappings = "," + base64VLQ.encode(mappingsContext.unfinishedGeneratedLine);
		mappings += base64VLQ.encode(sourceIdx - mappingsContext.currentSource); // source index
		mappings += base64VLQ.encode(this.startingLine - mappingsContext.currentOriginalLine); // original line index
		mappings += "A"; // original column 0
		mappingsContext.currentSource = sourceIdx;
		mappingsContext.currentOriginalLine = this.startingLine + lines - 1;
		const unfinishedGeneratedLine = mappingsContext.unfinishedGeneratedLine = getUnfinishedLine(this.generatedCode)
		mappings += Array(lines).join(LINE_MAPPING);
		if(unfinishedGeneratedLine === 0) {
			mappings += ";";
		} else {
			if(lines !== 0) {
				mappings += LINE_MAPPING;
			}
			mappingsContext.currentOriginalLine++;
		}
		return mappings;
	}

	mapGeneratedCode(fn) {
		throw new Error("Cannot map generated code on a SourceMap. Normalize to SingleLineNode first.");
	}

	getNormalizedNodes() {
		var results = [];
		var currentLine = this.startingLine;
		var generatedCode = this.generatedCode;
		var index = 0;
		var indexEnd = generatedCode.length;
		while(index < indexEnd) {
			// get one generated line
			var nextLine = generatedCode.indexOf("\n", index) + 1;
			if(nextLine === 0) nextLine = indexEnd;
			var lineGenerated = generatedCode.substr(index, nextLine - index);

			results.push(new SingleLineNode(lineGenerated, this.source, this.originalSource, currentLine));

			// move cursors
			index = nextLine;
			currentLine++;
		}
		return results;
	}

	merge(otherNode) {
		if(otherNode instanceof SourceNode) {
			return this.mergeSourceNode(otherNode);
		} else if(otherNode instanceof SingleLineNode) {
			return this.mergeSingleLineNode(otherNode);
		}
		return false;
	}

	mergeSourceNode(otherNode) {
		if(this.source === otherNode.source &&
			this._endsWithNewLine &&
			this.startingLine + this._numberOfLines === otherNode.startingLine) {
			this.generatedCode += otherNode.generatedCode;
			this._numberOfLines += otherNode._numberOfLines;
			this._endsWithNewLine = otherNode._endsWithNewLine;
			return this;
		}
		return false;
	}

	mergeSingleLineNode(otherNode) {
		if(this.source === otherNode.source &&
			this._endsWithNewLine &&
			this.startingLine + this._numberOfLines === otherNode.line &&
			otherNode._numberOfLines <= 1) {
			this.addSingleLineNode(otherNode);
			return this;
		}
		return false;
	}

	addSingleLineNode(otherNode) {
		this.generatedCode += otherNode.generatedCode;
		this._numberOfLines += otherNode._numberOfLines
		this._endsWithNewLine = otherNode._endsWithNewLine;
	}
}

module.exports = SourceNode;
const SingleLineNode = __nccwpck_require__(664); // circular dependency


/***/ }),

/***/ 430:
/***/ ((__unused_webpack_module, exports) => {

/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Based on the Base 64 VLQ implementation in Closure Compiler:
 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
 *
 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials provided
 *    with the distribution.
 *  * Neither the name of Google Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/*eslint no-bitwise:0,quotes:0,global-strict:0*/

var charToIntMap = {};
var intToCharMap = {};

'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  .split('')
  .forEach(function (ch, index) {
    charToIntMap[ch] = index;
    intToCharMap[index] = ch;
  });

var base64 = {};
/**
 * Encode an integer in the range of 0 to 63 to a single base 64 digit.
 */
base64.encode = function base64_encode(aNumber) {
  if (aNumber in intToCharMap) {
    return intToCharMap[aNumber];
  }
  throw new TypeError("Must be between 0 and 63: " + aNumber);
};

/**
 * Decode a single base 64 digit to an integer.
 */
base64.decode = function base64_decode(aChar) {
  if (aChar in charToIntMap) {
    return charToIntMap[aChar];
  }
  throw new TypeError("Not a valid base 64 digit: " + aChar);
};



// A single base 64 digit can contain 6 bits of data. For the base 64 variable
// length quantities we use in the source map spec, the first bit is the sign,
// the next four bits are the actual value, and the 6th bit is the
// continuation bit. The continuation bit tells us whether there are more
// digits in this value following this digit.
//
//   Continuation
//   |    Sign
//   |    |
//   V    V
//   101011

var VLQ_BASE_SHIFT = 5;

// binary: 100000
var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

// binary: 011111
var VLQ_BASE_MASK = VLQ_BASE - 1;

// binary: 100000
var VLQ_CONTINUATION_BIT = VLQ_BASE;

/**
 * Converts from a two-complement value to a value where the sign bit is
 * placed in the least significant bit.  For example, as decimals:
 *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
 *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
 */
function toVLQSigned(aValue) {
  return aValue < 0
    ? ((-aValue) << 1) + 1
    : (aValue << 1) + 0;
}

/**
 * Converts to a two-complement value from a value where the sign bit is
 * placed in the least significant bit.  For example, as decimals:
 *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
 *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
 */
function fromVLQSigned(aValue) {
  var isNegative = (aValue & 1) === 1;
  var shifted = aValue >> 1;
  return isNegative
    ? -shifted
    : shifted;
}

/**
 * Returns the base 64 VLQ encoded value.
 */
exports.encode = function base64VLQ_encode(aValue) {
  var encoded = "";
  var digit;

  var vlq = toVLQSigned(aValue);

  do {
    digit = vlq & VLQ_BASE_MASK;
    vlq >>>= VLQ_BASE_SHIFT;
    if (vlq > 0) {
      // There are still more digits in this value, so we must make sure the
      // continuation bit is marked.
      digit |= VLQ_CONTINUATION_BIT;
    }
    encoded += base64.encode(digit);
  } while (vlq > 0);

  return encoded;
};

/**
 * Decodes the next base 64 VLQ value from the given string and returns the
 * value and the rest of the string via the out parameter.
 */
exports.decode = function base64VLQ_decode(aStr, aOutParam) {
  var i = 0;
  var strLen = aStr.length;
  var result = 0;
  var shift = 0;
  var continuation, digit;

  do {
    if (i >= strLen) {
      throw new Error("Expected more digits in base 64 VLQ value.");
    }
    digit = base64.decode(aStr.charAt(i++));
    continuation = !!(digit & VLQ_CONTINUATION_BIT);
    digit &= VLQ_BASE_MASK;
    result = result + (digit << shift);
    shift += VLQ_BASE_SHIFT;
  } while (continuation);

  aOutParam.value = fromVLQSigned(result);
  aOutParam.rest = aStr.slice(i);
};


/***/ }),

/***/ 444:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const base64VLQ = __nccwpck_require__(430);
const SourceNode = __nccwpck_require__(176);
const CodeNode = __nccwpck_require__(667);
const SourceListMap = __nccwpck_require__(361);

module.exports = function fromStringWithSourceMap(code, map) {
	const sources = map.sources;
	const sourcesContent = map.sourcesContent;
	const mappings = map.mappings.split(";");
	const lines = code.split("\n");
	const nodes = [];
	let currentNode = null;
	let currentLine = 1;
	let currentSourceIdx = 0;
	let currentSourceNodeLine;
	function addCode(generatedCode) {
		if(currentNode && currentNode instanceof CodeNode) {
			currentNode.addGeneratedCode(generatedCode);
		} else if(currentNode && currentNode instanceof SourceNode && !generatedCode.trim()) {
			currentNode.addGeneratedCode(generatedCode);
			currentSourceNodeLine++;
		} else {
			currentNode = new CodeNode(generatedCode);
			nodes.push(currentNode);
		}
	}
	function addSource(generatedCode, source, originalSource, linePosition) {
		if(currentNode && currentNode instanceof SourceNode &&
			currentNode.source === source &&
			currentSourceNodeLine === linePosition
		) {
			currentNode.addGeneratedCode(generatedCode);
			currentSourceNodeLine++;
		} else {
			currentNode = new SourceNode(generatedCode, source, originalSource, linePosition);
			currentSourceNodeLine = linePosition + 1;
			nodes.push(currentNode);
		}
	}
	mappings.forEach(function(mapping, idx) {
		let line = lines[idx];
		if(typeof line === 'undefined') return;
		if(idx !== lines.length - 1) line += "\n";
		if(!mapping)
			return addCode(line);
		mapping = { value: 0, rest: mapping };
		let lineAdded = false;
		while(mapping.rest)
			lineAdded = processMapping(mapping, line, lineAdded) || lineAdded;
		if(!lineAdded)
			addCode(line);
	});
	if(mappings.length < lines.length) {
		let idx = mappings.length;
		while(!lines[idx].trim() && idx < lines.length-1) {
			addCode(lines[idx] + "\n");
			idx++;
		}
		addCode(lines.slice(idx).join("\n"));
	}
	return new SourceListMap(nodes);
	function processMapping(mapping, line, ignore) {
		if(mapping.rest && mapping.rest[0] !== ",") {
			base64VLQ.decode(mapping.rest, mapping);
		}
		if(!mapping.rest)
			return false;
		if(mapping.rest[0] === ",") {
			mapping.rest = mapping.rest.substr(1);
			return false;
		}

		base64VLQ.decode(mapping.rest, mapping);
		const sourceIdx = mapping.value + currentSourceIdx;
		currentSourceIdx = sourceIdx;

		let linePosition;
		if(mapping.rest && mapping.rest[0] !== ",") {
			base64VLQ.decode(mapping.rest, mapping);
			linePosition = mapping.value + currentLine;
			currentLine = linePosition;
		} else {
			linePosition = currentLine;
		}

		if(mapping.rest) {
			const next = mapping.rest.indexOf(",");
			mapping.rest = next === -1 ? "" : mapping.rest.substr(next);
		}

		if(!ignore) {
			addSource(line, sources ? sources[sourceIdx] : null, sourcesContent ? sourcesContent[sourceIdx] : null, linePosition)
			return true;
		}
	}
};


/***/ }),

/***/ 495:
/***/ ((__unused_webpack_module, exports) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


exports.y = function getNumberOfLines(str) {
	let nr = -1;
	let idx = -1;
	do {
		nr++
		idx = str.indexOf("\n", idx + 1);
	} while(idx >= 0);
	return nr;
};

exports.P = function getUnfinishedLine(str) {
	const idx = str.lastIndexOf("\n");
	if(idx === -1)
		return str.length;
	else
		return str.length - idx - 1;
};


/***/ }),

/***/ 524:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

exports.SourceListMap = __nccwpck_require__(361);
/* unused reexport */ __nccwpck_require__(176);
/* unused reexport */ __nccwpck_require__(664);
/* unused reexport */ __nccwpck_require__(667);
/* unused reexport */ __nccwpck_require__(432);
exports.fromStringWithSourceMap = __nccwpck_require__(444);


/***/ }),

/***/ 411:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Source = __nccwpck_require__(781);

class CachedSource extends Source {
	constructor(source) {
		super();
		this._source = source;
		this._cachedSource = undefined;
		this._cachedSize = undefined;
		this._cachedMaps = {};

		if(source.node) this.node = function(options) {
			return this._source.node(options);
		};

		if(source.listMap) this.listMap = function(options) {
			return this._source.listMap(options);
		};
	}

	source() {
		if(typeof this._cachedSource !== "undefined") return this._cachedSource;
		return this._cachedSource = this._source.source();
	}

	size() {
		if(typeof this._cachedSize !== "undefined") return this._cachedSize;
		if(typeof this._cachedSource !== "undefined") {
			if(Buffer.from.length === 1) return new Buffer(this._cachedSource).length;
			return this._cachedSize = Buffer.byteLength(this._cachedSource);
		}
		return this._cachedSize = this._source.size();
	}

	sourceAndMap(options) {
		const key = JSON.stringify(options);
		if(typeof this._cachedSource !== "undefined" && key in this._cachedMaps)
			return {
				source: this._cachedSource,
				map: this._cachedMaps[key]
			};
		else if(typeof this._cachedSource !== "undefined") {
			return {
				source: this._cachedSource,
				map: this._cachedMaps[key] = this._source.map(options)
			};
		} else if(key in this._cachedMaps) {
			return {
				source: this._cachedSource = this._source.source(),
				map: this._cachedMaps[key]
			};
		}
		const result = this._source.sourceAndMap(options);
		this._cachedSource = result.source;
		this._cachedMaps[key] = result.map;
		return {
			source: this._cachedSource,
			map: this._cachedMaps[key]
		};
	}

	map(options) {
		if(!options) options = {};
		const key = JSON.stringify(options);
		if(key in this._cachedMaps)
			return this._cachedMaps[key];
		return this._cachedMaps[key] = this._source.map();
	}

	updateHash(hash) {
		this._source.updateHash(hash);
	}
}

module.exports = CachedSource;


/***/ }),

/***/ 744:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const SourceNode = __nccwpck_require__(241).SourceNode;
const SourceListMap = __nccwpck_require__(524).SourceListMap;
const Source = __nccwpck_require__(781);

class ConcatSource extends Source {
	constructor() {
		super();
		this.children = [];
		for(var i = 0; i < arguments.length; i++) {
			var item = arguments[i];
			if(item instanceof ConcatSource) {
				var children = item.children;
				for(var j = 0; j < children.length; j++)
					this.children.push(children[j]);
			} else {
				this.children.push(item);
			}
		}
	}

	add(item) {
		if(item instanceof ConcatSource) {
			var children = item.children;
			for(var j = 0; j < children.length; j++)
				this.children.push(children[j]);
		} else {
			this.children.push(item);
		}
	}

	source() {
		let source = "";
		const children = this.children;
		for(let i = 0; i < children.length; i++) {
			const child = children[i];
			source += typeof child === "string" ? child : child.source();
		}
		return source;
	}

	size() {
		let size = 0;
		const children = this.children;
		for(let i = 0; i < children.length; i++) {
			const child = children[i];
			size += typeof child === "string" ? child.length : child.size();
		}
		return size;
	}

	node(options) {
		const node = new SourceNode(null, null, null, this.children.map(function(item) {
			return typeof item === "string" ? item : item.node(options);
		}));
		return node;
	}

	listMap(options) {
		const map = new SourceListMap();
		var children = this.children;
		for(var i = 0; i < children.length; i++) {
			var item = children[i];
			if(typeof item === "string")
				map.add(item);
			else
				map.add(item.listMap(options));
		}
		return map;
	}

	updateHash(hash) {
		var children = this.children;
		for(var i = 0; i < children.length; i++) {
			var item = children[i];
			if(typeof item === "string")
				hash.update(item);
			else
				item.updateHash(hash);
		}
	}
}

__nccwpck_require__(733)(ConcatSource.prototype);

module.exports = ConcatSource;


/***/ }),

/***/ 820:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


var SourceNode = __nccwpck_require__(241).SourceNode;
var SourceMapConsumer = __nccwpck_require__(241).SourceMapConsumer;
var SourceListMap = __nccwpck_require__(524).SourceListMap;
var Source = __nccwpck_require__(781);

class LineToLineMappedSource extends Source {
	constructor(value, name, originalSource) {
		super();
		this._value = value;
		this._name = name;
		this._originalSource = originalSource;
	}

	source() {
		return this._value;
	}

	node(options) {
		var value = this._value;
		var name = this._name;
		var lines = value.split("\n");
		var node = new SourceNode(null, null, null,
			lines.map(function(line, idx) {
				return new SourceNode(idx + 1, 0, name, (line + (idx != lines.length - 1 ? "\n" : "")));
			})
		);
		node.setSourceContent(name, this._originalSource);
		return node;
	}

	listMap(options) {
		return new SourceListMap(this._value, this._name, this._originalSource)
	}

	updateHash(hash) {
		hash.update(this._value);
		hash.update(this._originalSource);
	}
}

__nccwpck_require__(733)(LineToLineMappedSource.prototype);

module.exports = LineToLineMappedSource;


/***/ }),

/***/ 221:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


var SourceNode = __nccwpck_require__(241).SourceNode;
var SourceMapConsumer = __nccwpck_require__(241).SourceMapConsumer;
var SourceListMap = __nccwpck_require__(524).SourceListMap;
var Source = __nccwpck_require__(781);

var SPLIT_REGEX = /(?!$)[^\n\r;{}]*[\n\r;{}]*/g;

function _splitCode(code) {
	return code.match(SPLIT_REGEX) || [];
}

class OriginalSource extends Source {
	constructor(value, name) {
		super();
		this._value = value;
		this._name = name;
	}

	source() {
		return this._value;
	}

	node(options) {
		options = options || {};
		var sourceMap = this._sourceMap;
		var value = this._value;
		var name = this._name;
		var lines = value.split("\n");
		var node = new SourceNode(null, null, null,
			lines.map(function(line, idx) {
				var pos = 0;
				if(options.columns === false) {
					var content = line + (idx != lines.length - 1 ? "\n" : "");
					return new SourceNode(idx + 1, 0, name, content);
				}
				return new SourceNode(null, null, null,
					_splitCode(line + (idx != lines.length - 1 ? "\n" : "")).map(function(item) {
						if(/^\s*$/.test(item)) {
							pos += item.length;
							return item;
						}
						var res = new SourceNode(idx + 1, pos, name, item);
						pos += item.length;
						return res;
					})
				);
			})
		);
		node.setSourceContent(name, value);
		return node;
	}

	listMap(options) {
		return new SourceListMap(this._value, this._name, this._value)
	}

	updateHash(hash) {
		hash.update(this._value);
	}
}

__nccwpck_require__(733)(OriginalSource.prototype);

module.exports = OriginalSource;


/***/ }),

/***/ 141:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


var Source = __nccwpck_require__(781);
var SourceNode = __nccwpck_require__(241).SourceNode;

var REPLACE_REGEX = /\n(?=.|\s)/g;

function cloneAndPrefix(node, prefix, append) {
	if(typeof node === "string") {
		var result = node.replace(REPLACE_REGEX, "\n" + prefix);
		if(append.length > 0) result = append.pop() + result;
		if(/\n$/.test(node)) append.push(prefix);
		return result;
	} else {
		var newNode = new SourceNode(
			node.line,
			node.column,
			node.source,
			node.children.map(function(node) {
				return cloneAndPrefix(node, prefix, append);
			}),
			node.name
		);
		newNode.sourceContents = node.sourceContents;
		return newNode;
	}
};

class PrefixSource extends Source {
	constructor(prefix, source) {
		super();
		this._source = source;
		this._prefix = prefix;
	}

	source() {
		var node = typeof this._source === "string" ? this._source : this._source.source();
		var prefix = this._prefix;
		return prefix + node.replace(REPLACE_REGEX, "\n" + prefix);
	}

	node(options) {
		var node = this._source.node(options);
		var prefix = this._prefix;
		var output = [];
		var result = new SourceNode();
		node.walkSourceContents(function(source, content) {
			result.setSourceContent(source, content);
		});
		var needPrefix = true;
		node.walk(function(chunk, mapping) {
			var parts = chunk.split(/(\n)/);
			for(var i = 0; i < parts.length; i += 2) {
				var nl = i + 1 < parts.length;
				var part = parts[i] + (nl ? "\n" : "");
				if(part) {
					if(needPrefix) {
						output.push(prefix);
					}
					output.push(new SourceNode(mapping.line, mapping.column, mapping.source, part, mapping.name));
					needPrefix = nl;
				}
			}
		});
		result.add(output);
		return result;
	}

	listMap(options) {
		var prefix = this._prefix;
		var map = this._source.listMap(options);
		return map.mapGeneratedCode(function(code) {
			return prefix + code.replace(REPLACE_REGEX, "\n" + prefix);
		});
	}

	updateHash(hash) {
		if(typeof this._source === "string")
			hash.update(this._source);
		else
			this._source.updateHash(hash);
		if(typeof this._prefix === "string")
			hash.update(this._prefix);
		else
			this._prefix.updateHash(hash);
	}
}

__nccwpck_require__(733)(PrefixSource.prototype);

module.exports = PrefixSource;


/***/ }),

/***/ 76:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


var Source = __nccwpck_require__(781);
var SourceNode = __nccwpck_require__(241).SourceNode;
var SourceListMap = __nccwpck_require__(524).SourceListMap;

class RawSource extends Source {
	constructor(value) {
		super();
		this._value = value;
	}

	source() {
		return this._value;
	}

	map(options) {
		return null;
	}

	node(options) {
		return new SourceNode(null, null, null, this._value);
	}

	listMap(options) {
		return new SourceListMap(this._value);
	}

	updateHash(hash) {
		hash.update(this._value);
	}
}

module.exports = RawSource;


/***/ }),

/***/ 22:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


var Source = __nccwpck_require__(781);
var SourceNode = __nccwpck_require__(241).SourceNode;

class Replacement {
	constructor(start, end, content, insertIndex, name) {
		this.start = start;
		this.end = end;
		this.content = content;
		this.insertIndex = insertIndex;
		this.name = name;
	}
}

class ReplaceSource extends Source {
	constructor(source, name) {
		super();
		this._source = source;
		this._name = name;
		/** @type {Replacement[]} */
		this.replacements = [];
	}

	replace(start, end, newValue, name) {
		if(typeof newValue !== "string")
			throw new Error("insertion must be a string, but is a " + typeof newValue);
		this.replacements.push(new Replacement(start, end, newValue, this.replacements.length, name));
	}

	insert(pos, newValue, name) {
		if(typeof newValue !== "string")
			throw new Error("insertion must be a string, but is a " + typeof newValue + ": " + newValue);
		this.replacements.push(new Replacement(pos, pos - 1, newValue, this.replacements.length, name));
	}

	source(options) {
		return this._replaceString(this._source.source());
	}

	original() {
		return this._source;
	}

	_sortReplacements() {
		this.replacements.sort(function(a, b) {
			var diff = b.end - a.end;
			if(diff !== 0)
				return diff;
			diff = b.start - a.start;
			if(diff !== 0)
				return diff;
			return b.insertIndex - a.insertIndex;
		});
	}

	_replaceString(str) {
		if(typeof str !== "string")
			throw new Error("str must be a string, but is a " + typeof str + ": " + str);
		this._sortReplacements();
		var result = [str];
		this.replacements.forEach(function(repl) {
			var remSource = result.pop();
			var splitted1 = this._splitString(remSource, Math.floor(repl.end + 1));
			var splitted2 = this._splitString(splitted1[0], Math.floor(repl.start));
			result.push(splitted1[1], repl.content, splitted2[0]);
		}, this);

		// write out result array in reverse order
		let resultStr = "";
		for(let i = result.length - 1; i >= 0; --i) {
			resultStr += result[i];
		}
		return resultStr;
	}

	node(options) {
		var node = this._source.node(options);
		if(this.replacements.length === 0) {
			return node;
		}
		this._sortReplacements();
		var replace = new ReplacementEnumerator(this.replacements);
		var output = [];
		var position = 0;
		var sources = Object.create(null);
		var sourcesInLines = Object.create(null);

		// We build a new list of SourceNodes in "output"
		// from the original mapping data

		var result = new SourceNode();

		// We need to add source contents manually
		// because "walk" will not handle it
		node.walkSourceContents(function(sourceFile, sourceContent) {
			result.setSourceContent(sourceFile, sourceContent);
			sources["$" + sourceFile] = sourceContent;
		});

		var replaceInStringNode = this._replaceInStringNode.bind(this, output, replace, function getOriginalSource(mapping) {
			var key = "$" + mapping.source;
			var lines = sourcesInLines[key];
			if(!lines) {
				var source = sources[key];
				if(!source) return null;
				lines = source.split("\n").map(function(line) {
					return line + "\n";
				});
				sourcesInLines[key] = lines;
			}
			// line is 1-based
			if(mapping.line > lines.length) return null;
			var line = lines[mapping.line - 1];
			return line.substr(mapping.column);
		});

		node.walk(function(chunk, mapping) {
			position = replaceInStringNode(chunk, position, mapping);
		});

		// If any replacements occur after the end of the original file, then we append them
		// directly to the end of the output
		var remaining = replace.footer();
		if(remaining) {
			output.push(remaining);
		}

		result.add(output);

		return result;
	}

	listMap(options) {
		this._sortReplacements();
		var map = this._source.listMap(options);
		var currentIndex = 0;
		var replacements = this.replacements;
		var idxReplacement = replacements.length - 1;
		var removeChars = 0;
		map = map.mapGeneratedCode(function(str) {
			var newCurrentIndex = currentIndex + str.length;
			if(removeChars > str.length) {
				removeChars -= str.length;
				str = "";
			} else {
				if(removeChars > 0) {
					str = str.substr(removeChars);
					currentIndex += removeChars;
					removeChars = 0;
				}
				var finalStr = "";
				while(idxReplacement >= 0 && replacements[idxReplacement].start < newCurrentIndex) {
					var repl = replacements[idxReplacement];
					var start = Math.floor(repl.start);
					var end = Math.floor(repl.end + 1);
					var before = str.substr(0, Math.max(0, start - currentIndex));
					if(end <= newCurrentIndex) {
						var after = str.substr(Math.max(0, end - currentIndex));
						finalStr += before + repl.content;
						str = after;
						currentIndex = Math.max(currentIndex, end);
					} else {
						finalStr += before + repl.content;
						str = "";
						removeChars = end - newCurrentIndex;
					}
					idxReplacement--;
				}
				str = finalStr + str;
			}
			currentIndex = newCurrentIndex;
			return str;
		});
		var extraCode = "";
		while(idxReplacement >= 0) {
			extraCode += replacements[idxReplacement].content;
			idxReplacement--;
		}
		if(extraCode) {
			map.add(extraCode);
		}
		return map;
	}

	_splitString(str, position) {
		return position <= 0 ? ["", str] : [str.substr(0, position), str.substr(position)];
	}

	_replaceInStringNode(output, replace, getOriginalSource, node, position, mapping) {
		var original = undefined;

		do {
			var splitPosition = replace.position - position;
			// If multiple replaces occur in the same location then the splitPosition may be
			// before the current position for the subsequent splits. Ensure it is >= 0
			if(splitPosition < 0) {
				splitPosition = 0;
			}
			if(splitPosition >= node.length || replace.done) {
				if(replace.emit) {
					var nodeEnd = new SourceNode(
						mapping.line,
						mapping.column,
						mapping.source,
						node,
						mapping.name
					);
					output.push(nodeEnd);
				}
				return position + node.length;
			}

			var originalColumn = mapping.column;

			// Try to figure out if generated code matches original code of this segement
			// If this is the case we assume that it's allowed to move mapping.column
			// Because getOriginalSource can be expensive we only do it when neccessary

			var nodePart;
			if(splitPosition > 0) {
				nodePart = node.slice(0, splitPosition);
				if(original === undefined) {
					original = getOriginalSource(mapping);
				}
				if(original && original.length >= splitPosition && original.startsWith(nodePart)) {
					mapping.column += splitPosition;
					original = original.substr(splitPosition);
				}
			}

			var emit = replace.next();
			if(!emit) {
				// Stop emitting when we have found the beginning of the string to replace.
				// Emit the part of the string before splitPosition
				if(splitPosition > 0) {
					var nodeStart = new SourceNode(
						mapping.line,
						originalColumn,
						mapping.source,
						nodePart,
						mapping.name
					);
					output.push(nodeStart);
				}

				// Emit the replacement value
				if(replace.value) {
					output.push(new SourceNode(
						mapping.line,
						mapping.column,
						mapping.source,
						replace.value,
						mapping.name || replace.name
					));
				}
			}

			// Recurse with remainder of the string as there may be multiple replaces within a single node
			node = node.substr(splitPosition);
			position += splitPosition;
		} while (true);
	}
}

class ReplacementEnumerator {
	/**
	 * @param {Replacement[]} replacements list of replacements
	 */
	constructor(replacements) {
		this.replacements = replacements || [];
		this.index = this.replacements.length;
		this.done = false;
		this.emit = false;
		// Set initial start position
		this.next();
	}

	next() {
		if(this.done)
			return true;
		if(this.emit) {
			// Start point found. stop emitting. set position to find end
			var repl = this.replacements[this.index];
			var end = Math.floor(repl.end + 1);
			this.position = end;
			this.value = repl.content;
			this.name = repl.name;
		} else {
			// End point found. start emitting. set position to find next start
			this.index--;
			if(this.index < 0) {
				this.done = true;
			} else {
				var nextRepl = this.replacements[this.index];
				var start = Math.floor(nextRepl.start);
				this.position = start;
			}
		}
		if(this.position < 0)
			this.position = 0;
		this.emit = !this.emit;
		return this.emit;
	}

	footer() {
		if(!this.done && !this.emit)
			this.next(); // If we finished _replaceInNode mid emit we advance to next entry
		if(this.done) {
			return [];
		} else {
			var resultStr = "";
			for(var i = this.index; i >= 0; i--) {
				var repl = this.replacements[i];
				// this doesn't need to handle repl.name, because in SourceMaps generated code
				// without pointer to original source can't have a name
				resultStr += repl.content;
			}
			return resultStr;
		}
	}
}

__nccwpck_require__(733)(ReplaceSource.prototype);

module.exports = ReplaceSource;


/***/ }),

/***/ 781:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


var SourceNode = __nccwpck_require__(241).SourceNode;
var SourceMapConsumer = __nccwpck_require__(241).SourceMapConsumer;

class Source {

	source() {
		throw new Error("Abstract");
	}

	size() {
		if(Buffer.from.length === 1) return new Buffer(this.source()).length;
		return Buffer.byteLength(this.source())
	}

	map(options) {
		return null;
	}

	sourceAndMap(options) {
		return {
			source: this.source(),
			map: this.map()
		};
	}

	node() {
		throw new Error("Abstract");
	}

	listNode() {
		throw new Error("Abstract");
	}

	updateHash(hash) {
		var source = this.source();
		hash.update(source || "");
	}
}

module.exports = Source;


/***/ }),

/***/ 733:
/***/ ((module) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


module.exports = function mixinSourceAndMap(proto) {
	proto.map = function(options) {
		options = options || {};
		if(options.columns === false) {
			return this.listMap(options).toStringWithSourceMap({
				file: "x"
			}).map;
		}

		return this.node(options).toStringWithSourceMap({
			file: "x"
		}).map.toJSON();
	};

	proto.sourceAndMap = function(options) {
		options = options || {};
		if(options.columns === false) {
			return this.listMap(options).toStringWithSourceMap({
				file: "x"
			});
		}

		var res = this.node(options).toStringWithSourceMap({
			file: "x"
		});
		return {
			source: res.code,
			map: res.map.toJSON()
		};
	};
}


/***/ }),

/***/ 203:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


var SourceNode = __nccwpck_require__(241).SourceNode;
var SourceMapConsumer = __nccwpck_require__(241).SourceMapConsumer;
var SourceMapGenerator = __nccwpck_require__(241).SourceMapGenerator;
var SourceListMap = __nccwpck_require__(524).SourceListMap;
var fromStringWithSourceMap = __nccwpck_require__(524).fromStringWithSourceMap;
var Source = __nccwpck_require__(781);
var applySourceMap = __nccwpck_require__(540);

class SourceMapSource extends Source {
	constructor(value, name, sourceMap, originalSource, innerSourceMap, removeOriginalSource) {
		super();
		this._value = value;
		this._name = name;
		this._sourceMap = sourceMap;
		this._originalSource = originalSource;
		this._innerSourceMap = innerSourceMap;
		this._removeOriginalSource = removeOriginalSource;
	}

	source() {
		return this._value;
	}

	node(options) {
		var sourceMap = this._sourceMap;
		var node = SourceNode.fromStringWithSourceMap(this._value, new SourceMapConsumer(sourceMap));
		node.setSourceContent(this._name, this._originalSource);
		var innerSourceMap = this._innerSourceMap;
		if(innerSourceMap) {
			node = applySourceMap(node, new SourceMapConsumer(innerSourceMap), this._name, this._removeOriginalSource);
		}
		return node;
	}

	listMap(options) {
		options = options || {};
		if(options.module === false)
			return new SourceListMap(this._value, this._name, this._value);
		return fromStringWithSourceMap(this._value, typeof this._sourceMap === "string" ? JSON.parse(this._sourceMap) : this._sourceMap);
	}

	updateHash(hash) {
		hash.update(this._value);
		if(this._originalSource)
			hash.update(this._originalSource);
	}
}

__nccwpck_require__(733)(SourceMapSource.prototype);

module.exports = SourceMapSource;


/***/ }),

/***/ 540:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/



var SourceNode = __nccwpck_require__(241).SourceNode;
var SourceMapConsumer = __nccwpck_require__(241).SourceMapConsumer;

var applySourceMap = function(
	sourceNode,
	sourceMapConsumer,
	sourceFile,
	removeGeneratedCodeForSourceFile
) {
	// The following notations are used to name stuff:
	// Left <------------> Middle <-------------------> Right
	// Input arguments:
	//        sourceNode                                       - Code mapping from Left to Middle
	//                   sourceFile                            - Name of a Middle file
	//                              sourceMapConsumer          - Code mapping from Middle to Right
	// Variables:
	//           l2m                      m2r
	// Left <-----------------------------------------> Right
	// Variables:
	//                       l2r

	var l2rResult = new SourceNode();
	var l2rOutput = [];

	var middleSourceContents = {};

	var m2rMappingsByLine = {};

	var rightSourceContentsSet = {};
	var rightSourceContentsLines = {};

	// Store all mappings by generated line
	sourceMapConsumer.eachMapping(
		function(mapping) {
			(m2rMappingsByLine[mapping.generatedLine] =
				m2rMappingsByLine[mapping.generatedLine] || []).push(mapping);
		},
		null,
		SourceMapConsumer.GENERATED_ORDER
	);

	// Store all source contents
	sourceNode.walkSourceContents(function(source, content) {
		middleSourceContents["$" + source] = content;
	});

	var middleSource = middleSourceContents["$" + sourceFile];
	var middleSourceLines = middleSource ? middleSource.split("\n") : undefined;

	// Walk all left to middle mappings
	sourceNode.walk(function(chunk, middleMapping) {
		var source;

		// Find a mapping from middle to right
		if(
			middleMapping.source === sourceFile &&
			middleMapping.line &&
			m2rMappingsByLine[middleMapping.line]
		) {
			var m2rBestFit;
			var m2rMappings = m2rMappingsByLine[middleMapping.line];
			// Note: if this becomes a performance problem, use binary search
			for(var i = 0; i < m2rMappings.length; i++) {
				if(m2rMappings[i].generatedColumn <= middleMapping.column) {
					m2rBestFit = m2rMappings[i];
				}
			}
			if(m2rBestFit) {
				var allowMiddleName = false;
				var middleLine;
				var rightSourceContent;
				var rightSourceContentLines;
				var rightSource = m2rBestFit.source;
				// Check if we have middle and right source for this mapping
				// Then we could have an "identify" mapping
				if(
					middleSourceLines &&
					rightSource &&
					(middleLine = middleSourceLines[m2rBestFit.generatedLine - 1]) &&
					((rightSourceContentLines = rightSourceContentsLines[rightSource]) ||
						(rightSourceContent = sourceMapConsumer.sourceContentFor(
							rightSource,
							true
						)))
				) {
					if(!rightSourceContentLines) {
						rightSourceContentLines = rightSourceContentsLines[
							rightSource
						] = rightSourceContent.split("\n");
					}
					var rightLine = rightSourceContentLines[m2rBestFit.originalLine - 1];
					if(rightLine) {
						var offset = middleMapping.column - m2rBestFit.generatedColumn;
						if(offset > 0) {
							var middlePart = middleLine.slice(
								m2rBestFit.generatedColumn,
								middleMapping.column
							);
							var rightPart = rightLine.slice(
								m2rBestFit.originalColumn,
								m2rBestFit.originalColumn + offset
							);
							if(middlePart === rightPart) {
								// When original and generated code is equal we assume we have an "identity" mapping
								// In this case we can offset the original position
								m2rBestFit = Object.assign({}, m2rBestFit, {
									originalColumn: m2rBestFit.originalColumn + offset,
									generatedColumn: middleMapping.column
								});
							}
						}
						if(!m2rBestFit.name && middleMapping.name) {
							allowMiddleName =
								rightLine.slice(
									m2rBestFit.originalColumn,
									m2rBestFit.originalColumn + middleMapping.name.length
								) === middleMapping.name;
						}
					}
				}

				// Construct a left to right node from the found middle to right mapping
				source = m2rBestFit.source;
				l2rOutput.push(
					new SourceNode(
						m2rBestFit.originalLine,
						m2rBestFit.originalColumn,
						source,
						chunk,
						allowMiddleName ? middleMapping.name : m2rBestFit.name
					)
				);

				// Set the source contents once
				if(!("$" + source in rightSourceContentsSet)) {
					rightSourceContentsSet["$" + source] = true;
					var sourceContent = sourceMapConsumer.sourceContentFor(source, true);
					if(sourceContent) {
						l2rResult.setSourceContent(source, sourceContent);
					}
				}
				return;
			}
		}

		if((removeGeneratedCodeForSourceFile && middleMapping.source === sourceFile) || !middleMapping.source) {
			// Construct a left to middle node with only generated code
			// Because user do not want mappings to middle sources
			// Or this chunk has no mapping
			l2rOutput.push(chunk);
			return;
		}

		// Construct a left to middle node
		source = middleMapping.source;
		l2rOutput.push(
			new SourceNode(
				middleMapping.line,
				middleMapping.column,
				source,
				chunk,
				middleMapping.name
			)
		);
		if("$" + source in middleSourceContents) {
			if(!("$" + source in rightSourceContentsSet)) {
				l2rResult.setSourceContent(source, middleSourceContents["$" + source]);
				delete middleSourceContents["$" + source];
			}
		}
	});

	// Put output into the resulting SourceNode
	l2rResult.add(l2rOutput);
	return l2rResult;
};

module.exports = applySourceMap;


/***/ }),

/***/ 368:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
exports.Source = __nccwpck_require__(781);

exports.RawSource = __nccwpck_require__(76);
exports.OriginalSource = __nccwpck_require__(221);
exports.SourceMapSource = __nccwpck_require__(203);
exports.LineToLineMappedSource = __nccwpck_require__(820);

exports.CachedSource = __nccwpck_require__(411);
exports.ConcatSource = __nccwpck_require__(744);
exports.ReplaceSource = __nccwpck_require__(22);
exports.PrefixSource = __nccwpck_require__(141);


/***/ }),

/***/ 241:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/source-map");;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
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
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
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
/******/ 	__nccwpck_require__.ab = __dirname + "/";/************************************************************************/
/******/ 	// module exports must be returned from runtime so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	return __nccwpck_require__(368);
/******/ })()
;