"use strict";

/** @typedef {import("./index.js").MinimizedResult} MinimizedResult */
/** @typedef {import("./index.js").CustomOptions} CustomOptions */
/** @typedef {import("./index.js").RawSourceMap} RawSourceMap */
/**
 * @template T
 * @typedef {import("./index.js").MinimizerOptions<T>} MinimizerOptions
 */

const VLQ_BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Encode a single integer as Base64 VLQ as used by the source-map spec.
 * @param {number} value integer to encode
 * @returns {string} encoded VLQ characters
 */
/* eslint-disable prefer-destructuring, no-eq-null, eqeqeq */
/**
 * @param {number} value integer to encode
 * @returns {string} encoded VLQ characters
 */
function encodeVlq(value) {
  let vlq = value < 0 ? -value << 1 | 1 : value << 1;
  let out = "";
  do {
    let digit = vlq & 0b11111;
    vlq >>>= 5;
    if (vlq > 0) {
      digit |= 0b100000;
    }
    out += VLQ_BASE64[digit];
  } while (vlq > 0);
  return out;
}

/**
 * Encode decoded source-map mappings (per-line arrays of segments) back into
 * the spec's `mappings` string.
 * @param {number[][][]} decoded mappings as nested arrays of segments
 * @returns {string} encoded `mappings` field
 */
function encodeMappings(decoded) {
  let result = "";
  let prevSourceIdx = 0;
  let prevOriginalLine = 0;
  let prevOriginalColumn = 0;
  let prevNameIdx = 0;
  for (let line = 0; line < decoded.length; line++) {
    if (line > 0) {
      result += ";";
    }
    let prevGeneratedColumn = 0;
    const segments = decoded[line];
    for (let i = 0; i < segments.length; i++) {
      if (i > 0) {
        result += ",";
      }
      const seg = segments[i];
      result += encodeVlq(seg[0] - prevGeneratedColumn);
      prevGeneratedColumn = seg[0];
      if (seg.length >= 4) {
        result += encodeVlq(seg[1] - prevSourceIdx);
        prevSourceIdx = seg[1];
        result += encodeVlq(seg[2] - prevOriginalLine);
        prevOriginalLine = seg[2];
        result += encodeVlq(seg[3] - prevOriginalColumn);
        prevOriginalColumn = seg[3];
        if (seg.length >= 5) {
          result += encodeVlq(seg[4] - prevNameIdx);
          prevNameIdx = seg[4];
        }
      }
    }
  }
  return result;
}

/**
 * Compose a freshly-produced source map with the input source map fed to
 * the minimizer. `currentMap` represents `name → step-output` and
 * `prevMap` represents `original → name`; the result represents
 * `original → step-output`.
 *
 * TODO: replace with a webpack-sources helper once one is exposed —
 * `SourceMapSource` already composes one level via `innerSourceMap`,
 * see https://github.com/webpack/webpack-sources for the proposal to
 * expose it as a public `composeSourceMaps` (or n-step `SourceMapSource`).
 * @param {RawSourceMap | undefined} currentMap map produced by the minimizer
 * @param {RawSourceMap | undefined} prevMap input source map fed to the minimizer
 * @param {string} name name of the asset that the current map points to
 * @returns {RawSourceMap | undefined} composed map
 */
function composeSourceMaps(currentMap, prevMap, name) {
  if (!currentMap || !prevMap) {
    return currentMap;
  }

  // Custom minimizers may return the map as a JSON string (e.g. terser's
  // default output). `TraceMap` accepts both shapes, but we still hand
  // back the original `currentMap` (string preserved) when the previous
  // map can't be combined.
  const {
    TraceMap,
    decodedMappings,
    originalPositionFor,
    sourceContentFor
  } = require('next/dist/compiled/@jridgewell/trace-mapping');
  const current = new TraceMap(/** @type {import("@jridgewell/trace-mapping").SourceMapInput} */
  /** @type {unknown} */currentMap);
  const previous = new TraceMap(/** @type {import("@jridgewell/trace-mapping").SourceMapInput} */
  /** @type {unknown} */prevMap);

  /** @type {string[]} */
  const sources = [];
  /** @type {(string | null)[]} */
  const sourcesContent = [];
  /** @type {string[]} */
  const names = [];
  /** @type {Map<string, number>} */
  const sourceIdx = new Map();
  /** @type {Map<string, number>} */
  const nameIdx = new Map();

  /**
   * @param {string | null | undefined} source source identifier
   * @param {string | undefined} content source content (when available)
   * @returns {number} index assigned in the composed map
   */
  const getSourceIdx = (source, content) => {
    const key = source || "";
    let idx = sourceIdx.get(key);
    if (typeof idx === "undefined") {
      idx = sources.length;
      sources.push(key);
      sourcesContent.push(typeof content === "string" ? content : null);
      sourceIdx.set(key, idx);
    } else if (typeof content === "string" && sourcesContent[idx] === null) {
      sourcesContent[idx] = content;
    }
    return idx;
  };

  /**
   * @param {string | null | undefined} value name
   * @returns {number} index assigned in the composed map
   */
  const getNameIdx = value => {
    if (typeof value !== "string") {
      return -1;
    }
    let idx = nameIdx.get(value);
    if (typeof idx === "undefined") {
      idx = names.length;
      names.push(value);
      nameIdx.set(value, idx);
    }
    return idx;
  };
  const decoded = decodedMappings(current);
  const currentSources = current.sources.map(
  /**
   * @param {string | null} source source from current map
   * @returns {string} normalized source string
   */
  source => source || "");
  const currentNames = current.names;

  /** @type {number[][][]} */
  const composed = [];
  for (let line = 0; line < decoded.length; line++) {
    /** @type {number[][]} */
    const newSegments = [];
    for (const rawSeg of decoded[line]) {
      const seg = /** @type {number[]} */rawSeg;

      // Single-element segment is just a generated column with no source info
      if (seg.length < 4) {
        newSegments.push([seg[0]]);
        continue;
      }
      const sourceName = currentSources[seg[1]];
      const origLine = /** @type {number} */seg[2];
      const origCol = /** @type {number} */seg[3];
      const segName = seg.length >= 5 ? currentNames[seg[4]] : (/** @type {string | null} */null);

      // When the segment points back at our intermediate `name`, look up
      // the original position in the previous map and emit a mapping that
      // points all the way back. Otherwise keep the segment as-is.
      if (sourceName === name) {
        const orig = originalPositionFor(previous, {
          line: origLine + 1,
          column: origCol
        });
        if (typeof orig.source !== "string" || orig.line == null || orig.column == null) {
          continue;
        }
        const content = sourceContentFor(previous, orig.source) || undefined;
        const newSrcIdx = getSourceIdx(orig.source, content);
        const finalName = typeof orig.name === "string" && orig.name ? orig.name : segName;
        if (typeof finalName === "string") {
          newSegments.push([seg[0], newSrcIdx, orig.line - 1, orig.column, getNameIdx(finalName)]);
        } else {
          newSegments.push([seg[0], newSrcIdx, orig.line - 1, orig.column]);
        }
      } else {
        const content = sourceContentFor(current, sourceName) || undefined;
        const newSrcIdx = getSourceIdx(sourceName, content);
        if (typeof segName === "string") {
          newSegments.push([seg[0], newSrcIdx, origLine, origCol, getNameIdx(segName)]);
        } else {
          newSegments.push([seg[0], newSrcIdx, origLine, origCol]);
        }
      }
    }
    composed.push(newSegments);
  }
  const result = /** @type {RawSourceMap} */

  /** @type {unknown} */{
    version: 3,
    sources,
    names,
    mappings: encodeMappings(composed)
  };
  if (currentMap.file) {
    result.file = currentMap.file;
  }
  if (sourcesContent.some(value => typeof value === "string")) {
    result.sourcesContent = /** @type {string[]} */
    /** @type {unknown} */sourcesContent;
  }
  return result;
}
/* eslint-enable prefer-destructuring, no-eq-null, eqeqeq */

/**
 * @template T
 * @param {import("./index.js").InternalOptions<T>} options options
 * @returns {Promise<MinimizedResult>} minified result
 */
async function minify(options) {
  const {
    name,
    input,
    inputSourceMap,
    extractComments,
    module,
    ecma
  } = options;
  const {
    implementation,
    options: minimizerOptions
  } = options.minimizer;
  const implementations = Array.isArray(implementation) ? implementation : [implementation];

  /** @type {string | undefined} */
  let lastCode;
  /** @type {RawSourceMap | undefined} */
  let lastMap;
  /** @type {(Error | string)[]} */
  const warnings = [];
  /** @type {(Error | string)[]} */
  const errors = [];
  /** @type {string[]} */
  const extractedComments = [];
  for (let i = 0; i < implementations.length; i++) {
    const currentImplementation = /** @type {import("./index.js").BasicMinimizerImplementation<T> & import("./index.js").MinimizeFunctionHelpers} */
    implementations[i];
    const baseOptions = /** @type {import("./index.js").MinimizerOptions<T> & { module?: boolean, ecma?: number | string }} */

    Array.isArray(minimizerOptions) ? minimizerOptions[i] || {} : minimizerOptions || {};
    const currentInput = typeof lastCode === "string" ? lastCode : input;
    const currentMap = typeof lastCode === "string" ? lastMap : inputSourceMap;

    // Overlay `module` and `ecma` without mutating the caller's options so
    // a single options object can be reused safely across assets.
    const currentOptions = /** @type {import("./index.js").MinimizerOptions<T>} */
    {
      ...baseOptions,
      module: baseOptions.module || module,
      ecma: baseOptions.ecma || ecma
    };
    const result = await currentImplementation({
      [name]: currentInput
    }, currentMap, currentOptions, extractComments);
    if (result.warnings && result.warnings.length > 0) {
      warnings.push(...result.warnings);
    }
    if (result.errors && result.errors.length > 0) {
      errors.push(...result.errors);
    }
    if (result.extractedComments && result.extractedComments.length > 0) {
      extractedComments.push(...result.extractedComments);
    }
    if (typeof result.code === "string") {
      lastCode = result.code;
      // The minimizer's output map is `name → step-output`. Chain it with
      // the previous accumulated map so that across an array of minimizers
      // the final map points back to the original sources.
      lastMap = composeSourceMaps(result.map, currentMap, name);
    }
  }
  return {
    code: lastCode,
    map: lastMap,
    warnings,
    errors,
    extractedComments
  };
}

/**
 * @param {string} options options
 * @returns {Promise<MinimizedResult>} minified result
 */
async function transform(options) {
  // 'use strict' => this === undefined (Clean Scope)
  // Safer for possible security issues, albeit not critical at all here

  const evaluatedOptions =
  /**
   * @template T
   * @type {import("./index.js").InternalOptions<T>}
   */

  // eslint-disable-next-line no-new-func
  new Function("exports", "require", "module", "__filename", "__dirname", `'use strict'\nreturn ${options}`) // eslint-disable-next-line n/exports-style
  (exports, require, module, __filename, __dirname);
  return minify(evaluatedOptions);
}
module.exports = {
  minify,
  transform
};