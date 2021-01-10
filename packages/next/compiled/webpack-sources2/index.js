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
exports.SourceNode = __nccwpck_require__(176);
exports.SingleLineNode = __nccwpck_require__(664);
exports.CodeNode = __nccwpck_require__(667);
exports.MappingsContext = __nccwpck_require__(432);
exports.fromStringWithSourceMap = __nccwpck_require__(444);


/***/ }),

/***/ 979:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Source = __nccwpck_require__(604);

const mapToBufferedMap = map => {
	if (typeof map !== "object" || !map) return map;
	const bufferedMap = Object.assign({}, map);
	if (map.mappings) {
		bufferedMap.mappings = Buffer.from(map.mappings, "utf-8");
	}
	if (map.sourcesContent) {
		bufferedMap.sourcesContent = map.sourcesContent.map(
			str => str && Buffer.from(str, "utf-8")
		);
	}
	return bufferedMap;
};

const bufferedMapToMap = bufferedMap => {
	if (typeof bufferedMap !== "object" || !bufferedMap) return bufferedMap;
	const map = Object.assign({}, bufferedMap);
	if (bufferedMap.mappings) {
		map.mappings = bufferedMap.mappings.toString("utf-8");
	}
	if (bufferedMap.sourcesContent) {
		map.sourcesContent = bufferedMap.sourcesContent.map(
			buffer => buffer && buffer.toString("utf-8")
		);
	}
	return map;
};

class CachedSource extends Source {
	constructor(source, cachedData) {
		super();
		this._source = source;
		this._cachedSourceType = cachedData ? cachedData.source : undefined;
		this._cachedSource = undefined;
		this._cachedBuffer = cachedData ? cachedData.buffer : undefined;
		this._cachedSize = cachedData ? cachedData.size : undefined;
		this._cachedMaps = cachedData ? cachedData.maps : new Map();
		this._cachedHashUpdate = cachedData ? cachedData.hash : undefined;
	}

	getCachedData() {
		// We don't want to cache strings
		// So if we have a caches sources
		// create a buffer from it and only store
		// if it was a Buffer or string
		if (this._cachedSource) {
			this.buffer();
		}
		const bufferedMaps = new Map();
		for (const pair of this._cachedMaps) {
			if (pair[1].bufferedMap === undefined) {
				pair[1].bufferedMap = mapToBufferedMap(pair[1].map);
			}
			bufferedMaps.set(pair[0], {
				map: undefined,
				bufferedMap: pair[1].bufferedMap
			});
		}
		return {
			buffer: this._cachedBuffer,
			source:
				this._cachedSourceType !== undefined
					? this._cachedSourceType
					: typeof this._cachedSource === "string"
					? true
					: Buffer.isBuffer(this._cachedSource)
					? false
					: undefined,
			size: this._cachedSize,
			maps: bufferedMaps,
			hash: this._cachedHashUpdate
		};
	}

	originalLazy() {
		return this._source;
	}

	original() {
		if (typeof this._source === "function") this._source = this._source();
		return this._source;
	}

	source() {
		if (this._cachedSource !== undefined) return this._cachedSource;
		if (this._cachedBuffer && this._cachedSourceType !== undefined) {
			return (this._cachedSource = this._cachedSourceType
				? this._cachedBuffer.toString("utf-8")
				: this._cachedBuffer);
		} else {
			return (this._cachedSource = this.original().source());
		}
	}

	buffer() {
		if (typeof this._cachedBuffer !== "undefined") return this._cachedBuffer;
		if (typeof this._cachedSource !== "undefined") {
			if (Buffer.isBuffer(this._cachedSource)) {
				return (this._cachedBuffer = this._cachedSource);
			}
			return (this._cachedBuffer = Buffer.from(this._cachedSource, "utf-8"));
		}
		if (typeof this.original().buffer === "function") {
			return (this._cachedBuffer = this.original().buffer());
		}
		const bufferOrString = this.source();
		if (Buffer.isBuffer(bufferOrString)) {
			return (this._cachedBuffer = bufferOrString);
		}
		return (this._cachedBuffer = Buffer.from(bufferOrString, "utf-8"));
	}

	size() {
		if (typeof this._cachedSize !== "undefined") return this._cachedSize;
		if (typeof this._cachedSource !== "undefined") {
			return (this._cachedSize = Buffer.byteLength(this._cachedSource));
		}
		if (typeof this._cachedBuffer !== "undefined") {
			return (this._cachedSize = this._cachedBuffer.length);
		}
		return (this._cachedSize = this.original().size());
	}

	sourceAndMap(options) {
		const key = options ? JSON.stringify(options) : "{}";
		let cacheEntry = this._cachedMaps.get(key);
		if (cacheEntry && cacheEntry.map === undefined) {
			cacheEntry.map = bufferedMapToMap(cacheEntry.bufferedMap);
		}
		if (typeof this._cachedSource !== "undefined") {
			if (cacheEntry === undefined) {
				const map = this.original().map(options);
				this._cachedMaps.set(key, { map, bufferedMap: undefined });
				return {
					source: this._cachedSource,
					map
				};
			} else {
				return {
					source: this._cachedSource,
					map: cacheEntry.map
				};
			}
		} else if (cacheEntry !== undefined) {
			return {
				source: (this._cachedSource = this.original().source()),
				map: cacheEntry.map
			};
		} else {
			const result = this.original().sourceAndMap(options);
			this._cachedSource = result.source;
			this._cachedMaps.set(key, { map: result.map, bufferedMap: undefined });
			return result;
		}
	}

	map(options) {
		const key = options ? JSON.stringify(options) : "{}";
		let cacheEntry = this._cachedMaps.get(key);
		if (cacheEntry !== undefined) {
			if (cacheEntry.map === undefined) {
				cacheEntry.map = bufferedMapToMap(cacheEntry.bufferedMap);
			}
			return cacheEntry.map;
		}
		const map = this.original().map(options);
		this._cachedMaps.set(key, { map, bufferedMap: undefined });
		return map;
	}

	updateHash(hash) {
		if (this._cachedHashUpdate !== undefined) {
			for (const item of this._cachedHashUpdate) hash.update(item);
			return;
		}
		const update = [];
		let currentString = undefined;
		const tracker = {
			update: item => {
				if (typeof item === "string" && item.length < 10240) {
					if (currentString === undefined) {
						currentString = item;
					} else {
						currentString += item;
						if (currentString > 102400) {
							update.push(Buffer.from(currentString));
							currentString = undefined;
						}
					}
				} else {
					if (currentString !== undefined) {
						update.push(Buffer.from(currentString));
						currentString = undefined;
					}
					update.push(item);
				}
			}
		};
		this.original().updateHash(tracker);
		if (currentString !== undefined) {
			update.push(Buffer.from(currentString));
		}
		for (const item of update) hash.update(item);
		this._cachedHashUpdate = update;
	}
}

module.exports = CachedSource;


/***/ }),

/***/ 32:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Source = __nccwpck_require__(604);

class CompatSource extends Source {
	static from(sourceLike) {
		return sourceLike instanceof Source
			? sourceLike
			: new CompatSource(sourceLike);
	}

	constructor(sourceLike) {
		super();
		this._sourceLike = sourceLike;
	}

	source() {
		return this._sourceLike.source();
	}

	buffer() {
		if (typeof this._sourceLike.buffer === "function") {
			return this._sourceLike.buffer();
		}
		return super.buffer();
	}

	size() {
		if (typeof this._sourceLike.size === "function") {
			return this._sourceLike.size();
		}
		return super.size();
	}

	map(options) {
		if (typeof this._sourceLike.map === "function") {
			return this._sourceLike.map(options);
		}
		return super.map(options);
	}

	sourceAndMap(options) {
		if (typeof this._sourceLike.sourceAndMap === "function") {
			return this._sourceLike.sourceAndMap(options);
		}
		return super.sourceAndMap(options);
	}

	updateHash(hash) {
		if (typeof this._sourceLike.updateHash === "function") {
			return this._sourceLike.updateHash(hash);
		}
		if (typeof this._sourceLike.map === "function") {
			throw new Error(
				"A Source-like object with a 'map' method must also provide an 'updateHash' method"
			);
		}
		hash.update(this.buffer());
	}
}

module.exports = CompatSource;


/***/ }),

/***/ 147:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Source = __nccwpck_require__(604);
const RawSource = __nccwpck_require__(73);
const { SourceNode, SourceMapConsumer } = __nccwpck_require__(241);
const { SourceListMap, fromStringWithSourceMap } = __nccwpck_require__(524);
const { getSourceAndMap, getMap } = __nccwpck_require__(904);

const stringsAsRawSources = new WeakSet();

class ConcatSource extends Source {
	constructor() {
		super();
		this._children = [];
		for (let i = 0; i < arguments.length; i++) {
			const item = arguments[i];
			if (item instanceof ConcatSource) {
				for (const child of item._children) {
					this._children.push(child);
				}
			} else {
				this._children.push(item);
			}
		}
		this._isOptimized = arguments.length === 0;
	}

	getChildren() {
		if (!this._isOptimized) this._optimize();
		return this._children;
	}

	add(item) {
		if (item instanceof ConcatSource) {
			for (const child of item._children) {
				this._children.push(child);
			}
		} else {
			this._children.push(item);
		}
		this._isOptimized = false;
	}

	addAllSkipOptimizing(items) {
		for (const item of items) {
			this._children.push(item);
		}
	}

	buffer() {
		if (!this._isOptimized) this._optimize();
		const buffers = [];
		for (const child of this._children) {
			if (typeof child.buffer === "function") {
				buffers.push(child.buffer());
			} else {
				const bufferOrString = child.source();
				if (Buffer.isBuffer(bufferOrString)) {
					buffers.push(bufferOrString);
				} else {
					buffers.push(Buffer.from(bufferOrString, "utf-8"));
				}
			}
		}
		return Buffer.concat(buffers);
	}

	source() {
		if (!this._isOptimized) this._optimize();
		let source = "";
		for (const child of this._children) {
			source += child.source();
		}
		return source;
	}

	size() {
		if (!this._isOptimized) this._optimize();
		let size = 0;
		for (const child of this._children) {
			size += child.size();
		}
		return size;
	}

	map(options) {
		return getMap(this, options);
	}

	sourceAndMap(options) {
		return getSourceAndMap(this, options);
	}

	node(options) {
		if (!this._isOptimized) this._optimize();
		const node = new SourceNode(
			null,
			null,
			null,
			this._children.map(function (item) {
				if (typeof item.node === "function") return item.node(options);
				const sourceAndMap = item.sourceAndMap(options);
				if (sourceAndMap.map) {
					return SourceNode.fromStringWithSourceMap(
						sourceAndMap.source,
						new SourceMapConsumer(sourceAndMap.map)
					);
				} else {
					return sourceAndMap.source;
				}
			})
		);
		return node;
	}

	listMap(options) {
		if (!this._isOptimized) this._optimize();
		const map = new SourceListMap();
		for (const item of this._children) {
			if (typeof item === "string") {
				map.add(item);
			} else if (typeof item.listMap === "function") {
				map.add(item.listMap(options));
			} else {
				const sourceAndMap = item.sourceAndMap(options);
				if (sourceAndMap.map) {
					map.add(
						fromStringWithSourceMap(sourceAndMap.source, sourceAndMap.map)
					);
				} else {
					map.add(sourceAndMap.source);
				}
			}
		}
		return map;
	}

	updateHash(hash) {
		if (!this._isOptimized) this._optimize();
		hash.update("ConcatSource");
		for (const item of this._children) {
			item.updateHash(hash);
		}
	}

	_optimize() {
		const newChildren = [];
		let currentString = undefined;
		let currentRawSources = undefined;
		const addStringToRawSources = string => {
			if (currentRawSources === undefined) {
				currentRawSources = string;
			} else if (Array.isArray(currentRawSources)) {
				currentRawSources.push(string);
			} else {
				currentRawSources = [
					typeof currentRawSources === "string"
						? currentRawSources
						: currentRawSources.source(),
					string
				];
			}
		};
		const addSourceToRawSources = source => {
			if (currentRawSources === undefined) {
				currentRawSources = source;
			} else if (Array.isArray(currentRawSources)) {
				currentRawSources.push(source.source());
			} else {
				currentRawSources = [
					typeof currentRawSources === "string"
						? currentRawSources
						: currentRawSources.source(),
					source.source()
				];
			}
		};
		const mergeRawSources = () => {
			if (Array.isArray(currentRawSources)) {
				const rawSource = new RawSource(currentRawSources.join(""));
				stringsAsRawSources.add(rawSource);
				newChildren.push(rawSource);
			} else if (typeof currentRawSources === "string") {
				const rawSource = new RawSource(currentRawSources);
				stringsAsRawSources.add(rawSource);
				newChildren.push(rawSource);
			} else {
				newChildren.push(currentRawSources);
			}
		};
		for (const child of this._children) {
			if (typeof child === "string") {
				if (currentString === undefined) {
					currentString = child;
				} else {
					currentString += child;
				}
			} else {
				if (currentString !== undefined) {
					addStringToRawSources(currentString);
					currentString = undefined;
				}
				if (stringsAsRawSources.has(child)) {
					addSourceToRawSources(child);
				} else {
					if (currentRawSources !== undefined) {
						mergeRawSources();
						currentRawSources = undefined;
					}
					newChildren.push(child);
				}
			}
		}
		if (currentString !== undefined) {
			addStringToRawSources(currentString);
		}
		if (currentRawSources !== undefined) {
			mergeRawSources();
		}
		this._children = newChildren;
		this._isOptimized = true;
	}
}

module.exports = ConcatSource;


/***/ }),

/***/ 470:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Source = __nccwpck_require__(604);
const { SourceNode } = __nccwpck_require__(241);
const { SourceListMap } = __nccwpck_require__(524);
const { getSourceAndMap, getMap } = __nccwpck_require__(904);

const SPLIT_REGEX = /(?!$)[^\n\r;{}]*[\n\r;{}]*/g;

function _splitCode(code) {
	return code.match(SPLIT_REGEX) || [];
}

class OriginalSource extends Source {
	constructor(value, name) {
		super();
		const isBuffer = Buffer.isBuffer(value);
		this._value = isBuffer ? undefined : value;
		this._valueAsBuffer = isBuffer ? value : undefined;
		this._name = name;
	}

	getName() {
		return this._name;
	}

	source() {
		if (this._value === undefined) {
			this._value = this._valueAsBuffer.toString("utf-8");
		}
		return this._value;
	}

	buffer() {
		if (this._valueAsBuffer === undefined) {
			this._valueAsBuffer = Buffer.from(this._value, "utf-8");
		}
		return this._valueAsBuffer;
	}

	map(options) {
		return getMap(this, options);
	}

	sourceAndMap(options) {
		return getSourceAndMap(this, options);
	}

	node(options) {
		if (this._value === undefined) {
			this._value = this._valueAsBuffer.toString("utf-8");
		}
		const value = this._value;
		const name = this._name;
		const lines = value.split("\n");
		const node = new SourceNode(
			null,
			null,
			null,
			lines.map(function (line, idx) {
				let pos = 0;
				if (options && options.columns === false) {
					const content = line + (idx !== lines.length - 1 ? "\n" : "");
					return new SourceNode(idx + 1, 0, name, content);
				}
				return new SourceNode(
					null,
					null,
					null,
					_splitCode(line + (idx !== lines.length - 1 ? "\n" : "")).map(
						function (item) {
							if (/^\s*$/.test(item)) {
								pos += item.length;
								return item;
							}
							const res = new SourceNode(idx + 1, pos, name, item);
							pos += item.length;
							return res;
						}
					)
				);
			})
		);
		node.setSourceContent(name, value);
		return node;
	}

	listMap(options) {
		if (this._value === undefined) {
			this._value = this._valueAsBuffer.toString("utf-8");
		}
		return new SourceListMap(this._value, this._name, this._value);
	}

	updateHash(hash) {
		if (this._valueAsBuffer === undefined) {
			this._valueAsBuffer = Buffer.from(this._value, "utf-8");
		}
		hash.update("OriginalSource");
		hash.update(this._valueAsBuffer);
		hash.update(this._name || "");
	}
}

module.exports = OriginalSource;


/***/ }),

/***/ 478:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Source = __nccwpck_require__(604);
const RawSource = __nccwpck_require__(73);
const { SourceNode } = __nccwpck_require__(241);
const { getSourceAndMap, getMap } = __nccwpck_require__(904);

const REPLACE_REGEX = /\n(?=.|\s)/g;

class PrefixSource extends Source {
	constructor(prefix, source) {
		super();
		this._source =
			typeof source === "string" || Buffer.isBuffer(source)
				? new RawSource(source, true)
				: source;
		this._prefix = prefix;
	}

	getPrefix() {
		return this._prefix;
	}

	original() {
		return this._source;
	}

	source() {
		const node = this._source.source();
		const prefix = this._prefix;
		return prefix + node.replace(REPLACE_REGEX, "\n" + prefix);
	}

	// TODO efficient buffer() implementation

	map(options) {
		return getMap(this, options);
	}

	sourceAndMap(options) {
		return getSourceAndMap(this, options);
	}

	node(options) {
		const node = this._source.node(options);
		const prefix = this._prefix;
		const output = [];
		const result = new SourceNode();
		node.walkSourceContents(function (source, content) {
			result.setSourceContent(source, content);
		});
		let needPrefix = true;
		node.walk(function (chunk, mapping) {
			const parts = chunk.split(/(\n)/);
			for (let i = 0; i < parts.length; i += 2) {
				const nl = i + 1 < parts.length;
				const part = parts[i] + (nl ? "\n" : "");
				if (part) {
					if (needPrefix) {
						output.push(prefix);
					}
					output.push(
						new SourceNode(
							mapping.line,
							mapping.column,
							mapping.source,
							part,
							mapping.name
						)
					);
					needPrefix = nl;
				}
			}
		});
		result.add(output);
		return result;
	}

	listMap(options) {
		const prefix = this._prefix;
		const map = this._source.listMap(options);
		let prefixNextLine = true;
		return map.mapGeneratedCode(function (code) {
			let updatedCode = code.replace(REPLACE_REGEX, "\n" + prefix);
			if (prefixNextLine) updatedCode = prefix + updatedCode;
			prefixNextLine = code.charCodeAt(code.length - 1) === 10; // === /\n$/.test(code)
			return updatedCode;
		});
	}

	updateHash(hash) {
		hash.update("PrefixSource");
		this._source.updateHash(hash);
		hash.update(this._prefix);
	}
}

module.exports = PrefixSource;


/***/ }),

/***/ 73:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Source = __nccwpck_require__(604);
const { SourceNode } = __nccwpck_require__(241);
const { SourceListMap } = __nccwpck_require__(524);

class RawSource extends Source {
	constructor(value, convertToString = false) {
		super();
		const isBuffer = Buffer.isBuffer(value);
		if (!isBuffer && typeof value !== "string") {
			throw new TypeError("argument 'value' must be either string of Buffer");
		}
		this._valueIsBuffer = !convertToString && isBuffer;
		this._value = convertToString && isBuffer ? undefined : value;
		this._valueAsBuffer = isBuffer ? value : undefined;
	}

	isBuffer() {
		return this._valueIsBuffer;
	}

	source() {
		if (this._value === undefined) {
			this._value = this._valueAsBuffer.toString("utf-8");
		}
		return this._value;
	}

	buffer() {
		if (this._valueAsBuffer === undefined) {
			this._valueAsBuffer = Buffer.from(this._value, "utf-8");
		}
		return this._valueAsBuffer;
	}

	map(options) {
		return null;
	}

	node(options) {
		if (this._value === undefined) {
			this._value = this._valueAsBuffer.toString("utf-8");
		}
		return new SourceNode(null, null, null, this._value);
	}

	listMap(options) {
		if (this._value === undefined) {
			this._value = this._valueAsBuffer.toString("utf-8");
		}
		return new SourceListMap(this._value);
	}

	updateHash(hash) {
		if (this._valueAsBuffer === undefined) {
			this._valueAsBuffer = Buffer.from(this._value, "utf-8");
		}
		hash.update("RawSource");
		hash.update(this._valueAsBuffer);
	}
}

module.exports = RawSource;


/***/ }),

/***/ 190:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Source = __nccwpck_require__(604);
const { SourceNode } = __nccwpck_require__(241);
const { getSourceAndMap, getMap, getNode, getListMap } = __nccwpck_require__(904);

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
		this._replacements = [];
		this._isSorted = true;
	}

	getName() {
		return this._name;
	}

	getReplacements() {
		const replacements = Array.from(this._replacements);
		replacements.sort((a, b) => {
			return a.insertIndex - b.insertIndex;
		});
		return replacements;
	}

	replace(start, end, newValue, name) {
		if (typeof newValue !== "string")
			throw new Error(
				"insertion must be a string, but is a " + typeof newValue
			);
		this._replacements.push(
			new Replacement(start, end, newValue, this._replacements.length, name)
		);
		this._isSorted = false;
	}

	insert(pos, newValue, name) {
		if (typeof newValue !== "string")
			throw new Error(
				"insertion must be a string, but is a " +
					typeof newValue +
					": " +
					newValue
			);
		this._replacements.push(
			new Replacement(pos, pos - 1, newValue, this._replacements.length, name)
		);
		this._isSorted = false;
	}

	source() {
		return this._replaceString(this._source.source());
	}

	map(options) {
		if (this._replacements.length === 0) {
			return this._source.map(options);
		}
		return getMap(this, options);
	}

	sourceAndMap(options) {
		if (this._replacements.length === 0) {
			return this._source.sourceAndMap(options);
		}
		return getSourceAndMap(this, options);
	}

	original() {
		return this._source;
	}

	_sortReplacements() {
		if (this._isSorted) return;
		this._replacements.sort(function (a, b) {
			const diff1 = b.end - a.end;
			if (diff1 !== 0) return diff1;
			const diff2 = b.start - a.start;
			if (diff2 !== 0) return diff2;
			return b.insertIndex - a.insertIndex;
		});
		this._isSorted = true;
	}

	_replaceString(str) {
		if (typeof str !== "string")
			throw new Error(
				"str must be a string, but is a " + typeof str + ": " + str
			);
		this._sortReplacements();
		const result = [str];
		this._replacements.forEach(function (repl) {
			const remSource = result.pop();
			const splitted1 = this._splitString(remSource, Math.floor(repl.end + 1));
			const splitted2 = this._splitString(splitted1[0], Math.floor(repl.start));
			result.push(splitted1[1], repl.content, splitted2[0]);
		}, this);

		// write out result array in reverse order
		let resultStr = "";
		for (let i = result.length - 1; i >= 0; --i) {
			resultStr += result[i];
		}
		return resultStr;
	}

	node(options) {
		const node = getNode(this._source, options);
		if (this._replacements.length === 0) {
			return node;
		}
		this._sortReplacements();
		const replace = new ReplacementEnumerator(this._replacements);
		const output = [];
		let position = 0;
		const sources = Object.create(null);
		const sourcesInLines = Object.create(null);

		// We build a new list of SourceNodes in "output"
		// from the original mapping data

		const result = new SourceNode();

		// We need to add source contents manually
		// because "walk" will not handle it
		node.walkSourceContents(function (sourceFile, sourceContent) {
			result.setSourceContent(sourceFile, sourceContent);
			sources["$" + sourceFile] = sourceContent;
		});

		const replaceInStringNode = this._replaceInStringNode.bind(
			this,
			output,
			replace,
			function getOriginalSource(mapping) {
				const key = "$" + mapping.source;
				let lines = sourcesInLines[key];
				if (!lines) {
					const source = sources[key];
					if (!source) return null;
					lines = source.split("\n").map(function (line) {
						return line + "\n";
					});
					sourcesInLines[key] = lines;
				}
				// line is 1-based
				if (mapping.line > lines.length) return null;
				const line = lines[mapping.line - 1];
				return line.substr(mapping.column);
			}
		);

		node.walk(function (chunk, mapping) {
			position = replaceInStringNode(chunk, position, mapping);
		});

		// If any replacements occur after the end of the original file, then we append them
		// directly to the end of the output
		const remaining = replace.footer();
		if (remaining) {
			output.push(remaining);
		}

		result.add(output);

		return result;
	}

	listMap(options) {
		let map = getListMap(this._source, options);
		this._sortReplacements();
		let currentIndex = 0;
		const replacements = this._replacements;
		let idxReplacement = replacements.length - 1;
		let removeChars = 0;
		map = map.mapGeneratedCode(function (str) {
			const newCurrentIndex = currentIndex + str.length;
			if (removeChars > str.length) {
				removeChars -= str.length;
				str = "";
			} else {
				if (removeChars > 0) {
					str = str.substr(removeChars);
					currentIndex += removeChars;
					removeChars = 0;
				}
				let finalStr = "";
				while (
					idxReplacement >= 0 &&
					replacements[idxReplacement].start < newCurrentIndex
				) {
					const repl = replacements[idxReplacement];
					const start = Math.floor(repl.start);
					const end = Math.floor(repl.end + 1);
					const before = str.substr(0, Math.max(0, start - currentIndex));
					if (end <= newCurrentIndex) {
						const after = str.substr(Math.max(0, end - currentIndex));
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
		let extraCode = "";
		while (idxReplacement >= 0) {
			extraCode += replacements[idxReplacement].content;
			idxReplacement--;
		}
		if (extraCode) {
			map.add(extraCode);
		}
		return map;
	}

	_splitString(str, position) {
		return position <= 0
			? ["", str]
			: [str.substr(0, position), str.substr(position)];
	}

	_replaceInStringNode(
		output,
		replace,
		getOriginalSource,
		node,
		position,
		mapping
	) {
		let original = undefined;

		do {
			let splitPosition = replace.position - position;
			// If multiple replaces occur in the same location then the splitPosition may be
			// before the current position for the subsequent splits. Ensure it is >= 0
			if (splitPosition < 0) {
				splitPosition = 0;
			}
			if (splitPosition >= node.length || replace.done) {
				if (replace.emit) {
					const nodeEnd = new SourceNode(
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

			const originalColumn = mapping.column;

			// Try to figure out if generated code matches original code of this segement
			// If this is the case we assume that it's allowed to move mapping.column
			// Because getOriginalSource can be expensive we only do it when neccessary

			let nodePart;
			if (splitPosition > 0) {
				nodePart = node.slice(0, splitPosition);
				if (original === undefined) {
					original = getOriginalSource(mapping);
				}
				if (
					original &&
					original.length >= splitPosition &&
					original.startsWith(nodePart)
				) {
					mapping.column += splitPosition;
					original = original.substr(splitPosition);
				}
			}

			const emit = replace.next();
			if (!emit) {
				// Stop emitting when we have found the beginning of the string to replace.
				// Emit the part of the string before splitPosition
				if (splitPosition > 0) {
					const nodeStart = new SourceNode(
						mapping.line,
						originalColumn,
						mapping.source,
						nodePart,
						mapping.name
					);
					output.push(nodeStart);
				}

				// Emit the replacement value
				if (replace.value) {
					output.push(
						new SourceNode(
							mapping.line,
							mapping.column,
							mapping.source,
							replace.value,
							mapping.name || replace.name
						)
					);
				}
			}

			// Recurse with remainder of the string as there may be multiple replaces within a single node
			node = node.substr(splitPosition);
			position += splitPosition;
			// eslint-disable-next-line no-constant-condition
		} while (true);
	}

	updateHash(hash) {
		this._sortReplacements();
		hash.update("ReplaceSource");
		this._source.updateHash(hash);
		hash.update(this._name || "");
		for (const repl of this._replacements) {
			hash.update(`${repl.start}`);
			hash.update(`${repl.end}`);
			hash.update(`${repl.content}`);
			hash.update(`${repl.insertIndex}`);
			hash.update(`${repl.name}`);
		}
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
		if (this.done) return true;
		if (this.emit) {
			// Start point found. stop emitting. set position to find end
			const repl = this.replacements[this.index];
			const end = Math.floor(repl.end + 1);
			this.position = end;
			this.value = repl.content;
			this.name = repl.name;
		} else {
			// End point found. start emitting. set position to find next start
			this.index--;
			if (this.index < 0) {
				this.done = true;
			} else {
				const nextRepl = this.replacements[this.index];
				const start = Math.floor(nextRepl.start);
				this.position = start;
			}
		}
		if (this.position < 0) this.position = 0;
		this.emit = !this.emit;
		return this.emit;
	}

	footer() {
		if (!this.done && !this.emit) this.next(); // If we finished _replaceInNode mid emit we advance to next entry
		if (this.done) {
			return [];
		} else {
			let resultStr = "";
			for (let i = this.index; i >= 0; i--) {
				const repl = this.replacements[i];
				// this doesn't need to handle repl.name, because in SourceMaps generated code
				// without pointer to original source can't have a name
				resultStr += repl.content;
			}
			return resultStr;
		}
	}
}

module.exports = ReplaceSource;


/***/ }),

/***/ 646:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Source = __nccwpck_require__(604);

class SizeOnlySource extends Source {
	constructor(size) {
		super();
		this._size = size;
	}

	_error() {
		return new Error(
			"Content and Map of this Source is not available (only size() is supported)"
		);
	}

	size() {
		return this._size;
	}

	source() {
		throw this._error();
	}

	buffer() {
		throw this._error();
	}

	map(options) {
		throw this._error();
	}

	updateHash() {
		throw this._error();
	}
}

module.exports = SizeOnlySource;


/***/ }),

/***/ 604:
/***/ ((module) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


class Source {
	source() {
		throw new Error("Abstract");
	}

	buffer() {
		const source = this.source();
		if (Buffer.isBuffer(source)) return source;
		return Buffer.from(source, "utf-8");
	}

	size() {
		return this.buffer().length;
	}

	map(options) {
		return null;
	}

	sourceAndMap(options) {
		return {
			source: this.source(),
			map: this.map(options)
		};
	}

	updateHash(hash) {
		throw new Error("Abstract");
	}
}

module.exports = Source;


/***/ }),

/***/ 383:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Source = __nccwpck_require__(604);
const { SourceNode, SourceMapConsumer } = __nccwpck_require__(241);
const { SourceListMap, fromStringWithSourceMap } = __nccwpck_require__(524);
const { getSourceAndMap, getMap } = __nccwpck_require__(904);
const applySourceMap = __nccwpck_require__(776);

class SourceMapSource extends Source {
	constructor(
		value,
		name,
		sourceMap,
		originalSource,
		innerSourceMap,
		removeOriginalSource
	) {
		super();
		const valueIsBuffer = Buffer.isBuffer(value);
		this._valueAsString = valueIsBuffer ? undefined : value;
		this._valueAsBuffer = valueIsBuffer ? value : undefined;

		this._name = name;

		this._hasSourceMap = !!sourceMap;
		const sourceMapIsBuffer = Buffer.isBuffer(sourceMap);
		const sourceMapIsString = typeof sourceMap === "string";
		this._sourceMapAsObject =
			sourceMapIsBuffer || sourceMapIsString ? undefined : sourceMap;
		this._sourceMapAsString = sourceMapIsString ? sourceMap : undefined;
		this._sourceMapAsBuffer = sourceMapIsBuffer ? sourceMap : undefined;

		this._hasOriginalSource = !!originalSource;
		const originalSourceIsBuffer = Buffer.isBuffer(originalSource);
		this._originalSourceAsString = originalSourceIsBuffer
			? undefined
			: originalSource;
		this._originalSourceAsBuffer = originalSourceIsBuffer
			? originalSource
			: undefined;

		this._hasInnerSourceMap = !!innerSourceMap;
		const innerSourceMapIsBuffer = Buffer.isBuffer(innerSourceMap);
		const innerSourceMapIsString = typeof innerSourceMap === "string";
		this._innerSourceMapAsObject =
			innerSourceMapIsBuffer || innerSourceMapIsString
				? undefined
				: innerSourceMap;
		this._innerSourceMapAsString = innerSourceMapIsString
			? innerSourceMap
			: undefined;
		this._innerSourceMapAsBuffer = innerSourceMapIsBuffer
			? innerSourceMap
			: undefined;

		this._removeOriginalSource = removeOriginalSource;
	}

	_ensureValueBuffer() {
		if (this._valueAsBuffer === undefined) {
			this._valueAsBuffer = Buffer.from(this._valueAsString, "utf-8");
		}
	}

	_ensureValueString() {
		if (this._valueAsString === undefined) {
			this._valueAsString = this._valueAsBuffer.toString("utf-8");
		}
	}

	_ensureOriginalSourceBuffer() {
		if (this._originalSourceAsBuffer === undefined && this._hasOriginalSource) {
			this._originalSourceAsBuffer = Buffer.from(
				this._originalSourceAsString,
				"utf-8"
			);
		}
	}

	_ensureOriginalSourceString() {
		if (this._originalSourceAsString === undefined && this._hasOriginalSource) {
			this._originalSourceAsString = this._originalSourceAsBuffer.toString(
				"utf-8"
			);
		}
	}

	_ensureInnerSourceMapObject() {
		if (this._innerSourceMapAsObject === undefined && this._hasInnerSourceMap) {
			this._ensureInnerSourceMapString();
			this._innerSourceMapAsObject = JSON.parse(this._innerSourceMapAsString);
		}
	}

	_ensureInnerSourceMapBuffer() {
		if (this._innerSourceMapAsBuffer === undefined && this._hasInnerSourceMap) {
			this._ensureInnerSourceMapString();
			this._innerSourceMapAsBuffer = Buffer.from(
				this._innerSourceMapAsString,
				"utf-8"
			);
		}
	}

	_ensureInnerSourceMapString() {
		if (this._innerSourceMapAsString === undefined && this._hasInnerSourceMap) {
			if (this._innerSourceMapAsBuffer !== undefined) {
				this._innerSourceMapAsString = this._innerSourceMapAsBuffer.toString(
					"utf-8"
				);
			} else {
				this._innerSourceMapAsString = JSON.stringify(
					this._innerSourceMapAsObject
				);
			}
		}
	}

	_ensureSourceMapObject() {
		if (this._sourceMapAsObject === undefined) {
			this._ensureSourceMapString();
			this._sourceMapAsObject = JSON.parse(this._sourceMapAsString);
		}
	}

	_ensureSourceMapBuffer() {
		if (this._sourceMapAsBuffer === undefined) {
			this._ensureSourceMapString();
			this._sourceMapAsBuffer = Buffer.from(this._sourceMapAsString, "utf-8");
		}
	}

	_ensureSourceMapString() {
		if (this._sourceMapAsString === undefined) {
			if (this._sourceMapAsBuffer !== undefined) {
				this._sourceMapAsString = this._sourceMapAsBuffer.toString("utf-8");
			} else {
				this._sourceMapAsString = JSON.stringify(this._sourceMapAsObject);
			}
		}
	}

	getArgsAsBuffers() {
		this._ensureValueBuffer();
		this._ensureSourceMapBuffer();
		this._ensureOriginalSourceBuffer();
		this._ensureInnerSourceMapBuffer();
		return [
			this._valueAsBuffer,
			this._name,
			this._sourceMapAsBuffer,
			this._originalSourceAsBuffer,
			this._innerSourceMapAsBuffer,
			this._removeOriginalSource
		];
	}

	source() {
		this._ensureValueString();
		return this._valueAsString;
	}

	map(options) {
		if (!this._hasInnerSourceMap) {
			this._ensureSourceMapObject();
			return this._sourceMapAsObject;
		}
		return getMap(this, options);
	}

	sourceAndMap(options) {
		if (!this._hasInnerSourceMap) {
			this._ensureValueString();
			this._ensureSourceMapObject();
			return {
				source: this._valueAsString,
				map: this._sourceMapAsObject
			};
		}
		return getSourceAndMap(this, options);
	}

	node(options) {
		this._ensureValueString();
		this._ensureSourceMapObject();
		this._ensureOriginalSourceString();
		let node = SourceNode.fromStringWithSourceMap(
			this._valueAsString,
			new SourceMapConsumer(this._sourceMapAsObject)
		);
		node.setSourceContent(this._name, this._originalSourceAsString);
		if (this._hasInnerSourceMap) {
			this._ensureInnerSourceMapObject();
			node = applySourceMap(
				node,
				new SourceMapConsumer(this._innerSourceMapAsObject),
				this._name,
				this._removeOriginalSource
			);
		}
		return node;
	}

	listMap(options) {
		this._ensureValueString();
		this._ensureSourceMapObject();
		options = options || {};
		if (options.module === false)
			return new SourceListMap(
				this._valueAsString,
				this._name,
				this._valueAsString
			);

		return fromStringWithSourceMap(
			this._valueAsString,
			this._sourceMapAsObject
		);
	}

	updateHash(hash) {
		this._ensureValueBuffer();
		this._ensureSourceMapBuffer();
		this._ensureOriginalSourceBuffer();
		this._ensureInnerSourceMapBuffer();

		hash.update("SourceMapSource");

		hash.update(this._valueAsBuffer);

		hash.update(this._sourceMapAsBuffer);

		if (this._hasOriginalSource) {
			hash.update(this._originalSourceAsBuffer);
		}

		if (this._hasInnerSourceMap) {
			hash.update(this._innerSourceMapAsBuffer);
		}

		hash.update(this._removeOriginalSource ? "true" : "false");
	}
}

module.exports = SourceMapSource;


/***/ }),

/***/ 776:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/



const SourceNode = __nccwpck_require__(241).SourceNode;
const SourceMapConsumer = __nccwpck_require__(241).SourceMapConsumer;

const applySourceMap = function (
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

	const l2rResult = new SourceNode();
	const l2rOutput = [];

	const middleSourceContents = {};

	const m2rMappingsByLine = {};

	const rightSourceContentsSet = {};
	const rightSourceContentsLines = {};

	// Store all mappings by generated line
	sourceMapConsumer.eachMapping(
		function (mapping) {
			(m2rMappingsByLine[mapping.generatedLine] =
				m2rMappingsByLine[mapping.generatedLine] || []).push(mapping);
		},
		null,
		SourceMapConsumer.GENERATED_ORDER
	);

	const findM2rMapping = (line, column) => {
		const m2rMappings = m2rMappingsByLine[line];
		let l = 0;
		let r = m2rMappings.length;
		while (l < r) {
			let m = (l + r) >> 1;
			if (m2rMappings[m].generatedColumn <= column) {
				l = m + 1;
			} else {
				r = m;
			}
		}
		if (l === 0) return undefined;
		return m2rMappings[l - 1];
	};

	// Store all source contents
	sourceNode.walkSourceContents(function (source, content) {
		middleSourceContents["$" + source] = content;
	});

	const middleSource = middleSourceContents["$" + sourceFile];
	const middleSourceLines = middleSource ? middleSource.split("\n") : undefined;

	// Walk all left to middle mappings
	sourceNode.walk(function (chunk, middleMapping) {
		// Find a mapping from middle to right
		if (
			middleMapping.source === sourceFile &&
			middleMapping.line &&
			m2rMappingsByLine[middleMapping.line]
		) {
			// For minimized sources this is performance-relevant,
			// since all mappings are in a single line, use a binary search
			let m2rBestFit = findM2rMapping(middleMapping.line, middleMapping.column);
			if (m2rBestFit) {
				let allowMiddleName = false;
				let middleLine;
				let rightSourceContent;
				let rightSourceContentLines;
				const rightSource = m2rBestFit.source;
				// Check if we have middle and right source for this mapping
				// Then we could have an "identify" mapping
				if (
					middleSourceLines &&
					rightSource &&
					(middleLine = middleSourceLines[m2rBestFit.generatedLine - 1]) &&
					((rightSourceContentLines = rightSourceContentsLines[rightSource]) ||
						(rightSourceContent = sourceMapConsumer.sourceContentFor(
							rightSource,
							true
						)))
				) {
					if (!rightSourceContentLines) {
						rightSourceContentLines = rightSourceContentsLines[
							rightSource
						] = rightSourceContent.split("\n");
					}
					const rightLine =
						rightSourceContentLines[m2rBestFit.originalLine - 1];
					if (rightLine) {
						const offset = middleMapping.column - m2rBestFit.generatedColumn;
						if (offset > 0) {
							const middlePart = middleLine.slice(
								m2rBestFit.generatedColumn,
								middleMapping.column
							);
							const rightPart = rightLine.slice(
								m2rBestFit.originalColumn,
								m2rBestFit.originalColumn + offset
							);
							if (middlePart === rightPart) {
								// When original and generated code is equal we assume we have an "identity" mapping
								// In this case we can offset the original position
								m2rBestFit = Object.assign({}, m2rBestFit, {
									originalColumn: m2rBestFit.originalColumn + offset,
									generatedColumn: middleMapping.column,
									name: undefined
								});
							}
						}
						if (!m2rBestFit.name && middleMapping.name) {
							allowMiddleName =
								rightLine.slice(
									m2rBestFit.originalColumn,
									m2rBestFit.originalColumn + middleMapping.name.length
								) === middleMapping.name;
						}
					}
				}

				// Construct a left to right node from the found middle to right mapping
				let source = m2rBestFit.source;
				// Workaround for bug in source-map
				// null sources are incorrectly normalized to "."
				if (source && source !== ".") {
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
					if (!("$" + source in rightSourceContentsSet)) {
						rightSourceContentsSet["$" + source] = true;
						const sourceContent = sourceMapConsumer.sourceContentFor(
							source,
							true
						);
						if (sourceContent) {
							l2rResult.setSourceContent(source, sourceContent);
						}
					}
					return;
				}
			}
		}

		if (
			(removeGeneratedCodeForSourceFile &&
				middleMapping.source === sourceFile) ||
			!middleMapping.source
		) {
			// Construct a left to middle node with only generated code
			// Because user do not want mappings to middle sources
			// Or this chunk has no mapping
			l2rOutput.push(chunk);
			return;
		}

		// Construct a left to middle node
		const source = middleMapping.source;
		l2rOutput.push(
			new SourceNode(
				middleMapping.line,
				middleMapping.column,
				source,
				chunk,
				middleMapping.name
			)
		);
		if ("$" + source in middleSourceContents) {
			if (!("$" + source in rightSourceContentsSet)) {
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

/***/ 904:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const { SourceNode, SourceMapConsumer } = __nccwpck_require__(241);
const { SourceListMap, fromStringWithSourceMap } = __nccwpck_require__(524);

exports.getSourceAndMap = (inputSource, options) => {
	let source;
	let map;
	if (options && options.columns === false) {
		const res = inputSource.listMap(options).toStringWithSourceMap({
			file: "x"
		});
		source = res.source;
		map = res.map;
	} else {
		const res = inputSource.node(options).toStringWithSourceMap({
			file: "x"
		});
		source = res.code;
		map = res.map.toJSON();
	}
	if (!map || !map.sources || map.sources.length === 0) map = null;

	return {
		source,
		map
	};
};

exports.getMap = (source, options) => {
	let map;
	if (options && options.columns === false) {
		map = source.listMap(options).toStringWithSourceMap({
			file: "x"
		}).map;
	} else {
		map = source
			.node(options)
			.toStringWithSourceMap({
				file: "x"
			})
			.map.toJSON();
	}
	if (!map || !map.sources || map.sources.length === 0) return null;
	return map;
};

exports.getNode = (source, options) => {
	if (typeof source.node === "function") {
		return source.node(options);
	} else {
		const sourceAndMap = source.sourceAndMap(options);
		if (sourceAndMap.map) {
			return SourceNode.fromStringWithSourceMap(
				sourceAndMap.source,
				new SourceMapConsumer(sourceAndMap.map)
			);
		} else {
			return new SourceNode(null, null, null, sourceAndMap.source);
		}
	}
};

exports.getListMap = (source, options) => {
	if (typeof source.listMap === "function") {
		return source.listMap(options);
	} else {
		const sourceAndMap = source.sourceAndMap(options);
		if (sourceAndMap.map) {
			return fromStringWithSourceMap(sourceAndMap.source, sourceAndMap.map);
		} else {
			return new SourceListMap(sourceAndMap.source);
		}
	}
};


/***/ }),

/***/ 890:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

const defineExport = (name, fn) => {
	let value;
	Object.defineProperty(exports, name, {
		get: () => {
			if (fn !== undefined) {
				value = fn();
				fn = undefined;
			}
			return value;
		},
		configurable: true
	});
};

defineExport("Source", () => __nccwpck_require__(604));

defineExport("RawSource", () => __nccwpck_require__(73));
defineExport("OriginalSource", () => __nccwpck_require__(470));
defineExport("SourceMapSource", () => __nccwpck_require__(383));
defineExport("CachedSource", () => __nccwpck_require__(979));
defineExport("ConcatSource", () => __nccwpck_require__(147));
defineExport("ReplaceSource", () => __nccwpck_require__(190));
defineExport("PrefixSource", () => __nccwpck_require__(478));
defineExport("SizeOnlySource", () => __nccwpck_require__(646));
defineExport("CompatSource", () => __nccwpck_require__(32));


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
/******/ 	return __nccwpck_require__(890);
/******/ })()
;