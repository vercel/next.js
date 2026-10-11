"use strict";
exports.id = 800;
exports.ids = [800];
exports.modules = {

/***/ 800:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  Bundle: () => (/* binding */ Bundle),
  MagicString: () => (/* binding */ MagicString),
  MagicStringError: () => (/* binding */ MagicStringError),
  SourceMap: () => (/* binding */ SourceMap),
  "default": () => (/* binding */ MagicString)
});

;// CONCATENATED MODULE: ../../../../dd75/next.js-2/node_modules/.pnpm/@jridgewell+sourcemap-codec@1.6.0/node_modules/@jridgewell/sourcemap-codec/dist/sourcemap-codec.mjs
// src/vlq.ts
var comma = ",".charCodeAt(0);
var semicolon = ";".charCodeAt(0);
var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var intToChar = new Uint8Array(64);
var charToInt = new Uint8Array(128);
for (let i = 0; i < chars.length; i++) {
  const c = chars.charCodeAt(i);
  intToChar[i] = c;
  charToInt[c] = i;
}
function decodeInteger(reader) {
  let value = 0;
  let shift = 0;
  let integer = 0;
  do {
    const c = reader.next();
    integer = charToInt[c];
    value |= (integer & 31) << shift;
    shift += 5;
  } while (integer & 32);
  return value;
}
function decodeSign(num) {
  return num & 1 ? -2147483648 | -(num >>> 1) : num >>> 1;
}
function encodeInteger(builder, num) {
  do {
    let clamped = num & 31;
    num >>>= 5;
    if (num > 0) clamped |= 32;
    builder.write(intToChar[clamped]);
  } while (num > 0);
}
function encodeSign(num) {
  return num < 0 ? -num << 1 | 1 : num << 1;
}
function hasMoreVlq(reader, max) {
  if (reader.pos >= max) return false;
  return reader.peek() !== comma;
}

// src/strings.ts
var bufLength = 1024 * 16;
var td = typeof TextDecoder !== "undefined" ? /* @__PURE__ */ new TextDecoder() : typeof Buffer !== "undefined" ? {
  decode(buf) {
    const out = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
    return out.toString();
  }
} : {
  decode(buf) {
    let out = "";
    for (let i = 0; i < buf.length; i++) {
      out += String.fromCharCode(buf[i]);
    }
    return out;
  }
};
var StringWriter = class {
  constructor() {
    this.pos = 0;
    this.out = "";
    this.buffer = new Uint8Array(bufLength);
  }
  write(v) {
    const { buffer } = this;
    buffer[this.pos++] = v;
    if (this.pos === bufLength) {
      this.out += td.decode(buffer);
      this.pos = 0;
    }
  }
  flush() {
    const { buffer, out, pos } = this;
    return pos > 0 ? out + td.decode(buffer.subarray(0, pos)) : out;
  }
};
var StringReader = class {
  constructor(buffer) {
    this.pos = 0;
    this.buffer = buffer;
  }
  next() {
    return this.buffer.charCodeAt(this.pos++);
  }
  peek() {
    return this.buffer.charCodeAt(this.pos);
  }
  indexOf(char) {
    const { buffer, pos } = this;
    const idx = buffer.indexOf(char, pos);
    return idx === -1 ? buffer.length : idx;
  }
};

// src/scopes.ts
var EMPTY = (/* unused pure expression or super */ null && ([]));
function decodeOriginalScopes(input) {
  const { length } = input;
  const reader = new StringReader(input);
  const scopes = [];
  const stack = [];
  let line = 0;
  for (; reader.pos < length; reader.pos++) {
    line += decodeSign(decodeInteger(reader));
    const column = decodeSign(decodeInteger(reader));
    if (!hasMoreVlq(reader, length)) {
      const last = stack.pop();
      last[2] = line;
      last[3] = column;
      continue;
    }
    const kind = decodeSign(decodeInteger(reader));
    const fields = decodeSign(decodeInteger(reader));
    const hasName = fields & 1;
    const scope = hasName ? [line, column, 0, 0, kind, decodeSign(decodeInteger(reader))] : [line, column, 0, 0, kind];
    let vars = EMPTY;
    if (hasMoreVlq(reader, length)) {
      vars = [];
      do {
        const varsIndex = decodeSign(decodeInteger(reader));
        vars.push(varsIndex);
      } while (hasMoreVlq(reader, length));
    }
    scope.vars = vars;
    scopes.push(scope);
    stack.push(scope);
  }
  return scopes;
}
function encodeOriginalScopes(scopes) {
  const writer = new StringWriter();
  for (let i = 0; i < scopes.length; ) {
    i = _encodeOriginalScopes(scopes, i, writer, [0]);
  }
  return writer.flush();
}
function _encodeOriginalScopes(scopes, index, writer, state) {
  const scope = scopes[index];
  const { 0: startLine, 1: startColumn, 2: endLine, 3: endColumn, 4: kind, vars } = scope;
  if (index > 0) writer.write(comma);
  encodeInteger(writer, encodeSign(startLine - state[0]));
  state[0] = startLine;
  encodeInteger(writer, encodeSign(startColumn));
  encodeInteger(writer, encodeSign(kind));
  const fields = scope.length === 6 ? 1 : 0;
  encodeInteger(writer, encodeSign(fields));
  if (scope.length === 6) encodeInteger(writer, encodeSign(scope[5]));
  for (const v of vars) {
    encodeInteger(writer, encodeSign(v));
  }
  for (index++; index < scopes.length; ) {
    const next = scopes[index];
    const { 0: l, 1: c } = next;
    if (l > endLine || l === endLine && c >= endColumn) {
      break;
    }
    index = _encodeOriginalScopes(scopes, index, writer, state);
  }
  writer.write(comma);
  encodeInteger(writer, encodeSign(endLine - state[0]));
  state[0] = endLine;
  encodeInteger(writer, encodeSign(endColumn));
  return index;
}
function decodeGeneratedRanges(input) {
  const { length } = input;
  const reader = new StringReader(input);
  const ranges = [];
  const stack = [];
  let genLine = 0;
  let definitionSourcesIndex = 0;
  let definitionScopeIndex = 0;
  let callsiteSourcesIndex = 0;
  let callsiteLine = 0;
  let callsiteColumn = 0;
  let bindingLine = 0;
  let bindingColumn = 0;
  do {
    const semi = reader.indexOf(";");
    let genColumn = 0;
    for (; reader.pos < semi; reader.pos++) {
      genColumn += decodeSign(decodeInteger(reader));
      if (!hasMoreVlq(reader, semi)) {
        const last = stack.pop();
        last[2] = genLine;
        last[3] = genColumn;
        continue;
      }
      const fields = decodeSign(decodeInteger(reader));
      const hasDefinition = fields & 1;
      const hasCallsite = fields & 2;
      const hasScope = fields & 4;
      let callsite = null;
      let bindings = EMPTY;
      let range;
      if (hasDefinition) {
        const defSourcesIndex = definitionSourcesIndex + decodeSign(decodeInteger(reader));
        definitionScopeIndex = decodeSign(decodeInteger(reader)) + (definitionSourcesIndex === defSourcesIndex ? definitionScopeIndex : 0);
        definitionSourcesIndex = defSourcesIndex;
        range = [genLine, genColumn, 0, 0, defSourcesIndex, definitionScopeIndex];
      } else {
        range = [genLine, genColumn, 0, 0];
      }
      range.isScope = !!hasScope;
      if (hasCallsite) {
        const prevCsi = callsiteSourcesIndex;
        const prevLine = callsiteLine;
        callsiteSourcesIndex += decodeSign(decodeInteger(reader));
        const sameSource = prevCsi === callsiteSourcesIndex;
        callsiteLine = (sameSource ? callsiteLine : 0) + decodeSign(decodeInteger(reader));
        callsiteColumn = (sameSource && prevLine === callsiteLine ? callsiteColumn : 0) + decodeSign(decodeInteger(reader));
        callsite = [callsiteSourcesIndex, callsiteLine, callsiteColumn];
      }
      range.callsite = callsite;
      if (hasMoreVlq(reader, semi)) {
        bindings = [];
        do {
          bindingLine = genLine;
          bindingColumn = genColumn;
          const expressionsCount = decodeSign(decodeInteger(reader));
          let expressionRanges;
          if (expressionsCount < -1) {
            expressionRanges = [[decodeSign(decodeInteger(reader))]];
            for (let i = -1; i > expressionsCount; i--) {
              const prevBl = bindingLine;
              bindingLine += decodeSign(decodeInteger(reader));
              bindingColumn = (bindingLine === prevBl ? bindingColumn : 0) + decodeSign(decodeInteger(reader));
              const expression = decodeSign(decodeInteger(reader));
              expressionRanges.push([expression, bindingLine, bindingColumn]);
            }
          } else {
            expressionRanges = [[expressionsCount]];
          }
          bindings.push(expressionRanges);
        } while (hasMoreVlq(reader, semi));
      }
      range.bindings = bindings;
      ranges.push(range);
      stack.push(range);
    }
    genLine++;
    reader.pos = semi + 1;
  } while (reader.pos < length);
  return ranges;
}
function encodeGeneratedRanges(ranges) {
  if (ranges.length === 0) return "";
  const writer = new StringWriter();
  for (let i = 0; i < ranges.length; ) {
    i = _encodeGeneratedRanges(ranges, i, writer, [0, 0, 0, 0, 0, 0, 0]);
  }
  return writer.flush();
}
function _encodeGeneratedRanges(ranges, index, writer, state) {
  const range = ranges[index];
  const {
    0: startLine,
    1: startColumn,
    2: endLine,
    3: endColumn,
    isScope,
    callsite,
    bindings
  } = range;
  if (state[0] < startLine) {
    catchupLine(writer, state[0], startLine);
    state[0] = startLine;
    state[1] = 0;
  } else if (index > 0) {
    writer.write(comma);
  }
  encodeInteger(writer, encodeSign(range[1] - state[1]));
  state[1] = range[1];
  const fields = (range.length === 6 ? 1 : 0) | (callsite ? 2 : 0) | (isScope ? 4 : 0);
  encodeInteger(writer, encodeSign(fields));
  if (range.length === 6) {
    const { 4: sourcesIndex, 5: scopesIndex } = range;
    if (sourcesIndex !== state[2]) {
      state[3] = 0;
    }
    encodeInteger(writer, encodeSign(sourcesIndex - state[2]));
    state[2] = sourcesIndex;
    encodeInteger(writer, encodeSign(scopesIndex - state[3]));
    state[3] = scopesIndex;
  }
  if (callsite) {
    const { 0: sourcesIndex, 1: callLine, 2: callColumn } = range.callsite;
    if (sourcesIndex !== state[4]) {
      state[5] = 0;
      state[6] = 0;
    } else if (callLine !== state[5]) {
      state[6] = 0;
    }
    encodeInteger(writer, encodeSign(sourcesIndex - state[4]));
    state[4] = sourcesIndex;
    encodeInteger(writer, encodeSign(callLine - state[5]));
    state[5] = callLine;
    encodeInteger(writer, encodeSign(callColumn - state[6]));
    state[6] = callColumn;
  }
  if (bindings) {
    for (const binding of bindings) {
      if (binding.length > 1) encodeInteger(writer, encodeSign(-binding.length));
      const expression = binding[0][0];
      encodeInteger(writer, encodeSign(expression));
      let bindingStartLine = startLine;
      let bindingStartColumn = startColumn;
      for (let i = 1; i < binding.length; i++) {
        const expRange = binding[i];
        encodeInteger(writer, encodeSign(expRange[1] - bindingStartLine));
        bindingStartLine = expRange[1];
        encodeInteger(writer, encodeSign(expRange[2] - bindingStartColumn));
        bindingStartColumn = expRange[2];
        encodeInteger(writer, encodeSign(expRange[0]));
      }
    }
  }
  for (index++; index < ranges.length; ) {
    const next = ranges[index];
    const { 0: l, 1: c } = next;
    if (l > endLine || l === endLine && c >= endColumn) {
      break;
    }
    index = _encodeGeneratedRanges(ranges, index, writer, state);
  }
  if (state[0] < endLine) {
    catchupLine(writer, state[0], endLine);
    state[0] = endLine;
    state[1] = 0;
  } else {
    writer.write(comma);
  }
  encodeInteger(writer, encodeSign(endColumn - state[1]));
  state[1] = endColumn;
  return index;
}
function catchupLine(writer, lastLine, line) {
  do {
    writer.write(semicolon);
  } while (++lastLine < line);
}

// src/range-mappings.ts
function decodeRangeMappings(input) {
  const { length } = input;
  const reader = new StringReader(input);
  const rangeMappings = [];
  do {
    const semi = reader.indexOf(";");
    const indices = [];
    let index = 0;
    while (reader.pos < semi) {
      index += decodeInteger(reader);
      indices.push(index);
    }
    rangeMappings.push(indices);
    reader.pos = semi + 1;
  } while (reader.pos <= length);
  return rangeMappings;
}
function encodeRangeMappings(decoded) {
  if (decoded.length === 0) return "";
  const writer = new StringWriter();
  for (let i = 0; i < decoded.length; i++) {
    const indices = decoded[i];
    if (i > 0) writer.write(semicolon);
    let index = 0;
    for (let j = 0; j < indices.length; j++) {
      const offset = indices[j];
      encodeInteger(writer, offset - index);
      index = offset;
    }
  }
  return writer.flush();
}

// src/sourcemap-codec.ts
function decode(mappings) {
  const { length } = mappings;
  const reader = new StringReader(mappings);
  const decoded = [];
  let genColumn = 0;
  let sourcesIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  let namesIndex = 0;
  do {
    const semi = reader.indexOf(";");
    const line = [];
    let sorted = true;
    let lastCol = 0;
    genColumn = 0;
    while (reader.pos < semi) {
      let seg;
      genColumn += decodeSign(decodeInteger(reader));
      if (genColumn < lastCol) sorted = false;
      lastCol = genColumn;
      if (hasMoreVlq(reader, semi)) {
        sourcesIndex += decodeSign(decodeInteger(reader));
        sourceLine += decodeSign(decodeInteger(reader));
        sourceColumn += decodeSign(decodeInteger(reader));
        if (hasMoreVlq(reader, semi)) {
          namesIndex += decodeSign(decodeInteger(reader));
          seg = [genColumn, sourcesIndex, sourceLine, sourceColumn, namesIndex];
        } else {
          seg = [genColumn, sourcesIndex, sourceLine, sourceColumn];
        }
      } else {
        seg = [genColumn];
      }
      line.push(seg);
      reader.pos++;
    }
    if (!sorted) sort(line);
    decoded.push(line);
    reader.pos = semi + 1;
  } while (reader.pos <= length);
  return decoded;
}
function sort(line) {
  line.sort(sortComparator);
}
function sortComparator(a, b) {
  return a[0] - b[0];
}
function encode(decoded) {
  const writer = new StringWriter();
  let sourcesIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  let namesIndex = 0;
  for (let i = 0; i < decoded.length; i++) {
    const line = decoded[i];
    if (i > 0) writer.write(semicolon);
    if (line.length === 0) continue;
    let genColumn = 0;
    for (let j = 0; j < line.length; j++) {
      const segment = line[j];
      if (j > 0) writer.write(comma);
      encodeInteger(writer, encodeSign(segment[0] - genColumn));
      genColumn = segment[0];
      if (segment.length === 1) continue;
      encodeInteger(writer, encodeSign(segment[1] - sourcesIndex));
      encodeInteger(writer, encodeSign(segment[2] - sourceLine));
      encodeInteger(writer, encodeSign(segment[3] - sourceColumn));
      sourcesIndex = segment[1];
      sourceLine = segment[2];
      sourceColumn = segment[3];
      if (segment.length === 4) continue;
      encodeInteger(writer, encodeSign(segment[4] - namesIndex));
      namesIndex = segment[4];
    }
  }
  return writer.flush();
}

//# sourceMappingURL=sourcemap-codec.mjs.map

;// CONCATENATED MODULE: ../../../../dd75/next.js-2/node_modules/.pnpm/magic-string@1.3.1/node_modules/magic-string/dist/index.mjs

//#region src/BitSet.ts
var BitSet = class BitSet {
	constructor(arg) {
		this.bits = arg instanceof BitSet ? arg.bits.slice() : [];
	}
	add(n) {
		this.bits[n >> 5] |= 1 << (n & 31);
	}
	has(n) {
		return !!(this.bits[n >> 5] & 1 << (n & 31));
	}
};
//#endregion
//#region src/Chunk.ts
var Chunk = class Chunk {
	constructor(start, end, content) {
		this.start = start;
		this.end = end;
		this.original = content;
		this.intro = "";
		this.outro = "";
		this.content = content;
		this.storeName = false;
		this.edited = false;
		this.previous = null;
		this.next = null;
	}
	appendLeft(content) {
		this.outro += content;
	}
	appendRight(content) {
		this.intro = this.intro + content;
	}
	clone() {
		const chunk = new Chunk(this.start, this.end, this.original);
		chunk.intro = this.intro;
		chunk.outro = this.outro;
		chunk.content = this.content;
		chunk.storeName = this.storeName;
		chunk.edited = this.edited;
		return chunk;
	}
	contains(index) {
		return this.start < index && index < this.end;
	}
	eachNext(fn) {
		fn(this);
		let chunk = this.next;
		while (chunk) {
			fn(chunk);
			chunk = chunk.next;
		}
	}
	eachPrevious(fn) {
		fn(this);
		let chunk = this.previous;
		while (chunk) {
			fn(chunk);
			chunk = chunk.previous;
		}
	}
	edit(content, storeName, contentOnly) {
		this.content = content;
		if (!contentOnly) {
			this.intro = "";
			this.outro = "";
		}
		this.storeName = storeName;
		this.edited = true;
		return this;
	}
	prependLeft(content) {
		this.outro = content + this.outro;
	}
	prependRight(content) {
		this.intro = content + this.intro;
	}
	reset() {
		this.intro = "";
		this.outro = "";
		if (this.edited) {
			this.content = this.original;
			this.storeName = false;
			this.edited = false;
		}
	}
	split(index) {
		const sliceIndex = index - this.start;
		const originalBefore = this.original.slice(0, sliceIndex);
		const originalAfter = this.original.slice(sliceIndex);
		this.original = originalBefore;
		const newChunk = new Chunk(index, this.end, originalAfter);
		newChunk.outro = this.outro;
		this.outro = "";
		this.end = index;
		if (this.edited) {
			newChunk.edit("", false);
			this.content = "";
		} else this.content = originalBefore;
		newChunk.next = this.next;
		if (newChunk.next) newChunk.next.previous = newChunk;
		newChunk.previous = this;
		this.next = newChunk;
		return newChunk;
	}
	toString() {
		return this.intro + this.content + this.outro;
	}
	trimEnd(rx) {
		this.outro = this.outro.replace(rx, "");
		if (this.outro.length) return true;
		const trimmed = this.content.replace(rx, "");
		if (trimmed.length) {
			if (trimmed !== this.content) {
				if (this.edited) this.edit(trimmed, this.storeName, true);
				else this.split(this.start + trimmed.length).edit("", void 0, true);
			}
			return true;
		} else {
			this.edit("", void 0, true);
			this.intro = this.intro.replace(rx, "");
			if (this.intro.length) return true;
		}
	}
	trimStart(rx) {
		this.intro = this.intro.replace(rx, "");
		if (this.intro.length) return true;
		const trimmed = this.content.replace(rx, "");
		if (trimmed.length) {
			if (trimmed !== this.content) {
				if (this.edited) this.edit(trimmed, this.storeName, true);
				else {
					this.split(this.end - trimmed.length);
					this.edit("", void 0, true);
				}
			}
			return true;
		} else {
			this.edit("", void 0, true);
			this.outro = this.outro.replace(rx, "");
			if (this.outro.length) return true;
		}
	}
};
//#endregion
//#region src/MagicStringError.ts
/**
* The single error type thrown by MagicString.
*
* Every message is prefixed with `[MagicString]` so its source is obvious at a
* glance, and is kept short and consistent in tone.
*/
var MagicStringError = class extends Error {
	name = "MagicStringError";
	constructor(message, options) {
		super(`[MagicString] ${message}`, options);
	}
};
//#endregion
//#region src/SourceMap.ts
function getBtoa() {
	/* v8 ignore next -- environment fallback, unreachable when `btoa` is present */
	if (typeof globalThis !== "undefined" && typeof globalThis.btoa === "function") return (str) => globalThis.btoa(unescape(encodeURIComponent(str)));
	const buffer = globalThis["Buffer"];
	if (buffer) return (str) => buffer.from(str, "utf-8").toString("base64");
	return () => {
		throw new MagicStringError("unsupported environment: `btoa` or `Buffer` is required");
	};
	/* v8 ignore stop */
}
const btoa = /* #__PURE__ */ getBtoa();
var SourceMap = class {
	constructor(properties) {
		this.version = 3;
		this.file = properties.file;
		this.sources = properties.sources;
		this.sourcesContent = properties.sourcesContent;
		this.names = properties.names;
		this.mappings = encode(properties.mappings);
		if (typeof properties.x_google_ignoreList !== "undefined") this.x_google_ignoreList = properties.x_google_ignoreList;
		if (typeof properties.debugId !== "undefined") this.debugId = properties.debugId;
		if (typeof properties.rangeMappings !== "undefined") {
			let shouldOutputRangeMapping = false;
			for (const line of properties.rangeMappings) if (line.length !== 0) {
				shouldOutputRangeMapping = true;
				break;
			}
			if (shouldOutputRangeMapping) this.rangeMappings = encodeRangeMappings(properties.rangeMappings);
		}
	}
	/**
	* Returns the equivalent of `JSON.stringify(map)`
	*/
	toString() {
		return JSON.stringify(this);
	}
	/**
	* Returns a DataURI containing the sourcemap. Useful for doing this sort of thing:
	* `generateMap(options?: SourceMapOptions): SourceMap;`
	*/
	toUrl() {
		return `data:application/json;charset=utf-8;base64,${btoa(this.toString())}`;
	}
};
//#endregion
//#region src/utils/getLocator.ts
function getLocator(source) {
	const lineOffsets = [0];
	for (let i = source.indexOf("\n"); i !== -1; i = source.indexOf("\n", i + 1)) lineOffsets.push(i + 1);
	return function locate(index) {
		let i = 0;
		let j = lineOffsets.length;
		while (i < j) {
			const m = i + j >> 1;
			if (index < lineOffsets[m]) j = m;
			else i = m + 1;
		}
		const line = i - 1;
		return {
			line,
			column: index - lineOffsets[line]
		};
	};
}
//#endregion
//#region src/utils/getRelativePath.ts
function getRelativePath(from, to) {
	const fromParts = from.split(/[/\\]/);
	const toParts = to.split(/[/\\]/);
	fromParts.pop();
	while (fromParts[0] === toParts[0]) {
		fromParts.shift();
		toParts.shift();
	}
	if (fromParts.length) {
		let i = fromParts.length;
		while (i--) fromParts[i] = "..";
	}
	return fromParts.concat(toParts).join("/");
}
//#endregion
//#region src/utils/guessIndent.ts
function guessIndent(code) {
	const lines = code.split("\n");
	const tabbed = lines.filter((line) => /^\t+/.test(line));
	const spaced = lines.filter((line) => /^ {2,}/.test(line));
	if (tabbed.length === 0 && spaced.length === 0) return null;
	if (tabbed.length >= spaced.length) return "	";
	const min = spaced.reduce((previous, current) => {
		const numSpaces = /^ +/.exec(current)[0].length;
		return Math.min(numSpaces, previous);
	}, Infinity);
	return " ".repeat(min);
}
//#endregion
//#region src/utils/isObject.ts
const dist_toString = Object.prototype.toString;
function isObject(thing) {
	return dist_toString.call(thing) === "[object Object]";
}
//#endregion
//#region src/utils/Mappings.ts
const NEWLINE_CHAR$1 = 10;
function isWordCode(code) {
	return code >= 97 && code <= 122 || code >= 65 && code <= 90 || code >= 48 && code <= 57 || code === 95;
}
var Mappings = class {
	constructor(hires) {
		this.hires = hires;
		this.generatedCodeLine = 0;
		this.generatedCodeColumn = 0;
		this.raw = [];
		this.rawSegments = this.raw[this.generatedCodeLine] = [];
		this.rawRangeMappings = [];
		this.rawRangeMappingsIndices = this.rawRangeMappings[this.generatedCodeLine] = [];
		this.pending = null;
	}
	addEdit(sourceIndex, content, loc, nameIndex) {
		/* v8 ignore else -- `pending` is never assigned a truthy value */
		if (content.length) {
			const contentLengthMinusOne = content.length - 1;
			let contentLineEnd = content.indexOf("\n", 0);
			let previousContentLineEnd = -1;
			while (contentLineEnd >= 0 && contentLengthMinusOne > contentLineEnd) {
				const segment = [
					this.generatedCodeColumn,
					sourceIndex,
					loc.line,
					loc.column
				];
				if (nameIndex >= 0) segment.push(nameIndex);
				this.rawSegments.push(segment);
				this.generatedCodeLine += 1;
				this.raw[this.generatedCodeLine] = this.rawSegments = [];
				this.rawRangeMappings[this.generatedCodeLine] = this.rawRangeMappingsIndices = [];
				this.generatedCodeColumn = 0;
				previousContentLineEnd = contentLineEnd;
				contentLineEnd = content.indexOf("\n", contentLineEnd + 1);
			}
			const segment = [
				this.generatedCodeColumn,
				sourceIndex,
				loc.line,
				loc.column
			];
			if (nameIndex >= 0) segment.push(nameIndex);
			this.rawSegments.push(segment);
			this.advance(content.slice(previousContentLineEnd + 1));
		} else if (this.pending) {
			this.rawSegments.push(this.pending);
			this.advance(content);
		}
		this.pending = null;
	}
	addUneditedChunk(sourceIndex, chunk, original, loc, sourcemapLocations) {
		const end = chunk.end;
		let i = chunk.start;
		if (this.hires) {
			const boundary = this.hires === "boundary";
			const experimentalRange = this.hires === "experimental-range";
			let charInHiresBoundary = false;
			while (i < end) {
				if (experimentalRange && i + 1 >= end) this.rawSegments.push([
					this.generatedCodeColumn,
					sourceIndex,
					loc.line,
					loc.column
				]);
				const code = original.charCodeAt(i);
				if (code === NEWLINE_CHAR$1) {
					loc.line += 1;
					loc.column = 0;
					this.generatedCodeLine += 1;
					this.raw[this.generatedCodeLine] = this.rawSegments = [];
					this.rawRangeMappings[this.generatedCodeLine] = this.rawRangeMappingsIndices = [];
					this.generatedCodeColumn = 0;
					charInHiresBoundary = false;
				} else {
					if (boundary) {
						if (isWordCode(code)) {
							if (!charInHiresBoundary) {
								this.rawSegments.push([
									this.generatedCodeColumn,
									sourceIndex,
									loc.line,
									loc.column
								]);
								charInHiresBoundary = true;
							}
						} else {
							this.rawSegments.push([
								this.generatedCodeColumn,
								sourceIndex,
								loc.line,
								loc.column
							]);
							charInHiresBoundary = false;
						}
					} else if (experimentalRange) {
						if (i === chunk.start) {
							this.rawRangeMappingsIndices.push(this.rawSegments.length);
							this.rawSegments.push([
								this.generatedCodeColumn,
								sourceIndex,
								loc.line,
								loc.column
							]);
						}
					} else this.rawSegments.push([
						this.generatedCodeColumn,
						sourceIndex,
						loc.line,
						loc.column
					]);
					loc.column += 1;
					this.generatedCodeColumn += 1;
				}
				i += 1;
			}
		} else {
			const bits = sourcemapLocations.bits;
			while (i < end) {
				let newline = original.indexOf("\n", i);
				if (newline === -1 || newline > end) newline = end;
				if (newline > i) {
					this.rawSegments.push([
						this.generatedCodeColumn,
						sourceIndex,
						loc.line,
						loc.column
					]);
					for (let w = i + 1 >> 5, last = newline - 1 >> 5; w <= last; w++) {
						let word = bits[w];
						if (!word) continue;
						const base = w << 5;
						while (word) {
							const lowest = word & -word;
							const index = base + 31 - Math.clz32(lowest);
							if (index > i && index < newline) {
								const offset = index - i;
								this.rawSegments.push([
									this.generatedCodeColumn + offset,
									sourceIndex,
									loc.line,
									loc.column + offset
								]);
							}
							word ^= lowest;
						}
					}
					loc.column += newline - i;
					this.generatedCodeColumn += newline - i;
				}
				if (newline === end) break;
				loc.line += 1;
				loc.column = 0;
				this.generatedCodeLine += 1;
				this.raw[this.generatedCodeLine] = this.rawSegments = [];
				this.rawRangeMappings[this.generatedCodeLine] = this.rawRangeMappingsIndices = [];
				this.generatedCodeColumn = 0;
				i = newline + 1;
			}
		}
		this.pending = null;
	}
	advance(str) {
		if (!str) return;
		const lastNewline = str.lastIndexOf("\n");
		if (lastNewline !== -1) {
			for (let i = str.indexOf("\n"); i !== -1; i = str.indexOf("\n", i + 1)) {
				this.generatedCodeLine++;
				this.raw[this.generatedCodeLine] = this.rawSegments = [];
				this.rawRangeMappings[this.generatedCodeLine] = this.rawRangeMappingsIndices = [];
			}
			this.generatedCodeColumn = 0;
		}
		this.generatedCodeColumn += str.length - lastNewline - 1;
	}
};
//#endregion
//#region src/MagicString.ts
const n = "\n";
const NEWLINE_CHAR = "\n".charCodeAt(0);
const CR_CHAR = "\r".charCodeAt(0);
const warned = {
	insertLeft: false,
	insertRight: false,
	storeName: false
};
/**
* Expands the `$` substitution patterns that `String.prototype.replace` accepts
* in a string replacement.
* https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_a_parameter
*
* `captures` holds the capture groups in order, so `captures[0]` is `$1`.
* `namedCaptures` is `undefined` when the pattern has no named groups, and
* `$<name>` is then literal text - which is also the case for a string search
* value, where there are no groups of either kind.
*/
function expandReplacement(replacement, matched, position, str, captures, namedCaptures) {
	if (!replacement.includes("$")) return replacement;
	let result = "";
	let index = 0;
	while (index < replacement.length) {
		const dollar = replacement.indexOf("$", index);
		if (dollar === -1) {
			result += replacement.slice(index);
			break;
		}
		result += replacement.slice(index, dollar);
		const char = replacement[dollar + 1];
		let expansion = "$";
		let consumed = 1;
		if (char === "$") consumed = 2;
		else if (char === "&") {
			expansion = matched;
			consumed = 2;
		} else if (char === "`") {
			expansion = str.slice(0, position);
			consumed = 2;
		} else if (char === "'") {
			expansion = str.slice(position + matched.length);
			consumed = 2;
		} else if (char === "<" && namedCaptures !== void 0) {
			const close = replacement.indexOf(">", dollar + 2);
			if (close !== -1) {
				expansion = namedCaptures[replacement.slice(dollar + 2, close)] ?? "";
				consumed = close + 1 - dollar;
			}
		} else if (char >= "0" && char <= "9") {
			const second = replacement[dollar + 2];
			const double = second >= "0" && second <= "9" ? Number(char + second) : NaN;
			const single = Number(char);
			if (double >= 1 && double <= captures.length) {
				expansion = captures[double - 1] ?? "";
				consumed = 3;
			} else if (single >= 1 && single <= captures.length) {
				expansion = captures[single - 1] ?? "";
				consumed = 2;
			}
		}
		result += expansion;
		index = dollar + consumed;
	}
	return result;
}
var MagicString = class MagicString {
	constructor(string, options = {}) {
		const chunk = new Chunk(0, string.length, string);
		Object.defineProperties(this, {
			original: {
				writable: true,
				value: string
			},
			outro: {
				writable: true,
				value: ""
			},
			intro: {
				writable: true,
				value: ""
			},
			firstChunk: {
				writable: true,
				value: chunk
			},
			lastChunk: {
				writable: true,
				value: chunk
			},
			lastSearchedChunk: {
				writable: true,
				value: chunk
			},
			byStart: {
				writable: true,
				value: /* @__PURE__ */ new Map([[0, chunk]])
			},
			byEnd: {
				writable: true,
				value: /* @__PURE__ */ new Map([[string.length, chunk]])
			},
			filename: {
				writable: true,
				value: options.filename
			},
			indentExclusionRanges: {
				writable: true,
				value: options.indentExclusionRanges
			},
			sourcemapLocations: {
				writable: true,
				value: new BitSet()
			},
			storedNames: {
				writable: true,
				value: {}
			},
			indentStr: {
				writable: true,
				value: void 0
			},
			ignoreList: {
				writable: true,
				value: options.ignoreList
			},
			offset: {
				writable: true,
				value: options.offset || 0
			},
			hasMovedChunks: {
				writable: true,
				value: false
			}
		});
	}
	/**
	* Adds the specified character index (with respect to the original string) to sourcemap mappings, if `hires` is false.
	*/
	addSourcemapLocation(char) {
		this.sourcemapLocations.add(char);
	}
	/**
	* Appends the specified content to the end of the string.
	*/
	append(content) {
		if (typeof content !== "string") throw new MagicStringError(`content must be a string, got ${typeof content}`);
		this.outro += content;
		return this;
	}
	/**
	* Appends the specified content at the index in the original string.
	* If a range *ending* with index is subsequently moved, the insert will be moved with it.
	* See also `s.prependLeft(...)`.
	*/
	appendLeft(index, content) {
		index = index + this.offset;
		if (typeof content !== "string") throw new MagicStringError(`content must be a string, got ${typeof content}`);
		this._split(index);
		const chunk = this.byEnd.get(index);
		if (chunk) chunk.appendLeft(content);
		else this.intro += content;
		return this;
	}
	/**
	* Appends the specified content at the index in the original string.
	* If a range *starting* with index is subsequently moved, the insert will be moved with it.
	* See also `s.prependRight(...)`.
	*/
	appendRight(index, content) {
		index = index + this.offset;
		if (typeof content !== "string") throw new MagicStringError(`content must be a string, got ${typeof content}`);
		this._split(index);
		const chunk = this.byStart.get(index);
		if (chunk) chunk.appendRight(content);
		else this.outro += content;
		return this;
	}
	/**
	* Does what you'd expect.
	*/
	clone() {
		const cloned = new MagicString(this.original, {
			filename: this.filename,
			ignoreList: this.ignoreList,
			offset: this.offset
		});
		let originalChunk = this.firstChunk;
		let clonedChunk = cloned.firstChunk = cloned.lastSearchedChunk = originalChunk.clone();
		while (originalChunk) {
			cloned.byStart.set(clonedChunk.start, clonedChunk);
			cloned.byEnd.set(clonedChunk.end, clonedChunk);
			const nextOriginalChunk = originalChunk.next;
			const nextClonedChunk = nextOriginalChunk && nextOriginalChunk.clone();
			if (nextClonedChunk) {
				clonedChunk.next = nextClonedChunk;
				nextClonedChunk.previous = clonedChunk;
				clonedChunk = nextClonedChunk;
			}
			originalChunk = nextOriginalChunk;
		}
		cloned.lastChunk = clonedChunk;
		if (this.indentExclusionRanges) cloned.indentExclusionRanges = this.indentExclusionRanges.slice();
		cloned.sourcemapLocations = new BitSet(this.sourcemapLocations);
		cloned.storedNames = { ...this.storedNames };
		cloned.intro = this.intro;
		cloned.outro = this.outro;
		cloned.hasMovedChunks = this.hasMovedChunks;
		return cloned;
	}
	/**
	* Generates a sourcemap object with raw mappings in array form, rather than encoded as a string.
	* Useful if you need to manipulate the sourcemap further, but most of the time you will use `generateMap` instead.
	*/
	generateDecodedMap(options) {
		options = options || {};
		const sourceIndex = 0;
		const names = Object.keys(this.storedNames);
		const mappings = new Mappings(options.hires);
		const locate = getLocator(this.original);
		if (this.intro) mappings.advance(this.intro);
		this.firstChunk.eachNext((chunk) => {
			const loc = locate(chunk.start);
			if (chunk.intro.length) mappings.advance(chunk.intro);
			if (chunk.edited) mappings.addEdit(sourceIndex, chunk.content, loc, chunk.storeName ? names.indexOf(chunk.original) : -1);
			else mappings.addUneditedChunk(sourceIndex, chunk, this.original, loc, this.sourcemapLocations);
			if (chunk.outro.length) mappings.advance(chunk.outro);
		});
		if (this.outro) mappings.advance(this.outro);
		return {
			file: options.file ? options.file.split(/[/\\]/).pop() : void 0,
			sources: [options.source ? getRelativePath(options.file || "", options.source) : options.file || ""],
			sourcesContent: options.includeContent ? [this.original] : void 0,
			names,
			mappings: mappings.raw,
			x_google_ignoreList: this.ignoreList ? [sourceIndex] : void 0,
			rangeMappings: mappings.rawRangeMappings
		};
	}
	/**
	* Generates a version 3 sourcemap.
	*/
	generateMap(options) {
		return new SourceMap(this.generateDecodedMap(options));
	}
	/** @internal */
	_ensureindentStr() {
		if (this.indentStr === void 0) this.indentStr = guessIndent(this.original);
	}
	/** @internal */
	_getRawIndentString() {
		this._ensureindentStr();
		return this.indentStr;
	}
	getIndentString() {
		this._ensureindentStr();
		return this.indentStr === null ? "	" : this.indentStr;
	}
	indent(indentStr, options) {
		const pattern = /^[^\r\n]/gm;
		if (isObject(indentStr)) {
			options = indentStr;
			indentStr = void 0;
		}
		if (indentStr === void 0) {
			this._ensureindentStr();
			indentStr = this.indentStr || "	";
		}
		if (indentStr === "") return this;
		const resolvedIndentStr = indentStr;
		options = options || {};
		const isExcluded = {};
		if (options.exclude) (typeof options.exclude[0] === "number" ? [options.exclude] : options.exclude).forEach((exclusion) => {
			for (let i = exclusion[0]; i < exclusion[1]; i += 1) isExcluded[i] = true;
		});
		let shouldIndentNextCharacter = options.indentStart !== false;
		const indentPiece = (str) => {
			if (str === "") return str;
			const indented = str.replace(pattern, (match, offset) => offset > 0 || shouldIndentNextCharacter ? `${resolvedIndentStr}${match}` : match);
			shouldIndentNextCharacter = str[str.length - 1] === "\n";
			return indented;
		};
		this.intro = indentPiece(this.intro);
		let charIndex = 0;
		let chunk = this.firstChunk;
		const indentAt = (index) => {
			shouldIndentNextCharacter = false;
			if (index === chunk.start) chunk.appendRight(resolvedIndentStr);
			else {
				this._splitChunk(chunk, index);
				chunk = chunk.next;
				chunk.prependRight(resolvedIndentStr);
			}
		};
		while (chunk) {
			const end = chunk.end;
			if (!isExcluded[chunk.start]) chunk.intro = indentPiece(chunk.intro);
			if (chunk.edited) {
				if (!isExcluded[charIndex]) chunk.content = indentPiece(chunk.content);
			} else if (options.exclude) {
				charIndex = chunk.start;
				while (charIndex < end) {
					if (!isExcluded[charIndex]) {
						const char = this.original.charCodeAt(charIndex);
						if (char === NEWLINE_CHAR) shouldIndentNextCharacter = true;
						else if (char !== CR_CHAR && shouldIndentNextCharacter) indentAt(charIndex);
					}
					charIndex += 1;
				}
			} else {
				charIndex = chunk.start;
				while (charIndex < end) {
					if (!shouldIndentNextCharacter) {
						const nextLine = this.original.indexOf(n, charIndex);
						if (nextLine === -1 || nextLine >= end) break;
						shouldIndentNextCharacter = true;
						charIndex = nextLine + 1;
						continue;
					}
					const char = this.original.charCodeAt(charIndex);
					if (char === NEWLINE_CHAR || char === CR_CHAR) {
						charIndex += 1;
						continue;
					}
					indentAt(charIndex);
					charIndex += 1;
				}
			}
			if (!isExcluded[chunk.end - 1]) chunk.outro = indentPiece(chunk.outro);
			charIndex = chunk.end;
			chunk = chunk.next;
		}
		this.outro = indentPiece(this.outro);
		return this;
	}
	/** @internal */
	insert() {
		throw new MagicStringError("insert() is deprecated, use appendLeft() or prependRight()");
	}
	/** @internal */
	insertLeft(index, content) {
		if (!warned.insertLeft) {
			console.warn("magicString.insertLeft(...) is deprecated. Use magicString.appendLeft(...) instead");
			warned.insertLeft = true;
		}
		return this.appendLeft(index, content);
	}
	/** @internal */
	insertRight(index, content) {
		if (!warned.insertRight) {
			console.warn("magicString.insertRight(...) is deprecated. Use magicString.prependRight(...) instead");
			warned.insertRight = true;
		}
		return this.prependRight(index, content);
	}
	/**
	* Moves the characters from `start` and `end` to `index`.
	*/
	move(start, end, index) {
		start = start + this.offset;
		end = end + this.offset;
		index = index + this.offset;
		if (start === end) return this;
		if (index >= start && index <= end) throw new MagicStringError("cannot move a selection inside itself");
		this._split(start);
		this._split(end);
		this._split(index);
		const first = this.byStart.get(start);
		const last = this.byEnd.get(end);
		if (this.hasMovedChunks) {
			let cursor = first;
			while (cursor !== last) {
				cursor = cursor.next;
				if (!cursor || cursor.start < start || cursor.end > end) throw new MagicStringError(`cannot move ${start} to ${end} because an earlier move split that range`);
			}
		}
		const oldLeft = first.previous;
		const oldRight = last.next;
		const newRight = this.byStart.get(index);
		if (!newRight && last === this.lastChunk) return this;
		const newLeft = newRight ? newRight.previous : this.lastChunk;
		if (oldLeft) oldLeft.next = oldRight;
		if (oldRight) oldRight.previous = oldLeft;
		if (newLeft) newLeft.next = first;
		if (newRight) newRight.previous = last;
		if (!first.previous) this.firstChunk = last.next;
		if (!last.next) {
			this.lastChunk = first.previous;
			this.lastChunk.next = null;
		}
		first.previous = newLeft;
		last.next = newRight || null;
		if (!newLeft) this.firstChunk = first;
		if (!newRight) this.lastChunk = last;
		this.hasMovedChunks = true;
		return this;
	}
	/**
	* Replaces the characters from `start` to `end` with `content`, along with the appended/prepended content in
	* that range. The same restrictions as `s.remove()` apply.
	*
	* The fourth argument is optional. It can have a storeName property - if true, the original name will be stored
	* for later inclusion in a sourcemap's names array - and a contentOnly property which determines whether only
	* the content is overwritten, or anything that was appended/prepended to the range as well.
	*
	* It may be preferred to use `s.update(...)` instead if you wish to avoid overwriting the appended/prepended content.
	*/
	overwrite(start, end, content, options) {
		const optionObject = typeof options === "object" && options ? options : {};
		return this.update(start, end, content, {
			...optionObject,
			overwrite: !optionObject.contentOnly
		});
	}
	/**
	* Replaces the characters from `start` to `end` with `content`. The same restrictions as `s.remove()` apply.
	*
	* The fourth argument is optional. It can have a storeName property - if true, the original name will be stored
	* for later inclusion in a sourcemap's names array - and an overwrite property which determines whether only
	* the content is overwritten, or anything that was appended/prepended to the range as well.
	*/
	update(start, end, content, options) {
		start = start + this.offset;
		end = end + this.offset;
		if (typeof content !== "string") throw new MagicStringError(`content must be a string, got ${typeof content}`);
		if (this.original.length !== 0) {
			if (start < 0) start = Math.max(0, start + this.original.length);
			if (end < 0) end = Math.max(0, end + this.original.length);
		}
		if (start < 0) throw new MagicStringError(`start ${start} is out of bounds`);
		if (end > this.original.length) throw new MagicStringError(`end ${end} is out of bounds`);
		if (start === end) throw new MagicStringError(`cannot overwrite a zero-length range at ${start}, use appendLeft() or prependRight()`);
		if (start > end) throw new MagicStringError(`end must be greater than start (start: ${start}, end: ${end})`);
		this._split(start);
		this._split(end);
		if (options === true) {
			if (!warned.storeName) {
				console.warn("The final argument to magicString.overwrite(...) should be an options object. See https://github.com/rich-harris/magic-string");
				warned.storeName = true;
			}
			options = { storeName: true };
		}
		const optionObject = typeof options === "object" && options ? options : {};
		const storeName = optionObject.storeName || false;
		const overwrite = optionObject.overwrite || false;
		if (storeName) {
			const original = this.original.slice(start, end);
			Object.defineProperty(this.storedNames, original, {
				writable: true,
				value: true,
				enumerable: true
			});
		}
		const first = this.byStart.get(start);
		const last = this.byEnd.get(end);
		/* v8 ignore else -- unreachable: a valid start/end always yields a `first` chunk */
		if (first) {
			let chunk = first;
			while (chunk !== last) {
				if (chunk.next !== this.byStart.get(chunk.end)) throw new MagicStringError("cannot overwrite across a split point");
				chunk = chunk.next;
				chunk.edit("", false);
			}
			first.edit(content, storeName, !overwrite);
		} else {
			const newChunk = new Chunk(start, end, "").edit(content, storeName);
			last.next = newChunk;
			newChunk.previous = last;
		}
		return this;
	}
	/**
	* Prepends the string with the specified content.
	*/
	prepend(content) {
		if (typeof content !== "string") throw new MagicStringError(`content must be a string, got ${typeof content}`);
		this.intro = content + this.intro;
		return this;
	}
	/**
	* Same as `s.appendLeft(...)`, except that the inserted content will go *before* any previous appends or prepends at index
	*/
	prependLeft(index, content) {
		index = index + this.offset;
		if (typeof content !== "string") throw new MagicStringError(`content must be a string, got ${typeof content}`);
		this._split(index);
		const chunk = this.byEnd.get(index);
		if (chunk) chunk.prependLeft(content);
		else this.intro = content + this.intro;
		return this;
	}
	/**
	* Same as `s.appendRight(...)`, except that the inserted content will go *before* any previous appends or prepends at `index`
	*/
	prependRight(index, content) {
		index = index + this.offset;
		if (typeof content !== "string") throw new MagicStringError(`content must be a string, got ${typeof content}`);
		this._split(index);
		const chunk = this.byStart.get(index);
		if (chunk) chunk.prependRight(content);
		else this.outro = content + this.outro;
		return this;
	}
	/**
	* Removes the characters from `start` to `end` (of the original string, **not** the generated string).
	* Removing the same content twice, or making removals that partially overlap, will cause an error.
	*/
	remove(start, end) {
		start = start + this.offset;
		end = end + this.offset;
		if (this.original.length !== 0) {
			if (start < 0) start = Math.max(0, start + this.original.length);
			if (end < 0) end = Math.max(0, end + this.original.length);
		}
		if (start === end) return this;
		if (start < 0 || end > this.original.length) throw new MagicStringError(`range ${start}–${end} is out of bounds`);
		if (start > end) throw new MagicStringError(`end must be greater than start (start: ${start}, end: ${end})`);
		this._split(start);
		this._split(end);
		let chunk = this.byStart.get(start);
		while (chunk) {
			chunk.intro = "";
			chunk.outro = "";
			chunk.edit("");
			chunk = end > chunk.end ? this.byStart.get(chunk.end) : null;
		}
		return this;
	}
	/**
	* Reset the modified characters from `start` to `end` (of the original string, **not** the generated string).
	*/
	reset(start, end) {
		start = start + this.offset;
		end = end + this.offset;
		if (this.original.length !== 0) {
			if (start < 0) start = Math.max(0, start + this.original.length);
			if (end < 0) end = Math.max(0, end + this.original.length);
		}
		if (start === end) return this;
		if (start < 0 || end > this.original.length) throw new MagicStringError(`range ${start}–${end} is out of bounds`);
		if (start > end) throw new MagicStringError(`end must be greater than start (start: ${start}, end: ${end})`);
		this._split(start);
		this._split(end);
		let chunk = this.byStart.get(start);
		while (chunk) {
			chunk.reset();
			chunk = end > chunk.end ? this.byStart.get(chunk.end) : null;
		}
		return this;
	}
	lastChar() {
		if (this.outro.length) return this.outro[this.outro.length - 1];
		let chunk = this.lastChunk;
		while (chunk) {
			if (chunk.outro.length) return chunk.outro[chunk.outro.length - 1];
			if (chunk.content.length) return chunk.content[chunk.content.length - 1];
			if (chunk.intro.length) return chunk.intro[chunk.intro.length - 1];
			chunk = chunk.previous;
		}
		if (this.intro.length) return this.intro[this.intro.length - 1];
		return "";
	}
	lastLine() {
		let lineIndex = this.outro.lastIndexOf(n);
		if (lineIndex !== -1) return this.outro.substr(lineIndex + 1);
		let lineStr = this.outro;
		let chunk = this.lastChunk;
		while (chunk) {
			if (chunk.outro.length > 0) {
				lineIndex = chunk.outro.lastIndexOf(n);
				if (lineIndex !== -1) return chunk.outro.substr(lineIndex + 1) + lineStr;
				lineStr = chunk.outro + lineStr;
			}
			if (chunk.content.length > 0) {
				lineIndex = chunk.content.lastIndexOf(n);
				if (lineIndex !== -1) return chunk.content.substr(lineIndex + 1) + lineStr;
				lineStr = chunk.content + lineStr;
			}
			if (chunk.intro.length > 0) {
				lineIndex = chunk.intro.lastIndexOf(n);
				if (lineIndex !== -1) return chunk.intro.substr(lineIndex + 1) + lineStr;
				lineStr = chunk.intro + lineStr;
			}
			chunk = chunk.previous;
		}
		lineIndex = this.intro.lastIndexOf(n);
		if (lineIndex !== -1) return this.intro.substr(lineIndex + 1) + lineStr;
		return this.intro + lineStr;
	}
	/**
	* Returns the content of the generated string that corresponds to the slice between `start` and `end` of the original string.
	* Throws error if the indices are for characters that were already removed.
	*/
	slice(start = 0, end = this.original.length - this.offset) {
		start = start + this.offset;
		end = end + this.offset;
		if (this.original.length !== 0) {
			if (start < 0) start = Math.max(0, start + this.original.length);
			if (end < 0) end = Math.max(0, end + this.original.length);
		}
		let result = "";
		let chunk = this.firstChunk;
		while (chunk && (chunk.start > start || chunk.end <= start)) {
			if (chunk.start < end && chunk.end >= end) return result;
			chunk = chunk.next;
		}
		if (chunk && chunk.edited && chunk.start !== start) throw new MagicStringError(`cannot use edited character ${start} as slice start anchor`);
		const startChunk = chunk;
		while (chunk) {
			if (chunk.intro && (startChunk !== chunk || chunk.start === start)) result += chunk.intro;
			const containsEnd = chunk.start < end && chunk.end >= end;
			if (containsEnd && chunk.edited && chunk.end !== end) throw new MagicStringError(`cannot use edited character ${end} as slice end anchor`);
			const sliceStart = startChunk === chunk ? start - chunk.start : 0;
			const sliceEnd = containsEnd ? chunk.content.length + end - chunk.end : chunk.content.length;
			result += chunk.content.slice(sliceStart, sliceEnd);
			if (chunk.outro && (!containsEnd || chunk.end === end)) result += chunk.outro;
			if (containsEnd) break;
			chunk = chunk.next;
		}
		return result;
	}
	/**
	* Returns a clone of `s`, with all content before the `start` and `end` characters of the original string removed.
	*/
	snip(start, end) {
		const clone = this.clone();
		clone.remove(0, start);
		clone.remove(end, clone.original.length);
		return clone;
	}
	/** @internal */
	_split(index) {
		if (this.byStart.get(index) || this.byEnd.get(index)) return;
		let chunk = this.lastSearchedChunk;
		let previousChunk = chunk;
		const searchForward = index > chunk.end;
		while (chunk) {
			if (chunk.contains(index)) return this._splitChunk(chunk, index);
			chunk = searchForward ? this.byStart.get(chunk.end) : this.byEnd.get(chunk.start);
			if (chunk === previousChunk) return;
			previousChunk = chunk;
		}
	}
	/** @internal */
	_splitChunk(chunk, index) {
		if (chunk.edited && chunk.content.length) {
			const loc = getLocator(this.original)(index);
			throw new MagicStringError(`cannot split a chunk that has already been edited (${loc.line}:${loc.column} – "${chunk.original}")`);
		}
		const newChunk = chunk.split(index);
		this.byEnd.set(index, chunk);
		this.byStart.set(index, newChunk);
		this.byEnd.set(newChunk.end, newChunk);
		if (chunk === this.lastChunk) this.lastChunk = newChunk;
		this.lastSearchedChunk = chunk;
		return true;
	}
	/**
	* Returns the generated string.
	*/
	toString() {
		let str = this.intro;
		let chunk = this.firstChunk;
		while (chunk) {
			str += chunk.toString();
			chunk = chunk.next;
		}
		return str + this.outro;
	}
	/**
	* Returns true if the resulting source is empty (disregarding white space).
	*/
	isEmpty() {
		if (this.intro.length && this.intro.trim()) return false;
		let chunk = this.firstChunk;
		while (chunk) {
			if (chunk.intro.length && chunk.intro.trim() || chunk.content.length && chunk.content.trim() || chunk.outro.length && chunk.outro.trim()) return false;
			chunk = chunk.next;
		}
		if (this.outro.length && this.outro.trim()) return false;
		return true;
	}
	length() {
		let chunk = this.firstChunk;
		let length = 0;
		while (chunk) {
			length += chunk.intro.length + chunk.content.length + chunk.outro.length;
			chunk = chunk.next;
		}
		return length;
	}
	/**
	* Removes empty lines from the start and end.
	*/
	trimLines() {
		return this.trim("[\\r\\n]");
	}
	/**
	* Trims content matching `charType` (defaults to `\s`, i.e. whitespace) from the start and end.
	*/
	trim(charType) {
		return this.trimStart(charType).trimEnd(charType);
	}
	/** @internal */
	trimEndAborted(charType) {
		const rx = new RegExp(`${charType || "\\s"}+$`);
		this.outro = this.outro.replace(rx, "");
		if (this.outro.length) return true;
		let chunk = this.lastChunk;
		do {
			const end = chunk.end;
			const aborted = chunk.trimEnd(rx);
			if (chunk.end !== end) {
				if (this.lastChunk === chunk) this.lastChunk = chunk.next;
				this.byEnd.set(chunk.end, chunk);
				this.byStart.set(chunk.next.start, chunk.next);
				this.byEnd.set(chunk.next.end, chunk.next);
			}
			if (aborted) return true;
			chunk = chunk.previous;
		} while (chunk);
		return false;
	}
	/**
	* Trims content matching `charType` (defaults to `\s`, i.e. whitespace) from the end.
	*/
	trimEnd(charType) {
		this.trimEndAborted(charType);
		return this;
	}
	/** @internal */
	trimStartAborted(charType) {
		const rx = new RegExp(`^${charType || "\\s"}+`);
		this.intro = this.intro.replace(rx, "");
		if (this.intro.length) return true;
		let chunk = this.firstChunk;
		do {
			const end = chunk.end;
			const aborted = chunk.trimStart(rx);
			if (chunk.end !== end) {
				if (chunk === this.lastChunk) this.lastChunk = chunk.next;
				this.byEnd.set(chunk.end, chunk);
				this.byStart.set(chunk.next.start, chunk.next);
				this.byEnd.set(chunk.next.end, chunk.next);
			}
			if (aborted) return true;
			chunk = chunk.next;
		} while (chunk);
		return false;
	}
	/**
	* Trims content matching `charType` (defaults to `\s`, i.e. whitespace) from the start.
	*/
	trimStart(charType) {
		this.trimStartAborted(charType);
		return this;
	}
	/**
	* Indicates if the string has been changed.
	*/
	hasChanged() {
		if (this.intro || this.outro) return true;
		let outputIndex = 0;
		let chunk = this.firstChunk;
		while (chunk) {
			if (chunk.intro || chunk.outro) return true;
			if (!chunk.edited && chunk.start === outputIndex) outputIndex = chunk.end;
			else {
				if (!this.original.startsWith(chunk.content, outputIndex)) return true;
				outputIndex += chunk.content.length;
			}
			chunk = chunk.next;
		}
		return outputIndex !== this.original.length;
	}
	/** @internal */
	_replaceRegexp(searchValue, replacement) {
		function getReplacement(match, str) {
			if (typeof replacement === "string") return expandReplacement(replacement, match[0], match.index, str, match.slice(1), match.groups);
			else return match.groups === void 0 ? replacement(match[0], ...match.slice(1), match.index, str) : replacement(match[0], ...match.slice(1), match.index, str, match.groups);
		}
		const replaceMatch = (match) => {
			/* v8 ignore next 2 -- `match.index` is always defined for matches from `matchAll` */
			if (match.index == null) return;
			const replacement = getReplacement(match, this.original);
			if (replacement === match[0]) return;
			if (match[0].length === 0) this.appendRight(match.index, replacement);
			else this.overwrite(match.index, match.index + match[0].length, replacement);
		};
		if (searchValue.global) {
			searchValue.lastIndex = 0;
			for (const match of this.original.matchAll(searchValue)) replaceMatch(match);
		} else {
			const match = this.original.match(searchValue);
			if (match) replaceMatch(match);
		}
		return this;
	}
	/** @internal */
	_replaceString(string, replacement) {
		const { original } = this;
		const index = original.indexOf(string);
		if (index !== -1) {
			if (typeof replacement === "function") replacement = replacement(string, index, original);
			else replacement = expandReplacement(replacement, string, index, original, [], void 0);
			if (string !== replacement) {
				if (string.length === 0) this.appendRight(index, replacement);
				else this.overwrite(index, index + string.length, replacement);
			}
		}
		return this;
	}
	/**
	* String replacement with RegExp or string.
	*/
	replace(searchValue, replacement) {
		if (typeof searchValue === "string") return this._replaceString(searchValue, replacement);
		return this._replaceRegexp(searchValue, replacement);
	}
	/** @internal */
	_replaceAllString(string, replacement) {
		const { original } = this;
		const stringLength = string.length;
		if (stringLength === 0) {
			for (let index = 0; index <= original.length; index += 1) {
				const _replacement = typeof replacement === "function" ? replacement("", index, original) : expandReplacement(replacement, "", index, original, [], void 0);
				if (_replacement !== "") this.appendRight(index, _replacement);
			}
			return this;
		}
		for (let index = original.indexOf(string); index !== -1; index = original.indexOf(string, index + stringLength)) {
			const previous = original.slice(index, index + stringLength);
			const _replacement = typeof replacement === "function" ? replacement(previous, index, original) : expandReplacement(replacement, previous, index, original, [], void 0);
			if (previous !== _replacement) this.overwrite(index, index + stringLength, _replacement);
		}
		return this;
	}
	/**
	* Same as `s.replace`, but replace all matched strings instead of just one.
	*/
	replaceAll(searchValue, replacement) {
		if (typeof searchValue === "string") return this._replaceAllString(searchValue, replacement);
		if (!searchValue.global) throw new MagicStringError("replaceAll() requires a global RegExp");
		return this._replaceRegexp(searchValue, replacement);
	}
};
//#endregion
//#region src/Bundle.ts
const hasOwnProp = Object.prototype.hasOwnProperty;
var Bundle = class Bundle {
	constructor(options = {}) {
		this.intro = options.intro || "";
		this.separator = options.separator !== void 0 ? options.separator : "\n";
		this.sources = [];
		this.uniqueSources = [];
		this.uniqueSourceIndexByFilename = {};
	}
	/**
	* Adds the specified source to the bundle, which can either be a `MagicString` object directly,
	* or an options object that holds a magic string `content` property and optionally provides
	* a `filename` for the source within the bundle, as well as an optional `ignoreList` hint
	* (which defaults to `false`). The `filename` is used when constructing the source map for the
	* bundle, to identify this `source` in the source map's `sources` field. The `ignoreList` hint
	* is used to populate the `x_google_ignoreList` extension field in the source map, which is a
	* mechanism for tools to signal to debuggers that certain sources should be ignored by default
	* (depending on user preferences).
	*/
	addSource(source) {
		if (source instanceof MagicString) return this.addSource({
			content: source,
			filename: source.filename,
			separator: this.separator
		});
		if (!isObject(source) || !source.content) throw new MagicStringError("addSource() requires a `content` property that is a MagicString");
		[
			"filename",
			"ignoreList",
			"indentExclusionRanges",
			"separator"
		].forEach((option) => {
			if (!hasOwnProp.call(source, option)) source[option] = source.content[option];
		});
		if (source.separator === void 0) source.separator = this.separator;
		if (source.filename) {
			if (!hasOwnProp.call(this.uniqueSourceIndexByFilename, source.filename)) {
				this.uniqueSourceIndexByFilename[source.filename] = this.uniqueSources.length;
				this.uniqueSources.push({
					filename: source.filename,
					content: source.content.original
				});
			} else {
				const uniqueSource = this.uniqueSources[this.uniqueSourceIndexByFilename[source.filename]];
				if (source.content.original !== uniqueSource.content) throw new MagicStringError(`duplicate filename "${source.filename}" with different content, use unique filenames`);
			}
		}
		this.sources.push(source);
		return this;
	}
	append(str, options) {
		this.addSource({
			content: new MagicString(str),
			separator: options && options.separator || ""
		});
		return this;
	}
	clone() {
		const bundle = new Bundle({
			intro: this.intro,
			separator: this.separator
		});
		this.sources.forEach((source) => {
			bundle.addSource({
				filename: source.filename,
				content: source.content.clone(),
				ignoreList: source.ignoreList,
				indentExclusionRanges: source.indentExclusionRanges,
				separator: source.separator
			});
		});
		return bundle;
	}
	generateDecodedMap(options = {}) {
		const names = [];
		let x_google_ignoreList;
		this.sources.forEach((source) => {
			Object.keys(source.content.storedNames).forEach((name) => {
				if (!names.includes(name)) names.push(name);
			});
		});
		const mappings = new Mappings(options.hires);
		if (this.intro) mappings.advance(this.intro);
		this.sources.forEach((source, i) => {
			if (i > 0)
 /* v8 ignore next -- addSource always normalizes source.separator */
			mappings.advance(source.separator !== void 0 ? source.separator : this.separator);
			const sourceIndex = source.filename ? this.uniqueSourceIndexByFilename[source.filename] : -1;
			const magicString = source.content;
			const locate = getLocator(magicString.original);
			if (magicString.intro) mappings.advance(magicString.intro);
			magicString.firstChunk.eachNext((chunk) => {
				const loc = locate(chunk.start);
				if (chunk.intro.length) mappings.advance(chunk.intro);
				if (source.filename) {
					if (chunk.edited) mappings.addEdit(sourceIndex, chunk.content, loc, chunk.storeName ? names.indexOf(chunk.original) : -1);
					else mappings.addUneditedChunk(sourceIndex, chunk, magicString.original, loc, magicString.sourcemapLocations);
				} else mappings.advance(chunk.content);
				if (chunk.outro.length) mappings.advance(chunk.outro);
			});
			if (magicString.outro) mappings.advance(magicString.outro);
			if (source.ignoreList && sourceIndex !== -1) {
				if (x_google_ignoreList === void 0) x_google_ignoreList = [];
				x_google_ignoreList.push(sourceIndex);
			}
		});
		return {
			file: options.file ? options.file.split(/[/\\]/).pop() : void 0,
			sources: this.uniqueSources.map((source) => {
				return options.file ? getRelativePath(options.file, source.filename) : source.filename;
			}),
			sourcesContent: this.uniqueSources.map((source) => {
				return (typeof options.includeContent === "function" ? options.includeContent(source) : options.includeContent) ? source.content : null;
			}),
			names,
			mappings: mappings.raw,
			x_google_ignoreList,
			rangeMappings: mappings.rawRangeMappings
		};
	}
	generateMap(options) {
		return new SourceMap(this.generateDecodedMap(options));
	}
	getIndentString() {
		const indentStringCounts = {};
		this.sources.forEach((source) => {
			const indentStr = source.content._getRawIndentString();
			if (indentStr === null) return;
			if (!indentStringCounts[indentStr]) indentStringCounts[indentStr] = 0;
			indentStringCounts[indentStr] += 1;
		});
		return Object.keys(indentStringCounts).sort((a, b) => {
			return indentStringCounts[b] - indentStringCounts[a];
		})[0] || "	";
	}
	indent(indentStr) {
		if (!arguments.length) indentStr = this.getIndentString();
		if (indentStr === "") return this;
		let trailingNewline = !this.intro || this.intro.slice(-1) === "\n";
		this.sources.forEach((source, i) => {
			/* v8 ignore next -- addSource always normalizes source.separator */
			const separator = source.separator !== void 0 ? source.separator : this.separator;
			const indentStart = trailingNewline || i > 0 && /\r?\n$/.test(separator);
			source.content.indent(indentStr, {
				exclude: source.indentExclusionRanges,
				indentStart
			});
			trailingNewline = source.content.lastChar() === "\n";
		});
		if (this.intro) this.intro = indentStr + this.intro.replace(/^[^\n]/gm, (match, index) => {
			return index > 0 ? indentStr + match : match;
		});
		return this;
	}
	prepend(str) {
		this.intro = str + this.intro;
		return this;
	}
	toString() {
		const body = this.sources.map((source, i) => {
			/* v8 ignore next -- addSource always normalizes source.separator */
			const separator = source.separator !== void 0 ? source.separator : this.separator;
			return (i > 0 ? separator : "") + source.content.toString();
		}).join("");
		return this.intro + body;
	}
	isEmpty() {
		if (this.intro.length && this.intro.trim()) return false;
		if (this.sources.some((source, i) => {
			/* v8 ignore next -- addSource always normalizes source.separator */
			const separator = source.separator !== void 0 ? source.separator : this.separator;
			return i > 0 && separator.trim() !== "" || !source.content.isEmpty();
		})) return false;
		return true;
	}
	length() {
		return this.sources.reduce((length, source, i) => {
			/* v8 ignore next -- addSource always normalizes source.separator */
			const separator = source.separator !== void 0 ? source.separator : this.separator;
			return length + (i > 0 ? separator.length : 0) + source.content.toString().length;
		}, this.intro.length);
	}
	trimLines() {
		return this.trim("[\\r\\n]");
	}
	trim(charType) {
		return this.trimStart(charType).trimEnd(charType);
	}
	trimStart(charType) {
		const rx = new RegExp(`^${charType || "\\s"}+`);
		this.intro = this.intro.replace(rx, "");
		if (!this.intro) for (let i = 0; i < this.sources.length; i += 1) {
			const source = this.sources[i];
			if (i > 0) {
				source.separator = (source.separator !== void 0 ? source.separator : this.separator).replace(rx, "");
				if (source.separator) break;
			}
			if (source.content.trimStartAborted(charType)) break;
		}
		return this;
	}
	trimEnd(charType) {
		const rx = new RegExp(`${charType || "\\s"}+$`);
		for (let i = this.sources.length - 1; i >= 0; i -= 1) {
			const source = this.sources[i];
			if (source.content.trimEndAborted(charType)) return this;
			if (i > 0) {
				source.separator = (source.separator !== void 0 ? source.separator : this.separator).replace(rx, "");
				if (source.separator) return this;
			}
		}
		this.intro = this.intro.replace(rx, "");
		return this;
	}
};
//#endregion



/***/ })

};
;