/**
 * @license React
 * react-dom-server.edge.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/*


 JS Implementation of MurmurHash3 (r136) (as of May 20, 2011)

 Copyright (c) 2011 Gary Court
 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
*/
"use strict";
var React = require("next/dist/compiled/react-experimental"),
  ReactDOM = require("next/dist/compiled/react-dom-experimental"),
  REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
  REACT_PORTAL_TYPE = Symbol.for("react.portal"),
  REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"),
  REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"),
  REACT_PROFILER_TYPE = Symbol.for("react.profiler"),
  REACT_PROVIDER_TYPE = Symbol.for("react.provider"),
  REACT_CONSUMER_TYPE = Symbol.for("react.consumer"),
  REACT_CONTEXT_TYPE = Symbol.for("react.context"),
  REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"),
  REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"),
  REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"),
  REACT_MEMO_TYPE = Symbol.for("react.memo"),
  REACT_LAZY_TYPE = Symbol.for("react.lazy"),
  REACT_SCOPE_TYPE = Symbol.for("react.scope"),
  REACT_OFFSCREEN_TYPE = Symbol.for("react.offscreen"),
  REACT_LEGACY_HIDDEN_TYPE = Symbol.for("react.legacy_hidden"),
  REACT_MEMO_CACHE_SENTINEL = Symbol.for("react.memo_cache_sentinel"),
  REACT_POSTPONE_TYPE = Symbol.for("react.postpone"),
  REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"),
  MAYBE_ITERATOR_SYMBOL = Symbol.iterator,
  ASYNC_ITERATOR = Symbol.asyncIterator,
  isArrayImpl = Array.isArray;
function murmurhash3_32_gc(key, seed) {
  var remainder = key.length & 3;
  var bytes = key.length - remainder;
  var h1 = seed;
  for (seed = 0; seed < bytes; ) {
    var k1 =
      (key.charCodeAt(seed) & 255) |
      ((key.charCodeAt(++seed) & 255) << 8) |
      ((key.charCodeAt(++seed) & 255) << 16) |
      ((key.charCodeAt(++seed) & 255) << 24);
    ++seed;
    k1 =
      (3432918353 * (k1 & 65535) +
        (((3432918353 * (k1 >>> 16)) & 65535) << 16)) &
      4294967295;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 =
      (461845907 * (k1 & 65535) + (((461845907 * (k1 >>> 16)) & 65535) << 16)) &
      4294967295;
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (5 * (h1 & 65535) + (((5 * (h1 >>> 16)) & 65535) << 16)) & 4294967295;
    h1 = (h1 & 65535) + 27492 + ((((h1 >>> 16) + 58964) & 65535) << 16);
  }
  k1 = 0;
  switch (remainder) {
    case 3:
      k1 ^= (key.charCodeAt(seed + 2) & 255) << 16;
    case 2:
      k1 ^= (key.charCodeAt(seed + 1) & 255) << 8;
    case 1:
      (k1 ^= key.charCodeAt(seed) & 255),
        (k1 =
          (3432918353 * (k1 & 65535) +
            (((3432918353 * (k1 >>> 16)) & 65535) << 16)) &
          4294967295),
        (k1 = (k1 << 15) | (k1 >>> 17)),
        (h1 ^=
          (461845907 * (k1 & 65535) +
            (((461845907 * (k1 >>> 16)) & 65535) << 16)) &
          4294967295);
  }
  h1 ^= key.length;
  h1 ^= h1 >>> 16;
  h1 =
    (2246822507 * (h1 & 65535) + (((2246822507 * (h1 >>> 16)) & 65535) << 16)) &
    4294967295;
  h1 ^= h1 >>> 13;
  h1 =
    (3266489909 * (h1 & 65535) + (((3266489909 * (h1 >>> 16)) & 65535) << 16)) &
    4294967295;
  return (h1 ^ (h1 >>> 16)) >>> 0;
}
function handleErrorInNextTick(error) {
  setTimeoutOrImmediate(function () {
    throw error;
  });
}
var LocalPromise = Promise,
  scheduleMicrotask =
    "function" === typeof queueMicrotask
      ? queueMicrotask
      : function (callback) {
          LocalPromise.resolve(null)
            .then(callback)
            .catch(handleErrorInNextTick);
        },
  currentView = null,
  writtenBytes = 0;
function writeChunk(destination, chunk) {
  if (0 !== chunk.byteLength)
    if (2048 < chunk.byteLength)
      0 < writtenBytes &&
        (destination.enqueue(
          new Uint8Array(currentView.buffer, 0, writtenBytes)
        ),
        (currentView = new Uint8Array(2048)),
        (writtenBytes = 0)),
        destination.enqueue(chunk);
    else {
      var allowableBytes = currentView.length - writtenBytes;
      allowableBytes < chunk.byteLength &&
        (0 === allowableBytes
          ? destination.enqueue(currentView)
          : (currentView.set(chunk.subarray(0, allowableBytes), writtenBytes),
            destination.enqueue(currentView),
            (chunk = chunk.subarray(allowableBytes))),
        (currentView = new Uint8Array(2048)),
        (writtenBytes = 0));
      currentView.set(chunk, writtenBytes);
      writtenBytes += chunk.byteLength;
    }
}
function writeChunkAndReturn(destination, chunk) {
  writeChunk(destination, chunk);
  return !0;
}
function completeWriting(destination) {
  currentView &&
    0 < writtenBytes &&
    (destination.enqueue(new Uint8Array(currentView.buffer, 0, writtenBytes)),
    (currentView = null),
    (writtenBytes = 0));
}
var textEncoder = new TextEncoder();
function stringToChunk(content) {
  return textEncoder.encode(content);
}
function stringToPrecomputedChunk(content) {
  return textEncoder.encode(content);
}
function closeWithError(destination, error) {
  "function" === typeof destination.error
    ? destination.error(error)
    : destination.close();
}
var assign = Object.assign,
  hasOwnProperty = Object.prototype.hasOwnProperty,
  VALID_ATTRIBUTE_NAME_REGEX = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ),
  illegalAttributeNameCache = {},
  validatedAttributeNameCache = {};
function isAttributeNameSafe(attributeName) {
  if (hasOwnProperty.call(validatedAttributeNameCache, attributeName))
    return !0;
  if (hasOwnProperty.call(illegalAttributeNameCache, attributeName)) return !1;
  if (VALID_ATTRIBUTE_NAME_REGEX.test(attributeName))
    return (validatedAttributeNameCache[attributeName] = !0);
  illegalAttributeNameCache[attributeName] = !0;
  return !1;
}
var unitlessNumbers = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  ),
  aliases = new Map([
    ["acceptCharset", "accept-charset"],
    ["htmlFor", "for"],
    ["httpEquiv", "http-equiv"],
    ["crossOrigin", "crossorigin"],
    ["accentHeight", "accent-height"],
    ["alignmentBaseline", "alignment-baseline"],
    ["arabicForm", "arabic-form"],
    ["baselineShift", "baseline-shift"],
    ["capHeight", "cap-height"],
    ["clipPath", "clip-path"],
    ["clipRule", "clip-rule"],
    ["colorInterpolation", "color-interpolation"],
    ["colorInterpolationFilters", "color-interpolation-filters"],
    ["colorProfile", "color-profile"],
    ["colorRendering", "color-rendering"],
    ["dominantBaseline", "dominant-baseline"],
    ["enableBackground", "enable-background"],
    ["fillOpacity", "fill-opacity"],
    ["fillRule", "fill-rule"],
    ["floodColor", "flood-color"],
    ["floodOpacity", "flood-opacity"],
    ["fontFamily", "font-family"],
    ["fontSize", "font-size"],
    ["fontSizeAdjust", "font-size-adjust"],
    ["fontStretch", "font-stretch"],
    ["fontStyle", "font-style"],
    ["fontVariant", "font-variant"],
    ["fontWeight", "font-weight"],
    ["glyphName", "glyph-name"],
    ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
    ["glyphOrientationVertical", "glyph-orientation-vertical"],
    ["horizAdvX", "horiz-adv-x"],
    ["horizOriginX", "horiz-origin-x"],
    ["imageRendering", "image-rendering"],
    ["letterSpacing", "letter-spacing"],
    ["lightingColor", "lighting-color"],
    ["markerEnd", "marker-end"],
    ["markerMid", "marker-mid"],
    ["markerStart", "marker-start"],
    ["overlinePosition", "overline-position"],
    ["overlineThickness", "overline-thickness"],
    ["paintOrder", "paint-order"],
    ["panose-1", "panose-1"],
    ["pointerEvents", "pointer-events"],
    ["renderingIntent", "rendering-intent"],
    ["shapeRendering", "shape-rendering"],
    ["stopColor", "stop-color"],
    ["stopOpacity", "stop-opacity"],
    ["strikethroughPosition", "strikethrough-position"],
    ["strikethroughThickness", "strikethrough-thickness"],
    ["strokeDasharray", "stroke-dasharray"],
    ["strokeDashoffset", "stroke-dashoffset"],
    ["strokeLinecap", "stroke-linecap"],
    ["strokeLinejoin", "stroke-linejoin"],
    ["strokeMiterlimit", "stroke-miterlimit"],
    ["strokeOpacity", "stroke-opacity"],
    ["strokeWidth", "stroke-width"],
    ["textAnchor", "text-anchor"],
    ["textDecoration", "text-decoration"],
    ["textRendering", "text-rendering"],
    ["transformOrigin", "transform-origin"],
    ["underlinePosition", "underline-position"],
    ["underlineThickness", "underline-thickness"],
    ["unicodeBidi", "unicode-bidi"],
    ["unicodeRange", "unicode-range"],
    ["unitsPerEm", "units-per-em"],
    ["vAlphabetic", "v-alphabetic"],
    ["vHanging", "v-hanging"],
    ["vIdeographic", "v-ideographic"],
    ["vMathematical", "v-mathematical"],
    ["vectorEffect", "vector-effect"],
    ["vertAdvY", "vert-adv-y"],
    ["vertOriginX", "vert-origin-x"],
    ["vertOriginY", "vert-origin-y"],
    ["wordSpacing", "word-spacing"],
    ["writingMode", "writing-mode"],
    ["xmlnsXlink", "xmlns:xlink"],
    ["xHeight", "x-height"]
  ]),
  matchHtmlRegExp = /["'&<>]/;
function escapeTextForBrowser(text) {
  if (
    "boolean" === typeof text ||
    "number" === typeof text ||
    "bigint" === typeof text
  )
    return "" + text;
  text = "" + text;
  var match = matchHtmlRegExp.exec(text);
  if (match) {
    var html = "",
      index,
      lastIndex = 0;
    for (index = match.index; index < text.length; index++) {
      switch (text.charCodeAt(index)) {
        case 34:
          match = "&quot;";
          break;
        case 38:
          match = "&amp;";
          break;
        case 39:
          match = "&#x27;";
          break;
        case 60:
          match = "&lt;";
          break;
        case 62:
          match = "&gt;";
          break;
        default:
          continue;
      }
      lastIndex !== index && (html += text.slice(lastIndex, index));
      lastIndex = index + 1;
      html += match;
    }
    text = lastIndex !== index ? html + text.slice(lastIndex, index) : html;
  }
  return text;
}
var uppercasePattern = /([A-Z])/g,
  msPattern = /^ms-/,
  isJavaScriptProtocol =
    /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
function sanitizeURL(url) {
  return isJavaScriptProtocol.test("" + url)
    ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
    : url;
}
var ReactSharedInternals =
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  ReactDOMSharedInternals =
    ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  sharedNotPendingObject = {
    pending: !1,
    data: null,
    method: null,
    action: null
  },
  previousDispatcher = ReactDOMSharedInternals.d;
ReactDOMSharedInternals.d = {
  f: previousDispatcher.f,
  r: previousDispatcher.r,
  D: prefetchDNS,
  C: preconnect,
  L: preload,
  m: preloadModule,
  X: preinitScript,
  S: preinitStyle,
  M: preinitModuleScript
};
var PRELOAD_NO_CREDS = [],
  dataElementQuotedEnd = stringToPrecomputedChunk('"></template>'),
  startInlineScript = stringToPrecomputedChunk("<script>"),
  endInlineScript = stringToPrecomputedChunk("\x3c/script>"),
  startScriptSrc = stringToPrecomputedChunk('<script src="'),
  startModuleSrc = stringToPrecomputedChunk('<script type="module" src="'),
  scriptNonce = stringToPrecomputedChunk('" nonce="'),
  scriptIntegirty = stringToPrecomputedChunk('" integrity="'),
  scriptCrossOrigin = stringToPrecomputedChunk('" crossorigin="'),
  endAsyncScript = stringToPrecomputedChunk('" async="">\x3c/script>'),
  scriptRegex = /(<\/|<)(s)(cript)/gi;
function scriptReplacer(match, prefix, s, suffix) {
  return "" + prefix + ("s" === s ? "\\u0073" : "\\u0053") + suffix;
}
var importMapScriptStart = stringToPrecomputedChunk(
    '<script type="importmap">'
  ),
  importMapScriptEnd = stringToPrecomputedChunk("\x3c/script>");
function createRenderState(
  resumableState,
  nonce,
  externalRuntimeConfig,
  importMap,
  onHeaders,
  maxHeadersLength
) {
  var inlineScriptWithNonce =
      void 0 === nonce
        ? startInlineScript
        : stringToPrecomputedChunk(
            '<script nonce="' + escapeTextForBrowser(nonce) + '">'
          ),
    idPrefix = resumableState.idPrefix,
    bootstrapChunks = [],
    externalRuntimeScript = null,
    bootstrapScriptContent = resumableState.bootstrapScriptContent,
    bootstrapScripts = resumableState.bootstrapScripts,
    bootstrapModules = resumableState.bootstrapModules;
  void 0 !== bootstrapScriptContent &&
    bootstrapChunks.push(
      inlineScriptWithNonce,
      stringToChunk(
        ("" + bootstrapScriptContent).replace(scriptRegex, scriptReplacer)
      ),
      endInlineScript
    );
  void 0 !== externalRuntimeConfig &&
    ("string" === typeof externalRuntimeConfig
      ? ((externalRuntimeScript = { src: externalRuntimeConfig, chunks: [] }),
        pushScriptImpl(externalRuntimeScript.chunks, {
          src: externalRuntimeConfig,
          async: !0,
          integrity: void 0,
          nonce: nonce
        }))
      : ((externalRuntimeScript = {
          src: externalRuntimeConfig.src,
          chunks: []
        }),
        pushScriptImpl(externalRuntimeScript.chunks, {
          src: externalRuntimeConfig.src,
          async: !0,
          integrity: externalRuntimeConfig.integrity,
          nonce: nonce
        })));
  externalRuntimeConfig = [];
  void 0 !== importMap &&
    (externalRuntimeConfig.push(importMapScriptStart),
    externalRuntimeConfig.push(
      stringToChunk(
        ("" + JSON.stringify(importMap)).replace(scriptRegex, scriptReplacer)
      )
    ),
    externalRuntimeConfig.push(importMapScriptEnd));
  importMap = onHeaders
    ? {
        preconnects: "",
        fontPreloads: "",
        highImagePreloads: "",
        remainingCapacity:
          2 + ("number" === typeof maxHeadersLength ? maxHeadersLength : 2e3)
      }
    : null;
  onHeaders = {
    placeholderPrefix: stringToPrecomputedChunk(idPrefix + "P:"),
    segmentPrefix: stringToPrecomputedChunk(idPrefix + "S:"),
    boundaryPrefix: stringToPrecomputedChunk(idPrefix + "B:"),
    startInlineScript: inlineScriptWithNonce,
    htmlChunks: null,
    headChunks: null,
    externalRuntimeScript: externalRuntimeScript,
    bootstrapChunks: bootstrapChunks,
    importMapChunks: externalRuntimeConfig,
    onHeaders: onHeaders,
    headers: importMap,
    resets: {
      font: {},
      dns: {},
      connect: { default: {}, anonymous: {}, credentials: {} },
      image: {},
      style: {}
    },
    charsetChunks: [],
    viewportChunks: [],
    hoistableChunks: [],
    preconnects: new Set(),
    fontPreloads: new Set(),
    highImagePreloads: new Set(),
    styles: new Map(),
    bootstrapScripts: new Set(),
    scripts: new Set(),
    bulkPreloads: new Set(),
    preloads: {
      images: new Map(),
      stylesheets: new Map(),
      scripts: new Map(),
      moduleScripts: new Map()
    },
    nonce: nonce,
    hoistableState: null,
    stylesToHoist: !1
  };
  if (void 0 !== bootstrapScripts)
    for (
      inlineScriptWithNonce = 0;
      inlineScriptWithNonce < bootstrapScripts.length;
      inlineScriptWithNonce++
    )
      (externalRuntimeConfig = bootstrapScripts[inlineScriptWithNonce]),
        (importMap = externalRuntimeScript = void 0),
        (maxHeadersLength = {
          rel: "preload",
          as: "script",
          fetchPriority: "low",
          nonce: nonce
        }),
        "string" === typeof externalRuntimeConfig
          ? (maxHeadersLength.href = idPrefix = externalRuntimeConfig)
          : ((maxHeadersLength.href = idPrefix = externalRuntimeConfig.src),
            (maxHeadersLength.integrity = importMap =
              "string" === typeof externalRuntimeConfig.integrity
                ? externalRuntimeConfig.integrity
                : void 0),
            (maxHeadersLength.crossOrigin = externalRuntimeScript =
              "string" === typeof externalRuntimeConfig ||
              null == externalRuntimeConfig.crossOrigin
                ? void 0
                : "use-credentials" === externalRuntimeConfig.crossOrigin
                  ? "use-credentials"
                  : "")),
        (externalRuntimeConfig = resumableState),
        (bootstrapScriptContent = idPrefix),
        (externalRuntimeConfig.scriptResources[bootstrapScriptContent] = null),
        (externalRuntimeConfig.moduleScriptResources[bootstrapScriptContent] =
          null),
        (externalRuntimeConfig = []),
        pushLinkImpl(externalRuntimeConfig, maxHeadersLength),
        onHeaders.bootstrapScripts.add(externalRuntimeConfig),
        bootstrapChunks.push(
          startScriptSrc,
          stringToChunk(escapeTextForBrowser(idPrefix))
        ),
        nonce &&
          bootstrapChunks.push(
            scriptNonce,
            stringToChunk(escapeTextForBrowser(nonce))
          ),
        "string" === typeof importMap &&
          bootstrapChunks.push(
            scriptIntegirty,
            stringToChunk(escapeTextForBrowser(importMap))
          ),
        "string" === typeof externalRuntimeScript &&
          bootstrapChunks.push(
            scriptCrossOrigin,
            stringToChunk(escapeTextForBrowser(externalRuntimeScript))
          ),
        bootstrapChunks.push(endAsyncScript);
  if (void 0 !== bootstrapModules)
    for (
      bootstrapScripts = 0;
      bootstrapScripts < bootstrapModules.length;
      bootstrapScripts++
    )
      (maxHeadersLength = bootstrapModules[bootstrapScripts]),
        (externalRuntimeScript = idPrefix = void 0),
        (importMap = {
          rel: "modulepreload",
          fetchPriority: "low",
          nonce: nonce
        }),
        "string" === typeof maxHeadersLength
          ? (importMap.href = inlineScriptWithNonce = maxHeadersLength)
          : ((importMap.href = inlineScriptWithNonce = maxHeadersLength.src),
            (importMap.integrity = externalRuntimeScript =
              "string" === typeof maxHeadersLength.integrity
                ? maxHeadersLength.integrity
                : void 0),
            (importMap.crossOrigin = idPrefix =
              "string" === typeof maxHeadersLength ||
              null == maxHeadersLength.crossOrigin
                ? void 0
                : "use-credentials" === maxHeadersLength.crossOrigin
                  ? "use-credentials"
                  : "")),
        (maxHeadersLength = resumableState),
        (externalRuntimeConfig = inlineScriptWithNonce),
        (maxHeadersLength.scriptResources[externalRuntimeConfig] = null),
        (maxHeadersLength.moduleScriptResources[externalRuntimeConfig] = null),
        (maxHeadersLength = []),
        pushLinkImpl(maxHeadersLength, importMap),
        onHeaders.bootstrapScripts.add(maxHeadersLength),
        bootstrapChunks.push(
          startModuleSrc,
          stringToChunk(escapeTextForBrowser(inlineScriptWithNonce))
        ),
        nonce &&
          bootstrapChunks.push(
            scriptNonce,
            stringToChunk(escapeTextForBrowser(nonce))
          ),
        "string" === typeof externalRuntimeScript &&
          bootstrapChunks.push(
            scriptIntegirty,
            stringToChunk(escapeTextForBrowser(externalRuntimeScript))
          ),
        "string" === typeof idPrefix &&
          bootstrapChunks.push(
            scriptCrossOrigin,
            stringToChunk(escapeTextForBrowser(idPrefix))
          ),
        bootstrapChunks.push(endAsyncScript);
  return onHeaders;
}
function createResumableState(
  identifierPrefix,
  externalRuntimeConfig,
  bootstrapScriptContent,
  bootstrapScripts,
  bootstrapModules
) {
  var streamingFormat = 0;
  void 0 !== externalRuntimeConfig && (streamingFormat = 1);
  return {
    idPrefix: void 0 === identifierPrefix ? "" : identifierPrefix,
    nextFormID: 0,
    streamingFormat: streamingFormat,
    bootstrapScriptContent: bootstrapScriptContent,
    bootstrapScripts: bootstrapScripts,
    bootstrapModules: bootstrapModules,
    instructions: 0,
    hasBody: !1,
    hasHtml: !1,
    unknownResources: {},
    dnsResources: {},
    connectResources: { default: {}, anonymous: {}, credentials: {} },
    imageResources: {},
    styleResources: {},
    scriptResources: {},
    moduleUnknownResources: {},
    moduleScriptResources: {}
  };
}
function createFormatContext(insertionMode, selectedValue, tagScope) {
  return {
    insertionMode: insertionMode,
    selectedValue: selectedValue,
    tagScope: tagScope
  };
}
function createRootFormatContext(namespaceURI) {
  return createFormatContext(
    "http://www.w3.org/2000/svg" === namespaceURI
      ? 3
      : "http://www.w3.org/1998/Math/MathML" === namespaceURI
        ? 4
        : 0,
    null,
    0
  );
}
function getChildFormatContext(parentContext, type, props) {
  switch (type) {
    case "noscript":
      return createFormatContext(2, null, parentContext.tagScope | 1);
    case "select":
      return createFormatContext(
        2,
        null != props.value ? props.value : props.defaultValue,
        parentContext.tagScope
      );
    case "svg":
      return createFormatContext(3, null, parentContext.tagScope);
    case "picture":
      return createFormatContext(2, null, parentContext.tagScope | 2);
    case "math":
      return createFormatContext(4, null, parentContext.tagScope);
    case "foreignObject":
      return createFormatContext(2, null, parentContext.tagScope);
    case "table":
      return createFormatContext(5, null, parentContext.tagScope);
    case "thead":
    case "tbody":
    case "tfoot":
      return createFormatContext(6, null, parentContext.tagScope);
    case "colgroup":
      return createFormatContext(8, null, parentContext.tagScope);
    case "tr":
      return createFormatContext(7, null, parentContext.tagScope);
  }
  return 5 <= parentContext.insertionMode
    ? createFormatContext(2, null, parentContext.tagScope)
    : 0 === parentContext.insertionMode
      ? "html" === type
        ? createFormatContext(1, null, parentContext.tagScope)
        : createFormatContext(2, null, parentContext.tagScope)
      : 1 === parentContext.insertionMode
        ? createFormatContext(2, null, parentContext.tagScope)
        : parentContext;
}
var textSeparator = stringToPrecomputedChunk("\x3c!-- --\x3e");
function pushTextInstance(target, text, renderState, textEmbedded) {
  if ("" === text) return textEmbedded;
  textEmbedded && target.push(textSeparator);
  target.push(stringToChunk(escapeTextForBrowser(text)));
  return !0;
}
var styleNameCache = new Map(),
  styleAttributeStart = stringToPrecomputedChunk(' style="'),
  styleAssign = stringToPrecomputedChunk(":"),
  styleSeparator = stringToPrecomputedChunk(";");
function pushStyleAttribute(target, style) {
  if ("object" !== typeof style)
    throw Error(
      "The `style` prop expects a mapping from style properties to values, not a string. For example, style={{marginRight: spacing + 'em'}} when using JSX."
    );
  var isFirst = !0,
    styleName;
  for (styleName in style)
    if (hasOwnProperty.call(style, styleName)) {
      var styleValue = style[styleName];
      if (
        null != styleValue &&
        "boolean" !== typeof styleValue &&
        "" !== styleValue
      ) {
        if (0 === styleName.indexOf("--")) {
          var nameChunk = stringToChunk(escapeTextForBrowser(styleName));
          styleValue = stringToChunk(
            escapeTextForBrowser(("" + styleValue).trim())
          );
        } else
          (nameChunk = styleNameCache.get(styleName)),
            void 0 === nameChunk &&
              ((nameChunk = stringToPrecomputedChunk(
                escapeTextForBrowser(
                  styleName
                    .replace(uppercasePattern, "-$1")
                    .toLowerCase()
                    .replace(msPattern, "-ms-")
                )
              )),
              styleNameCache.set(styleName, nameChunk)),
            (styleValue =
              "number" === typeof styleValue
                ? 0 === styleValue || unitlessNumbers.has(styleName)
                  ? stringToChunk("" + styleValue)
                  : stringToChunk(styleValue + "px")
                : stringToChunk(
                    escapeTextForBrowser(("" + styleValue).trim())
                  ));
        isFirst
          ? ((isFirst = !1),
            target.push(
              styleAttributeStart,
              nameChunk,
              styleAssign,
              styleValue
            ))
          : target.push(styleSeparator, nameChunk, styleAssign, styleValue);
      }
    }
  isFirst || target.push(attributeEnd);
}
var attributeSeparator = stringToPrecomputedChunk(" "),
  attributeAssign = stringToPrecomputedChunk('="'),
  attributeEnd = stringToPrecomputedChunk('"'),
  attributeEmptyString = stringToPrecomputedChunk('=""');
function pushBooleanAttribute(target, name, value) {
  value &&
    "function" !== typeof value &&
    "symbol" !== typeof value &&
    target.push(attributeSeparator, stringToChunk(name), attributeEmptyString);
}
function pushStringAttribute(target, name, value) {
  "function" !== typeof value &&
    "symbol" !== typeof value &&
    "boolean" !== typeof value &&
    target.push(
      attributeSeparator,
      stringToChunk(name),
      attributeAssign,
      stringToChunk(escapeTextForBrowser(value)),
      attributeEnd
    );
}
var actionJavaScriptURL = stringToPrecomputedChunk(
    escapeTextForBrowser(
      "javascript:throw new Error('React form unexpectedly submitted.')"
    )
  ),
  startHiddenInputChunk = stringToPrecomputedChunk('<input type="hidden"');
function pushAdditionalFormField(value, key) {
  this.push(startHiddenInputChunk);
  validateAdditionalFormField(value);
  pushStringAttribute(this, "name", key);
  pushStringAttribute(this, "value", value);
  this.push(endOfStartTagSelfClosing);
}
function validateAdditionalFormField(value) {
  if ("string" !== typeof value)
    throw Error(
      "File/Blob fields are not yet supported in progressive forms. Will fallback to client hydration."
    );
}
function getCustomFormFields(resumableState, formAction) {
  if ("function" === typeof formAction.$$FORM_ACTION) {
    var id = resumableState.nextFormID++;
    resumableState = resumableState.idPrefix + id;
    try {
      var customFields = formAction.$$FORM_ACTION(resumableState);
      if (customFields) {
        var formData = customFields.data;
        null != formData && formData.forEach(validateAdditionalFormField);
      }
      return customFields;
    } catch (x) {
      if ("object" === typeof x && null !== x && "function" === typeof x.then)
        throw x;
    }
  }
  return null;
}
function pushFormActionAttribute(
  target,
  resumableState,
  renderState,
  formAction,
  formEncType,
  formMethod,
  formTarget,
  name
) {
  var formData = null;
  if ("function" === typeof formAction) {
    var customFields = getCustomFormFields(resumableState, formAction);
    null !== customFields
      ? ((name = customFields.name),
        (formAction = customFields.action || ""),
        (formEncType = customFields.encType),
        (formMethod = customFields.method),
        (formTarget = customFields.target),
        (formData = customFields.data))
      : (target.push(
          attributeSeparator,
          stringToChunk("formAction"),
          attributeAssign,
          actionJavaScriptURL,
          attributeEnd
        ),
        (formTarget = formMethod = formEncType = formAction = name = null),
        injectFormReplayingRuntime(resumableState, renderState));
  }
  null != name && pushAttribute(target, "name", name);
  null != formAction && pushAttribute(target, "formAction", formAction);
  null != formEncType && pushAttribute(target, "formEncType", formEncType);
  null != formMethod && pushAttribute(target, "formMethod", formMethod);
  null != formTarget && pushAttribute(target, "formTarget", formTarget);
  return formData;
}
function pushAttribute(target, name, value) {
  switch (name) {
    case "className":
      pushStringAttribute(target, "class", value);
      break;
    case "tabIndex":
      pushStringAttribute(target, "tabindex", value);
      break;
    case "dir":
    case "role":
    case "viewBox":
    case "width":
    case "height":
      pushStringAttribute(target, name, value);
      break;
    case "style":
      pushStyleAttribute(target, value);
      break;
    case "src":
    case "href":
      if ("" === value) break;
    case "action":
    case "formAction":
      if (
        null == value ||
        "function" === typeof value ||
        "symbol" === typeof value ||
        "boolean" === typeof value
      )
        break;
      value = sanitizeURL("" + value);
      target.push(
        attributeSeparator,
        stringToChunk(name),
        attributeAssign,
        stringToChunk(escapeTextForBrowser(value)),
        attributeEnd
      );
      break;
    case "defaultValue":
    case "defaultChecked":
    case "innerHTML":
    case "suppressContentEditableWarning":
    case "suppressHydrationWarning":
    case "ref":
      break;
    case "autoFocus":
    case "multiple":
    case "muted":
      pushBooleanAttribute(target, name.toLowerCase(), value);
      break;
    case "xlinkHref":
      if (
        "function" === typeof value ||
        "symbol" === typeof value ||
        "boolean" === typeof value
      )
        break;
      value = sanitizeURL("" + value);
      target.push(
        attributeSeparator,
        stringToChunk("xlink:href"),
        attributeAssign,
        stringToChunk(escapeTextForBrowser(value)),
        attributeEnd
      );
      break;
    case "contentEditable":
    case "spellCheck":
    case "draggable":
    case "value":
    case "autoReverse":
    case "externalResourcesRequired":
    case "focusable":
    case "preserveAlpha":
      "function" !== typeof value &&
        "symbol" !== typeof value &&
        target.push(
          attributeSeparator,
          stringToChunk(name),
          attributeAssign,
          stringToChunk(escapeTextForBrowser(value)),
          attributeEnd
        );
      break;
    case "inert":
    case "allowFullScreen":
    case "async":
    case "autoPlay":
    case "controls":
    case "default":
    case "defer":
    case "disabled":
    case "disablePictureInPicture":
    case "disableRemotePlayback":
    case "formNoValidate":
    case "hidden":
    case "loop":
    case "noModule":
    case "noValidate":
    case "open":
    case "playsInline":
    case "readOnly":
    case "required":
    case "reversed":
    case "scoped":
    case "seamless":
    case "itemScope":
      value &&
        "function" !== typeof value &&
        "symbol" !== typeof value &&
        target.push(
          attributeSeparator,
          stringToChunk(name),
          attributeEmptyString
        );
      break;
    case "capture":
    case "download":
      !0 === value
        ? target.push(
            attributeSeparator,
            stringToChunk(name),
            attributeEmptyString
          )
        : !1 !== value &&
          "function" !== typeof value &&
          "symbol" !== typeof value &&
          target.push(
            attributeSeparator,
            stringToChunk(name),
            attributeAssign,
            stringToChunk(escapeTextForBrowser(value)),
            attributeEnd
          );
      break;
    case "cols":
    case "rows":
    case "size":
    case "span":
      "function" !== typeof value &&
        "symbol" !== typeof value &&
        !isNaN(value) &&
        1 <= value &&
        target.push(
          attributeSeparator,
          stringToChunk(name),
          attributeAssign,
          stringToChunk(escapeTextForBrowser(value)),
          attributeEnd
        );
      break;
    case "rowSpan":
    case "start":
      "function" === typeof value ||
        "symbol" === typeof value ||
        isNaN(value) ||
        target.push(
          attributeSeparator,
          stringToChunk(name),
          attributeAssign,
          stringToChunk(escapeTextForBrowser(value)),
          attributeEnd
        );
      break;
    case "xlinkActuate":
      pushStringAttribute(target, "xlink:actuate", value);
      break;
    case "xlinkArcrole":
      pushStringAttribute(target, "xlink:arcrole", value);
      break;
    case "xlinkRole":
      pushStringAttribute(target, "xlink:role", value);
      break;
    case "xlinkShow":
      pushStringAttribute(target, "xlink:show", value);
      break;
    case "xlinkTitle":
      pushStringAttribute(target, "xlink:title", value);
      break;
    case "xlinkType":
      pushStringAttribute(target, "xlink:type", value);
      break;
    case "xmlBase":
      pushStringAttribute(target, "xml:base", value);
      break;
    case "xmlLang":
      pushStringAttribute(target, "xml:lang", value);
      break;
    case "xmlSpace":
      pushStringAttribute(target, "xml:space", value);
      break;
    default:
      if (
        !(2 < name.length) ||
        ("o" !== name[0] && "O" !== name[0]) ||
        ("n" !== name[1] && "N" !== name[1])
      )
        if (((name = aliases.get(name) || name), isAttributeNameSafe(name))) {
          switch (typeof value) {
            case "function":
            case "symbol":
              return;
            case "boolean":
              var prefix$8 = name.toLowerCase().slice(0, 5);
              if ("data-" !== prefix$8 && "aria-" !== prefix$8) return;
          }
          target.push(
            attributeSeparator,
            stringToChunk(name),
            attributeAssign,
            stringToChunk(escapeTextForBrowser(value)),
            attributeEnd
          );
        }
  }
}
var endOfStartTag = stringToPrecomputedChunk(">"),
  endOfStartTagSelfClosing = stringToPrecomputedChunk("/>");
function pushInnerHTML(target, innerHTML, children) {
  if (null != innerHTML) {
    if (null != children)
      throw Error(
        "Can only set one of `children` or `props.dangerouslySetInnerHTML`."
      );
    if ("object" !== typeof innerHTML || !("__html" in innerHTML))
      throw Error(
        "`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information."
      );
    innerHTML = innerHTML.__html;
    null !== innerHTML &&
      void 0 !== innerHTML &&
      target.push(stringToChunk("" + innerHTML));
  }
}
function flattenOptionChildren(children) {
  var content = "";
  React.Children.forEach(children, function (child) {
    null != child && (content += child);
  });
  return content;
}
var selectedMarkerAttribute = stringToPrecomputedChunk(' selected=""'),
  formReplayingRuntimeScript = stringToPrecomputedChunk(
    'addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error(\'React form unexpectedly submitted.\')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});'
  );
function injectFormReplayingRuntime(resumableState, renderState) {
  0 !== (resumableState.instructions & 16) ||
    renderState.externalRuntimeScript ||
    ((resumableState.instructions |= 16),
    renderState.bootstrapChunks.unshift(
      renderState.startInlineScript,
      formReplayingRuntimeScript,
      endInlineScript
    ));
}
var formStateMarkerIsMatching = stringToPrecomputedChunk("\x3c!--F!--\x3e"),
  formStateMarkerIsNotMatching = stringToPrecomputedChunk("\x3c!--F--\x3e");
function pushLinkImpl(target, props) {
  target.push(startChunkForTag("link"));
  for (var propKey in props)
    if (hasOwnProperty.call(props, propKey)) {
      var propValue = props[propKey];
      if (null != propValue)
        switch (propKey) {
          case "children":
          case "dangerouslySetInnerHTML":
            throw Error(
              "link is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
            );
          default:
            pushAttribute(target, propKey, propValue);
        }
    }
  target.push(endOfStartTagSelfClosing);
  return null;
}
var styleRegex = /(<\/|<)(s)(tyle)/gi;
function styleReplacer(match, prefix, s, suffix) {
  return "" + prefix + ("s" === s ? "\\73 " : "\\53 ") + suffix;
}
function pushSelfClosing(target, props, tag) {
  target.push(startChunkForTag(tag));
  for (var propKey in props)
    if (hasOwnProperty.call(props, propKey)) {
      var propValue = props[propKey];
      if (null != propValue)
        switch (propKey) {
          case "children":
          case "dangerouslySetInnerHTML":
            throw Error(
              tag +
                " is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
            );
          default:
            pushAttribute(target, propKey, propValue);
        }
    }
  target.push(endOfStartTagSelfClosing);
  return null;
}
function pushTitleImpl(target, props) {
  target.push(startChunkForTag("title"));
  var children = null,
    innerHTML = null,
    propKey;
  for (propKey in props)
    if (hasOwnProperty.call(props, propKey)) {
      var propValue = props[propKey];
      if (null != propValue)
        switch (propKey) {
          case "children":
            children = propValue;
            break;
          case "dangerouslySetInnerHTML":
            innerHTML = propValue;
            break;
          default:
            pushAttribute(target, propKey, propValue);
        }
    }
  target.push(endOfStartTag);
  props = Array.isArray(children)
    ? 2 > children.length
      ? children[0]
      : null
    : children;
  "function" !== typeof props &&
    "symbol" !== typeof props &&
    null !== props &&
    void 0 !== props &&
    target.push(stringToChunk(escapeTextForBrowser("" + props)));
  pushInnerHTML(target, innerHTML, children);
  target.push(endChunkForTag("title"));
  return null;
}
function pushScriptImpl(target, props) {
  target.push(startChunkForTag("script"));
  var children = null,
    innerHTML = null,
    propKey;
  for (propKey in props)
    if (hasOwnProperty.call(props, propKey)) {
      var propValue = props[propKey];
      if (null != propValue)
        switch (propKey) {
          case "children":
            children = propValue;
            break;
          case "dangerouslySetInnerHTML":
            innerHTML = propValue;
            break;
          default:
            pushAttribute(target, propKey, propValue);
        }
    }
  target.push(endOfStartTag);
  pushInnerHTML(target, innerHTML, children);
  "string" === typeof children &&
    target.push(
      stringToChunk(("" + children).replace(scriptRegex, scriptReplacer))
    );
  target.push(endChunkForTag("script"));
  return null;
}
function pushStartGenericElement(target, props, tag) {
  target.push(startChunkForTag(tag));
  var innerHTML = (tag = null),
    propKey;
  for (propKey in props)
    if (hasOwnProperty.call(props, propKey)) {
      var propValue = props[propKey];
      if (null != propValue)
        switch (propKey) {
          case "children":
            tag = propValue;
            break;
          case "dangerouslySetInnerHTML":
            innerHTML = propValue;
            break;
          default:
            pushAttribute(target, propKey, propValue);
        }
    }
  target.push(endOfStartTag);
  pushInnerHTML(target, innerHTML, tag);
  return "string" === typeof tag
    ? (target.push(stringToChunk(escapeTextForBrowser(tag))), null)
    : tag;
}
var leadingNewline = stringToPrecomputedChunk("\n"),
  VALID_TAG_REGEX = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/,
  validatedTagCache = new Map();
function startChunkForTag(tag) {
  var tagStartChunk = validatedTagCache.get(tag);
  if (void 0 === tagStartChunk) {
    if (!VALID_TAG_REGEX.test(tag)) throw Error("Invalid tag: " + tag);
    tagStartChunk = stringToPrecomputedChunk("<" + tag);
    validatedTagCache.set(tag, tagStartChunk);
  }
  return tagStartChunk;
}
var doctypeChunk = stringToPrecomputedChunk("<!DOCTYPE html>");
function pushStartInstance(
  target$jscomp$0,
  type,
  props,
  resumableState,
  renderState,
  hoistableState,
  formatContext,
  textEmbedded,
  isFallback
) {
  switch (type) {
    case "div":
    case "span":
    case "svg":
    case "path":
      break;
    case "a":
      target$jscomp$0.push(startChunkForTag("a"));
      var children = null,
        innerHTML = null,
        propKey;
      for (propKey in props)
        if (hasOwnProperty.call(props, propKey)) {
          var propValue = props[propKey];
          if (null != propValue)
            switch (propKey) {
              case "children":
                children = propValue;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML = propValue;
                break;
              case "href":
                "" === propValue
                  ? pushStringAttribute(target$jscomp$0, "href", "")
                  : pushAttribute(target$jscomp$0, propKey, propValue);
                break;
              default:
                pushAttribute(target$jscomp$0, propKey, propValue);
            }
        }
      target$jscomp$0.push(endOfStartTag);
      pushInnerHTML(target$jscomp$0, innerHTML, children);
      if ("string" === typeof children) {
        target$jscomp$0.push(stringToChunk(escapeTextForBrowser(children)));
        var JSCompiler_inline_result = null;
      } else JSCompiler_inline_result = children;
      return JSCompiler_inline_result;
    case "g":
    case "p":
    case "li":
      break;
    case "select":
      target$jscomp$0.push(startChunkForTag("select"));
      var children$jscomp$0 = null,
        innerHTML$jscomp$0 = null,
        propKey$jscomp$0;
      for (propKey$jscomp$0 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$0)) {
          var propValue$jscomp$0 = props[propKey$jscomp$0];
          if (null != propValue$jscomp$0)
            switch (propKey$jscomp$0) {
              case "children":
                children$jscomp$0 = propValue$jscomp$0;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML$jscomp$0 = propValue$jscomp$0;
                break;
              case "defaultValue":
              case "value":
                break;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$0,
                  propValue$jscomp$0
                );
            }
        }
      target$jscomp$0.push(endOfStartTag);
      pushInnerHTML(target$jscomp$0, innerHTML$jscomp$0, children$jscomp$0);
      return children$jscomp$0;
    case "option":
      var selectedValue = formatContext.selectedValue;
      target$jscomp$0.push(startChunkForTag("option"));
      var children$jscomp$1 = null,
        value = null,
        selected = null,
        innerHTML$jscomp$1 = null,
        propKey$jscomp$1;
      for (propKey$jscomp$1 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$1)) {
          var propValue$jscomp$1 = props[propKey$jscomp$1];
          if (null != propValue$jscomp$1)
            switch (propKey$jscomp$1) {
              case "children":
                children$jscomp$1 = propValue$jscomp$1;
                break;
              case "selected":
                selected = propValue$jscomp$1;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML$jscomp$1 = propValue$jscomp$1;
                break;
              case "value":
                value = propValue$jscomp$1;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$1,
                  propValue$jscomp$1
                );
            }
        }
      if (null != selectedValue) {
        var stringValue =
          null !== value
            ? "" + value
            : flattenOptionChildren(children$jscomp$1);
        if (isArrayImpl(selectedValue))
          for (var i = 0; i < selectedValue.length; i++) {
            if ("" + selectedValue[i] === stringValue) {
              target$jscomp$0.push(selectedMarkerAttribute);
              break;
            }
          }
        else
          "" + selectedValue === stringValue &&
            target$jscomp$0.push(selectedMarkerAttribute);
      } else selected && target$jscomp$0.push(selectedMarkerAttribute);
      target$jscomp$0.push(endOfStartTag);
      pushInnerHTML(target$jscomp$0, innerHTML$jscomp$1, children$jscomp$1);
      return children$jscomp$1;
    case "textarea":
      target$jscomp$0.push(startChunkForTag("textarea"));
      var value$jscomp$0 = null,
        defaultValue = null,
        children$jscomp$2 = null,
        propKey$jscomp$2;
      for (propKey$jscomp$2 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$2)) {
          var propValue$jscomp$2 = props[propKey$jscomp$2];
          if (null != propValue$jscomp$2)
            switch (propKey$jscomp$2) {
              case "children":
                children$jscomp$2 = propValue$jscomp$2;
                break;
              case "value":
                value$jscomp$0 = propValue$jscomp$2;
                break;
              case "defaultValue":
                defaultValue = propValue$jscomp$2;
                break;
              case "dangerouslySetInnerHTML":
                throw Error(
                  "`dangerouslySetInnerHTML` does not make sense on <textarea>."
                );
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$2,
                  propValue$jscomp$2
                );
            }
        }
      null === value$jscomp$0 &&
        null !== defaultValue &&
        (value$jscomp$0 = defaultValue);
      target$jscomp$0.push(endOfStartTag);
      if (null != children$jscomp$2) {
        if (null != value$jscomp$0)
          throw Error(
            "If you supply `defaultValue` on a <textarea>, do not pass children."
          );
        if (isArrayImpl(children$jscomp$2)) {
          if (1 < children$jscomp$2.length)
            throw Error("<textarea> can only have at most one child.");
          value$jscomp$0 = "" + children$jscomp$2[0];
        }
        value$jscomp$0 = "" + children$jscomp$2;
      }
      "string" === typeof value$jscomp$0 &&
        "\n" === value$jscomp$0[0] &&
        target$jscomp$0.push(leadingNewline);
      null !== value$jscomp$0 &&
        target$jscomp$0.push(
          stringToChunk(escapeTextForBrowser("" + value$jscomp$0))
        );
      return null;
    case "input":
      target$jscomp$0.push(startChunkForTag("input"));
      var name = null,
        formAction = null,
        formEncType = null,
        formMethod = null,
        formTarget = null,
        value$jscomp$1 = null,
        defaultValue$jscomp$0 = null,
        checked = null,
        defaultChecked = null,
        propKey$jscomp$3;
      for (propKey$jscomp$3 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$3)) {
          var propValue$jscomp$3 = props[propKey$jscomp$3];
          if (null != propValue$jscomp$3)
            switch (propKey$jscomp$3) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  "input is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                );
              case "name":
                name = propValue$jscomp$3;
                break;
              case "formAction":
                formAction = propValue$jscomp$3;
                break;
              case "formEncType":
                formEncType = propValue$jscomp$3;
                break;
              case "formMethod":
                formMethod = propValue$jscomp$3;
                break;
              case "formTarget":
                formTarget = propValue$jscomp$3;
                break;
              case "defaultChecked":
                defaultChecked = propValue$jscomp$3;
                break;
              case "defaultValue":
                defaultValue$jscomp$0 = propValue$jscomp$3;
                break;
              case "checked":
                checked = propValue$jscomp$3;
                break;
              case "value":
                value$jscomp$1 = propValue$jscomp$3;
                break;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$3,
                  propValue$jscomp$3
                );
            }
        }
      var formData = pushFormActionAttribute(
        target$jscomp$0,
        resumableState,
        renderState,
        formAction,
        formEncType,
        formMethod,
        formTarget,
        name
      );
      null !== checked
        ? pushBooleanAttribute(target$jscomp$0, "checked", checked)
        : null !== defaultChecked &&
          pushBooleanAttribute(target$jscomp$0, "checked", defaultChecked);
      null !== value$jscomp$1
        ? pushAttribute(target$jscomp$0, "value", value$jscomp$1)
        : null !== defaultValue$jscomp$0 &&
          pushAttribute(target$jscomp$0, "value", defaultValue$jscomp$0);
      target$jscomp$0.push(endOfStartTagSelfClosing);
      null != formData &&
        formData.forEach(pushAdditionalFormField, target$jscomp$0);
      return null;
    case "button":
      target$jscomp$0.push(startChunkForTag("button"));
      var children$jscomp$3 = null,
        innerHTML$jscomp$2 = null,
        name$jscomp$0 = null,
        formAction$jscomp$0 = null,
        formEncType$jscomp$0 = null,
        formMethod$jscomp$0 = null,
        formTarget$jscomp$0 = null,
        propKey$jscomp$4;
      for (propKey$jscomp$4 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$4)) {
          var propValue$jscomp$4 = props[propKey$jscomp$4];
          if (null != propValue$jscomp$4)
            switch (propKey$jscomp$4) {
              case "children":
                children$jscomp$3 = propValue$jscomp$4;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML$jscomp$2 = propValue$jscomp$4;
                break;
              case "name":
                name$jscomp$0 = propValue$jscomp$4;
                break;
              case "formAction":
                formAction$jscomp$0 = propValue$jscomp$4;
                break;
              case "formEncType":
                formEncType$jscomp$0 = propValue$jscomp$4;
                break;
              case "formMethod":
                formMethod$jscomp$0 = propValue$jscomp$4;
                break;
              case "formTarget":
                formTarget$jscomp$0 = propValue$jscomp$4;
                break;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$4,
                  propValue$jscomp$4
                );
            }
        }
      var formData$jscomp$0 = pushFormActionAttribute(
        target$jscomp$0,
        resumableState,
        renderState,
        formAction$jscomp$0,
        formEncType$jscomp$0,
        formMethod$jscomp$0,
        formTarget$jscomp$0,
        name$jscomp$0
      );
      target$jscomp$0.push(endOfStartTag);
      null != formData$jscomp$0 &&
        formData$jscomp$0.forEach(pushAdditionalFormField, target$jscomp$0);
      pushInnerHTML(target$jscomp$0, innerHTML$jscomp$2, children$jscomp$3);
      if ("string" === typeof children$jscomp$3) {
        target$jscomp$0.push(
          stringToChunk(escapeTextForBrowser(children$jscomp$3))
        );
        var JSCompiler_inline_result$jscomp$0 = null;
      } else JSCompiler_inline_result$jscomp$0 = children$jscomp$3;
      return JSCompiler_inline_result$jscomp$0;
    case "form":
      target$jscomp$0.push(startChunkForTag("form"));
      var children$jscomp$4 = null,
        innerHTML$jscomp$3 = null,
        formAction$jscomp$1 = null,
        formEncType$jscomp$1 = null,
        formMethod$jscomp$1 = null,
        formTarget$jscomp$1 = null,
        propKey$jscomp$5;
      for (propKey$jscomp$5 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$5)) {
          var propValue$jscomp$5 = props[propKey$jscomp$5];
          if (null != propValue$jscomp$5)
            switch (propKey$jscomp$5) {
              case "children":
                children$jscomp$4 = propValue$jscomp$5;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML$jscomp$3 = propValue$jscomp$5;
                break;
              case "action":
                formAction$jscomp$1 = propValue$jscomp$5;
                break;
              case "encType":
                formEncType$jscomp$1 = propValue$jscomp$5;
                break;
              case "method":
                formMethod$jscomp$1 = propValue$jscomp$5;
                break;
              case "target":
                formTarget$jscomp$1 = propValue$jscomp$5;
                break;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$5,
                  propValue$jscomp$5
                );
            }
        }
      var formData$jscomp$1 = null,
        formActionName = null;
      if ("function" === typeof formAction$jscomp$1) {
        var customFields = getCustomFormFields(
          resumableState,
          formAction$jscomp$1
        );
        null !== customFields
          ? ((formAction$jscomp$1 = customFields.action || ""),
            (formEncType$jscomp$1 = customFields.encType),
            (formMethod$jscomp$1 = customFields.method),
            (formTarget$jscomp$1 = customFields.target),
            (formData$jscomp$1 = customFields.data),
            (formActionName = customFields.name))
          : (target$jscomp$0.push(
              attributeSeparator,
              stringToChunk("action"),
              attributeAssign,
              actionJavaScriptURL,
              attributeEnd
            ),
            (formTarget$jscomp$1 =
              formMethod$jscomp$1 =
              formEncType$jscomp$1 =
              formAction$jscomp$1 =
                null),
            injectFormReplayingRuntime(resumableState, renderState));
      }
      null != formAction$jscomp$1 &&
        pushAttribute(target$jscomp$0, "action", formAction$jscomp$1);
      null != formEncType$jscomp$1 &&
        pushAttribute(target$jscomp$0, "encType", formEncType$jscomp$1);
      null != formMethod$jscomp$1 &&
        pushAttribute(target$jscomp$0, "method", formMethod$jscomp$1);
      null != formTarget$jscomp$1 &&
        pushAttribute(target$jscomp$0, "target", formTarget$jscomp$1);
      target$jscomp$0.push(endOfStartTag);
      null !== formActionName &&
        (target$jscomp$0.push(startHiddenInputChunk),
        pushStringAttribute(target$jscomp$0, "name", formActionName),
        target$jscomp$0.push(endOfStartTagSelfClosing),
        null != formData$jscomp$1 &&
          formData$jscomp$1.forEach(pushAdditionalFormField, target$jscomp$0));
      pushInnerHTML(target$jscomp$0, innerHTML$jscomp$3, children$jscomp$4);
      if ("string" === typeof children$jscomp$4) {
        target$jscomp$0.push(
          stringToChunk(escapeTextForBrowser(children$jscomp$4))
        );
        var JSCompiler_inline_result$jscomp$1 = null;
      } else JSCompiler_inline_result$jscomp$1 = children$jscomp$4;
      return JSCompiler_inline_result$jscomp$1;
    case "menuitem":
      target$jscomp$0.push(startChunkForTag("menuitem"));
      for (var propKey$jscomp$6 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$6)) {
          var propValue$jscomp$6 = props[propKey$jscomp$6];
          if (null != propValue$jscomp$6)
            switch (propKey$jscomp$6) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  "menuitems cannot have `children` nor `dangerouslySetInnerHTML`."
                );
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$6,
                  propValue$jscomp$6
                );
            }
        }
      target$jscomp$0.push(endOfStartTag);
      return null;
    case "object":
      target$jscomp$0.push(startChunkForTag("object"));
      var children$jscomp$5 = null,
        innerHTML$jscomp$4 = null,
        propKey$jscomp$7;
      for (propKey$jscomp$7 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$7)) {
          var propValue$jscomp$7 = props[propKey$jscomp$7];
          if (null != propValue$jscomp$7)
            switch (propKey$jscomp$7) {
              case "children":
                children$jscomp$5 = propValue$jscomp$7;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML$jscomp$4 = propValue$jscomp$7;
                break;
              case "data":
                var sanitizedValue = sanitizeURL("" + propValue$jscomp$7);
                if ("" === sanitizedValue) break;
                target$jscomp$0.push(
                  attributeSeparator,
                  stringToChunk("data"),
                  attributeAssign,
                  stringToChunk(escapeTextForBrowser(sanitizedValue)),
                  attributeEnd
                );
                break;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$7,
                  propValue$jscomp$7
                );
            }
        }
      target$jscomp$0.push(endOfStartTag);
      pushInnerHTML(target$jscomp$0, innerHTML$jscomp$4, children$jscomp$5);
      if ("string" === typeof children$jscomp$5) {
        target$jscomp$0.push(
          stringToChunk(escapeTextForBrowser(children$jscomp$5))
        );
        var JSCompiler_inline_result$jscomp$2 = null;
      } else JSCompiler_inline_result$jscomp$2 = children$jscomp$5;
      return JSCompiler_inline_result$jscomp$2;
    case "title":
      if (
        3 === formatContext.insertionMode ||
        formatContext.tagScope & 1 ||
        null != props.itemProp
      )
        var JSCompiler_inline_result$jscomp$3 = pushTitleImpl(
          target$jscomp$0,
          props
        );
      else
        isFallback
          ? (JSCompiler_inline_result$jscomp$3 = null)
          : (pushTitleImpl(renderState.hoistableChunks, props),
            (JSCompiler_inline_result$jscomp$3 = void 0));
      return JSCompiler_inline_result$jscomp$3;
    case "link":
      var rel = props.rel,
        href = props.href,
        precedence = props.precedence;
      if (
        3 === formatContext.insertionMode ||
        formatContext.tagScope & 1 ||
        null != props.itemProp ||
        "string" !== typeof rel ||
        "string" !== typeof href ||
        "" === href
      ) {
        pushLinkImpl(target$jscomp$0, props);
        var JSCompiler_inline_result$jscomp$4 = null;
      } else if ("stylesheet" === props.rel)
        if (
          "string" !== typeof precedence ||
          null != props.disabled ||
          props.onLoad ||
          props.onError
        )
          JSCompiler_inline_result$jscomp$4 = pushLinkImpl(
            target$jscomp$0,
            props
          );
        else {
          var styleQueue = renderState.styles.get(precedence),
            resourceState = resumableState.styleResources.hasOwnProperty(href)
              ? resumableState.styleResources[href]
              : void 0;
          if (null !== resourceState) {
            resumableState.styleResources[href] = null;
            styleQueue ||
              ((styleQueue = {
                precedence: stringToChunk(escapeTextForBrowser(precedence)),
                rules: [],
                hrefs: [],
                sheets: new Map()
              }),
              renderState.styles.set(precedence, styleQueue));
            var resource = {
              state: 0,
              props: assign({}, props, {
                "data-precedence": props.precedence,
                precedence: null
              })
            };
            if (resourceState) {
              2 === resourceState.length &&
                adoptPreloadCredentials(resource.props, resourceState);
              var preloadResource = renderState.preloads.stylesheets.get(href);
              preloadResource && 0 < preloadResource.length
                ? (preloadResource.length = 0)
                : (resource.state = 1);
            }
            styleQueue.sheets.set(href, resource);
            hoistableState && hoistableState.stylesheets.add(resource);
          } else if (styleQueue) {
            var resource$9 = styleQueue.sheets.get(href);
            resource$9 &&
              hoistableState &&
              hoistableState.stylesheets.add(resource$9);
          }
          textEmbedded && target$jscomp$0.push(textSeparator);
          JSCompiler_inline_result$jscomp$4 = null;
        }
      else
        props.onLoad || props.onError
          ? (JSCompiler_inline_result$jscomp$4 = pushLinkImpl(
              target$jscomp$0,
              props
            ))
          : (textEmbedded && target$jscomp$0.push(textSeparator),
            (JSCompiler_inline_result$jscomp$4 = isFallback
              ? null
              : pushLinkImpl(renderState.hoistableChunks, props)));
      return JSCompiler_inline_result$jscomp$4;
    case "script":
      var asyncProp = props.async;
      if (
        "string" !== typeof props.src ||
        !props.src ||
        !asyncProp ||
        "function" === typeof asyncProp ||
        "symbol" === typeof asyncProp ||
        props.onLoad ||
        props.onError ||
        3 === formatContext.insertionMode ||
        formatContext.tagScope & 1 ||
        null != props.itemProp
      )
        var JSCompiler_inline_result$jscomp$5 = pushScriptImpl(
          target$jscomp$0,
          props
        );
      else {
        var key = props.src;
        if ("module" === props.type) {
          var resources = resumableState.moduleScriptResources;
          var preloads = renderState.preloads.moduleScripts;
        } else
          (resources = resumableState.scriptResources),
            (preloads = renderState.preloads.scripts);
        var resourceState$jscomp$0 = resources.hasOwnProperty(key)
          ? resources[key]
          : void 0;
        if (null !== resourceState$jscomp$0) {
          resources[key] = null;
          var scriptProps = props;
          if (resourceState$jscomp$0) {
            2 === resourceState$jscomp$0.length &&
              ((scriptProps = assign({}, props)),
              adoptPreloadCredentials(scriptProps, resourceState$jscomp$0));
            var preloadResource$jscomp$0 = preloads.get(key);
            preloadResource$jscomp$0 && (preloadResource$jscomp$0.length = 0);
          }
          var resource$jscomp$0 = [];
          renderState.scripts.add(resource$jscomp$0);
          pushScriptImpl(resource$jscomp$0, scriptProps);
        }
        textEmbedded && target$jscomp$0.push(textSeparator);
        JSCompiler_inline_result$jscomp$5 = null;
      }
      return JSCompiler_inline_result$jscomp$5;
    case "style":
      var precedence$jscomp$0 = props.precedence,
        href$jscomp$0 = props.href;
      if (
        3 === formatContext.insertionMode ||
        formatContext.tagScope & 1 ||
        null != props.itemProp ||
        "string" !== typeof precedence$jscomp$0 ||
        "string" !== typeof href$jscomp$0 ||
        "" === href$jscomp$0
      ) {
        target$jscomp$0.push(startChunkForTag("style"));
        var children$jscomp$6 = null,
          innerHTML$jscomp$5 = null,
          propKey$jscomp$8;
        for (propKey$jscomp$8 in props)
          if (hasOwnProperty.call(props, propKey$jscomp$8)) {
            var propValue$jscomp$8 = props[propKey$jscomp$8];
            if (null != propValue$jscomp$8)
              switch (propKey$jscomp$8) {
                case "children":
                  children$jscomp$6 = propValue$jscomp$8;
                  break;
                case "dangerouslySetInnerHTML":
                  innerHTML$jscomp$5 = propValue$jscomp$8;
                  break;
                default:
                  pushAttribute(
                    target$jscomp$0,
                    propKey$jscomp$8,
                    propValue$jscomp$8
                  );
              }
          }
        target$jscomp$0.push(endOfStartTag);
        var child = Array.isArray(children$jscomp$6)
          ? 2 > children$jscomp$6.length
            ? children$jscomp$6[0]
            : null
          : children$jscomp$6;
        "function" !== typeof child &&
          "symbol" !== typeof child &&
          null !== child &&
          void 0 !== child &&
          target$jscomp$0.push(
            stringToChunk(("" + child).replace(styleRegex, styleReplacer))
          );
        pushInnerHTML(target$jscomp$0, innerHTML$jscomp$5, children$jscomp$6);
        target$jscomp$0.push(endChunkForTag("style"));
        var JSCompiler_inline_result$jscomp$6 = null;
      } else {
        var styleQueue$jscomp$0 = renderState.styles.get(precedence$jscomp$0);
        if (
          null !==
          (resumableState.styleResources.hasOwnProperty(href$jscomp$0)
            ? resumableState.styleResources[href$jscomp$0]
            : void 0)
        ) {
          resumableState.styleResources[href$jscomp$0] = null;
          styleQueue$jscomp$0
            ? styleQueue$jscomp$0.hrefs.push(
                stringToChunk(escapeTextForBrowser(href$jscomp$0))
              )
            : ((styleQueue$jscomp$0 = {
                precedence: stringToChunk(
                  escapeTextForBrowser(precedence$jscomp$0)
                ),
                rules: [],
                hrefs: [stringToChunk(escapeTextForBrowser(href$jscomp$0))],
                sheets: new Map()
              }),
              renderState.styles.set(precedence$jscomp$0, styleQueue$jscomp$0));
          var target = styleQueue$jscomp$0.rules,
            children$jscomp$7 = null,
            innerHTML$jscomp$6 = null,
            propKey$jscomp$9;
          for (propKey$jscomp$9 in props)
            if (hasOwnProperty.call(props, propKey$jscomp$9)) {
              var propValue$jscomp$9 = props[propKey$jscomp$9];
              if (null != propValue$jscomp$9)
                switch (propKey$jscomp$9) {
                  case "children":
                    children$jscomp$7 = propValue$jscomp$9;
                    break;
                  case "dangerouslySetInnerHTML":
                    innerHTML$jscomp$6 = propValue$jscomp$9;
                }
            }
          var child$jscomp$0 = Array.isArray(children$jscomp$7)
            ? 2 > children$jscomp$7.length
              ? children$jscomp$7[0]
              : null
            : children$jscomp$7;
          "function" !== typeof child$jscomp$0 &&
            "symbol" !== typeof child$jscomp$0 &&
            null !== child$jscomp$0 &&
            void 0 !== child$jscomp$0 &&
            target.push(
              stringToChunk(
                ("" + child$jscomp$0).replace(styleRegex, styleReplacer)
              )
            );
          pushInnerHTML(target, innerHTML$jscomp$6, children$jscomp$7);
        }
        styleQueue$jscomp$0 &&
          hoistableState &&
          hoistableState.styles.add(styleQueue$jscomp$0);
        textEmbedded && target$jscomp$0.push(textSeparator);
        JSCompiler_inline_result$jscomp$6 = void 0;
      }
      return JSCompiler_inline_result$jscomp$6;
    case "meta":
      if (
        3 === formatContext.insertionMode ||
        formatContext.tagScope & 1 ||
        null != props.itemProp
      )
        var JSCompiler_inline_result$jscomp$7 = pushSelfClosing(
          target$jscomp$0,
          props,
          "meta"
        );
      else
        textEmbedded && target$jscomp$0.push(textSeparator),
          (JSCompiler_inline_result$jscomp$7 = isFallback
            ? null
            : "string" === typeof props.charSet
              ? pushSelfClosing(renderState.charsetChunks, props, "meta")
              : "viewport" === props.name
                ? pushSelfClosing(renderState.viewportChunks, props, "meta")
                : pushSelfClosing(renderState.hoistableChunks, props, "meta"));
      return JSCompiler_inline_result$jscomp$7;
    case "listing":
    case "pre":
      target$jscomp$0.push(startChunkForTag(type));
      var children$jscomp$8 = null,
        innerHTML$jscomp$7 = null,
        propKey$jscomp$10;
      for (propKey$jscomp$10 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$10)) {
          var propValue$jscomp$10 = props[propKey$jscomp$10];
          if (null != propValue$jscomp$10)
            switch (propKey$jscomp$10) {
              case "children":
                children$jscomp$8 = propValue$jscomp$10;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML$jscomp$7 = propValue$jscomp$10;
                break;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$10,
                  propValue$jscomp$10
                );
            }
        }
      target$jscomp$0.push(endOfStartTag);
      if (null != innerHTML$jscomp$7) {
        if (null != children$jscomp$8)
          throw Error(
            "Can only set one of `children` or `props.dangerouslySetInnerHTML`."
          );
        if (
          "object" !== typeof innerHTML$jscomp$7 ||
          !("__html" in innerHTML$jscomp$7)
        )
          throw Error(
            "`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information."
          );
        var html = innerHTML$jscomp$7.__html;
        null !== html &&
          void 0 !== html &&
          ("string" === typeof html && 0 < html.length && "\n" === html[0]
            ? target$jscomp$0.push(leadingNewline, stringToChunk(html))
            : target$jscomp$0.push(stringToChunk("" + html)));
      }
      "string" === typeof children$jscomp$8 &&
        "\n" === children$jscomp$8[0] &&
        target$jscomp$0.push(leadingNewline);
      return children$jscomp$8;
    case "img":
      var src = props.src,
        srcSet = props.srcSet;
      if (
        !(
          "lazy" === props.loading ||
          (!src && !srcSet) ||
          ("string" !== typeof src && null != src) ||
          ("string" !== typeof srcSet && null != srcSet)
        ) &&
        "low" !== props.fetchPriority &&
        !1 === !!(formatContext.tagScope & 3) &&
        ("string" !== typeof src ||
          ":" !== src[4] ||
          ("d" !== src[0] && "D" !== src[0]) ||
          ("a" !== src[1] && "A" !== src[1]) ||
          ("t" !== src[2] && "T" !== src[2]) ||
          ("a" !== src[3] && "A" !== src[3])) &&
        ("string" !== typeof srcSet ||
          ":" !== srcSet[4] ||
          ("d" !== srcSet[0] && "D" !== srcSet[0]) ||
          ("a" !== srcSet[1] && "A" !== srcSet[1]) ||
          ("t" !== srcSet[2] && "T" !== srcSet[2]) ||
          ("a" !== srcSet[3] && "A" !== srcSet[3]))
      ) {
        var sizes = "string" === typeof props.sizes ? props.sizes : void 0,
          key$jscomp$0 = srcSet ? srcSet + "\n" + (sizes || "") : src,
          promotablePreloads = renderState.preloads.images,
          resource$jscomp$1 = promotablePreloads.get(key$jscomp$0);
        if (resource$jscomp$1) {
          if (
            "high" === props.fetchPriority ||
            10 > renderState.highImagePreloads.size
          )
            promotablePreloads.delete(key$jscomp$0),
              renderState.highImagePreloads.add(resource$jscomp$1);
        } else if (
          !resumableState.imageResources.hasOwnProperty(key$jscomp$0)
        ) {
          resumableState.imageResources[key$jscomp$0] = PRELOAD_NO_CREDS;
          var input = props.crossOrigin;
          var JSCompiler_inline_result$jscomp$8 =
            "string" === typeof input
              ? "use-credentials" === input
                ? input
                : ""
              : void 0;
          var headers = renderState.headers,
            header;
          headers &&
          0 < headers.remainingCapacity &&
          ("high" === props.fetchPriority ||
            500 > headers.highImagePreloads.length) &&
          ((header = getPreloadAsHeader(src, "image", {
            imageSrcSet: props.srcSet,
            imageSizes: props.sizes,
            crossOrigin: JSCompiler_inline_result$jscomp$8,
            integrity: props.integrity,
            nonce: props.nonce,
            type: props.type,
            fetchPriority: props.fetchPriority,
            referrerPolicy: props.refererPolicy
          })),
          0 <= (headers.remainingCapacity -= header.length + 2))
            ? ((renderState.resets.image[key$jscomp$0] = PRELOAD_NO_CREDS),
              headers.highImagePreloads && (headers.highImagePreloads += ", "),
              (headers.highImagePreloads += header))
            : ((resource$jscomp$1 = []),
              pushLinkImpl(resource$jscomp$1, {
                rel: "preload",
                as: "image",
                href: srcSet ? void 0 : src,
                imageSrcSet: srcSet,
                imageSizes: sizes,
                crossOrigin: JSCompiler_inline_result$jscomp$8,
                integrity: props.integrity,
                type: props.type,
                fetchPriority: props.fetchPriority,
                referrerPolicy: props.referrerPolicy
              }),
              "high" === props.fetchPriority ||
              10 > renderState.highImagePreloads.size
                ? renderState.highImagePreloads.add(resource$jscomp$1)
                : (renderState.bulkPreloads.add(resource$jscomp$1),
                  promotablePreloads.set(key$jscomp$0, resource$jscomp$1)));
        }
      }
      return pushSelfClosing(target$jscomp$0, props, "img");
    case "base":
    case "area":
    case "br":
    case "col":
    case "embed":
    case "hr":
    case "keygen":
    case "param":
    case "source":
    case "track":
    case "wbr":
      return pushSelfClosing(target$jscomp$0, props, type);
    case "annotation-xml":
    case "color-profile":
    case "font-face":
    case "font-face-src":
    case "font-face-uri":
    case "font-face-format":
    case "font-face-name":
    case "missing-glyph":
      break;
    case "head":
      if (2 > formatContext.insertionMode && null === renderState.headChunks) {
        renderState.headChunks = [];
        var JSCompiler_inline_result$jscomp$9 = pushStartGenericElement(
          renderState.headChunks,
          props,
          "head"
        );
      } else
        JSCompiler_inline_result$jscomp$9 = pushStartGenericElement(
          target$jscomp$0,
          props,
          "head"
        );
      return JSCompiler_inline_result$jscomp$9;
    case "html":
      if (
        0 === formatContext.insertionMode &&
        null === renderState.htmlChunks
      ) {
        renderState.htmlChunks = [doctypeChunk];
        var JSCompiler_inline_result$jscomp$10 = pushStartGenericElement(
          renderState.htmlChunks,
          props,
          "html"
        );
      } else
        JSCompiler_inline_result$jscomp$10 = pushStartGenericElement(
          target$jscomp$0,
          props,
          "html"
        );
      return JSCompiler_inline_result$jscomp$10;
    default:
      if (-1 !== type.indexOf("-")) {
        target$jscomp$0.push(startChunkForTag(type));
        var children$jscomp$9 = null,
          innerHTML$jscomp$8 = null,
          propKey$jscomp$11;
        for (propKey$jscomp$11 in props)
          if (hasOwnProperty.call(props, propKey$jscomp$11)) {
            var propValue$jscomp$11 = props[propKey$jscomp$11];
            if (null != propValue$jscomp$11) {
              var attributeName = propKey$jscomp$11;
              switch (propKey$jscomp$11) {
                case "children":
                  children$jscomp$9 = propValue$jscomp$11;
                  break;
                case "dangerouslySetInnerHTML":
                  innerHTML$jscomp$8 = propValue$jscomp$11;
                  break;
                case "style":
                  pushStyleAttribute(target$jscomp$0, propValue$jscomp$11);
                  break;
                case "suppressContentEditableWarning":
                case "suppressHydrationWarning":
                case "ref":
                  break;
                case "className":
                  attributeName = "class";
                default:
                  if (
                    isAttributeNameSafe(propKey$jscomp$11) &&
                    "function" !== typeof propValue$jscomp$11 &&
                    "symbol" !== typeof propValue$jscomp$11 &&
                    !1 !== propValue$jscomp$11
                  ) {
                    if (!0 === propValue$jscomp$11) propValue$jscomp$11 = "";
                    else if ("object" === typeof propValue$jscomp$11) continue;
                    target$jscomp$0.push(
                      attributeSeparator,
                      stringToChunk(attributeName),
                      attributeAssign,
                      stringToChunk(escapeTextForBrowser(propValue$jscomp$11)),
                      attributeEnd
                    );
                  }
              }
            }
          }
        target$jscomp$0.push(endOfStartTag);
        pushInnerHTML(target$jscomp$0, innerHTML$jscomp$8, children$jscomp$9);
        return children$jscomp$9;
      }
  }
  return pushStartGenericElement(target$jscomp$0, props, type);
}
var endTagCache = new Map();
function endChunkForTag(tag) {
  var chunk = endTagCache.get(tag);
  void 0 === chunk &&
    ((chunk = stringToPrecomputedChunk("</" + tag + ">")),
    endTagCache.set(tag, chunk));
  return chunk;
}
function writeBootstrap(destination, renderState) {
  renderState = renderState.bootstrapChunks;
  for (var i = 0; i < renderState.length - 1; i++)
    writeChunk(destination, renderState[i]);
  return i < renderState.length
    ? ((i = renderState[i]),
      (renderState.length = 0),
      writeChunkAndReturn(destination, i))
    : !0;
}
var placeholder1 = stringToPrecomputedChunk('<template id="'),
  placeholder2 = stringToPrecomputedChunk('"></template>'),
  startCompletedSuspenseBoundary = stringToPrecomputedChunk("\x3c!--$--\x3e"),
  startPendingSuspenseBoundary1 = stringToPrecomputedChunk(
    '\x3c!--$?--\x3e<template id="'
  ),
  startPendingSuspenseBoundary2 = stringToPrecomputedChunk('"></template>'),
  startClientRenderedSuspenseBoundary =
    stringToPrecomputedChunk("\x3c!--$!--\x3e"),
  endSuspenseBoundary = stringToPrecomputedChunk("\x3c!--/$--\x3e"),
  clientRenderedSuspenseBoundaryError1 = stringToPrecomputedChunk("<template"),
  clientRenderedSuspenseBoundaryErrorAttrInterstitial =
    stringToPrecomputedChunk('"'),
  clientRenderedSuspenseBoundaryError1A =
    stringToPrecomputedChunk(' data-dgst="');
stringToPrecomputedChunk(' data-msg="');
stringToPrecomputedChunk(' data-stck="');
stringToPrecomputedChunk(' data-cstck="');
var clientRenderedSuspenseBoundaryError2 =
  stringToPrecomputedChunk("></template>");
function writeStartPendingSuspenseBoundary(destination, renderState, id) {
  writeChunk(destination, startPendingSuspenseBoundary1);
  if (null === id)
    throw Error(
      "An ID must have been assigned before we can complete the boundary."
    );
  writeChunk(destination, renderState.boundaryPrefix);
  writeChunk(destination, stringToChunk(id.toString(16)));
  return writeChunkAndReturn(destination, startPendingSuspenseBoundary2);
}
var startSegmentHTML = stringToPrecomputedChunk('<div hidden id="'),
  startSegmentHTML2 = stringToPrecomputedChunk('">'),
  endSegmentHTML = stringToPrecomputedChunk("</div>"),
  startSegmentSVG = stringToPrecomputedChunk(
    '<svg aria-hidden="true" style="display:none" id="'
  ),
  startSegmentSVG2 = stringToPrecomputedChunk('">'),
  endSegmentSVG = stringToPrecomputedChunk("</svg>"),
  startSegmentMathML = stringToPrecomputedChunk(
    '<math aria-hidden="true" style="display:none" id="'
  ),
  startSegmentMathML2 = stringToPrecomputedChunk('">'),
  endSegmentMathML = stringToPrecomputedChunk("</math>"),
  startSegmentTable = stringToPrecomputedChunk('<table hidden id="'),
  startSegmentTable2 = stringToPrecomputedChunk('">'),
  endSegmentTable = stringToPrecomputedChunk("</table>"),
  startSegmentTableBody = stringToPrecomputedChunk('<table hidden><tbody id="'),
  startSegmentTableBody2 = stringToPrecomputedChunk('">'),
  endSegmentTableBody = stringToPrecomputedChunk("</tbody></table>"),
  startSegmentTableRow = stringToPrecomputedChunk('<table hidden><tr id="'),
  startSegmentTableRow2 = stringToPrecomputedChunk('">'),
  endSegmentTableRow = stringToPrecomputedChunk("</tr></table>"),
  startSegmentColGroup = stringToPrecomputedChunk(
    '<table hidden><colgroup id="'
  ),
  startSegmentColGroup2 = stringToPrecomputedChunk('">'),
  endSegmentColGroup = stringToPrecomputedChunk("</colgroup></table>");
function writeStartSegment(destination, renderState, formatContext, id) {
  switch (formatContext.insertionMode) {
    case 0:
    case 1:
    case 2:
      return (
        writeChunk(destination, startSegmentHTML),
        writeChunk(destination, renderState.segmentPrefix),
        writeChunk(destination, stringToChunk(id.toString(16))),
        writeChunkAndReturn(destination, startSegmentHTML2)
      );
    case 3:
      return (
        writeChunk(destination, startSegmentSVG),
        writeChunk(destination, renderState.segmentPrefix),
        writeChunk(destination, stringToChunk(id.toString(16))),
        writeChunkAndReturn(destination, startSegmentSVG2)
      );
    case 4:
      return (
        writeChunk(destination, startSegmentMathML),
        writeChunk(destination, renderState.segmentPrefix),
        writeChunk(destination, stringToChunk(id.toString(16))),
        writeChunkAndReturn(destination, startSegmentMathML2)
      );
    case 5:
      return (
        writeChunk(destination, startSegmentTable),
        writeChunk(destination, renderState.segmentPrefix),
        writeChunk(destination, stringToChunk(id.toString(16))),
        writeChunkAndReturn(destination, startSegmentTable2)
      );
    case 6:
      return (
        writeChunk(destination, startSegmentTableBody),
        writeChunk(destination, renderState.segmentPrefix),
        writeChunk(destination, stringToChunk(id.toString(16))),
        writeChunkAndReturn(destination, startSegmentTableBody2)
      );
    case 7:
      return (
        writeChunk(destination, startSegmentTableRow),
        writeChunk(destination, renderState.segmentPrefix),
        writeChunk(destination, stringToChunk(id.toString(16))),
        writeChunkAndReturn(destination, startSegmentTableRow2)
      );
    case 8:
      return (
        writeChunk(destination, startSegmentColGroup),
        writeChunk(destination, renderState.segmentPrefix),
        writeChunk(destination, stringToChunk(id.toString(16))),
        writeChunkAndReturn(destination, startSegmentColGroup2)
      );
    default:
      throw Error("Unknown insertion mode. This is a bug in React.");
  }
}
function writeEndSegment(destination, formatContext) {
  switch (formatContext.insertionMode) {
    case 0:
    case 1:
    case 2:
      return writeChunkAndReturn(destination, endSegmentHTML);
    case 3:
      return writeChunkAndReturn(destination, endSegmentSVG);
    case 4:
      return writeChunkAndReturn(destination, endSegmentMathML);
    case 5:
      return writeChunkAndReturn(destination, endSegmentTable);
    case 6:
      return writeChunkAndReturn(destination, endSegmentTableBody);
    case 7:
      return writeChunkAndReturn(destination, endSegmentTableRow);
    case 8:
      return writeChunkAndReturn(destination, endSegmentColGroup);
    default:
      throw Error("Unknown insertion mode. This is a bug in React.");
  }
}
var completeSegmentScript1Full = stringToPrecomputedChunk(
    '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'
  ),
  completeSegmentScript1Partial = stringToPrecomputedChunk('$RS("'),
  completeSegmentScript2 = stringToPrecomputedChunk('","'),
  completeSegmentScriptEnd = stringToPrecomputedChunk('")\x3c/script>'),
  completeSegmentData1 = stringToPrecomputedChunk(
    '<template data-rsi="" data-sid="'
  ),
  completeSegmentData2 = stringToPrecomputedChunk('" data-pid="'),
  completeBoundaryScript1Full = stringToPrecomputedChunk(
    '$RC=function(b,c,e){c=document.getElementById(c);c.parentNode.removeChild(c);var a=document.getElementById(b);if(a){b=a.previousSibling;if(e)b.data="$!",a.setAttribute("data-dgst",e);else{e=b.parentNode;a=b.nextSibling;var f=0;do{if(a&&8===a.nodeType){var d=a.data;if("/$"===d)if(0===f)break;else f--;else"$"!==d&&"$?"!==d&&"$!"!==d||f++}d=a.nextSibling;e.removeChild(a);a=d}while(a);for(;c.firstChild;)e.insertBefore(c.firstChild,a);b.data="$"}b._reactRetry&&b._reactRetry()}};$RC("'
  ),
  completeBoundaryScript1Partial = stringToPrecomputedChunk('$RC("'),
  completeBoundaryWithStylesScript1FullBoth = stringToPrecomputedChunk(
    '$RC=function(b,c,e){c=document.getElementById(c);c.parentNode.removeChild(c);var a=document.getElementById(b);if(a){b=a.previousSibling;if(e)b.data="$!",a.setAttribute("data-dgst",e);else{e=b.parentNode;a=b.nextSibling;var f=0;do{if(a&&8===a.nodeType){var d=a.data;if("/$"===d)if(0===f)break;else f--;else"$"!==d&&"$?"!==d&&"$!"!==d||f++}d=a.nextSibling;e.removeChild(a);a=d}while(a);for(;c.firstChild;)e.insertBefore(c.firstChild,a);b.data="$"}b._reactRetry&&b._reactRetry()}};$RM=new Map;\n$RR=function(t,u,y){function v(n){this._p=null;n()}for(var w=$RC,p=$RM,q=new Map,r=document,g,b,h=r.querySelectorAll("link[data-precedence],style[data-precedence]"),x=[],k=0;b=h[k++];)"not all"===b.getAttribute("media")?x.push(b):("LINK"===b.tagName&&p.set(b.getAttribute("href"),b),q.set(b.dataset.precedence,g=b));b=0;h=[];var l,a;for(k=!0;;){if(k){var e=y[b++];if(!e){k=!1;b=0;continue}var c=!1,m=0;var d=e[m++];if(a=p.get(d)){var f=a._p;c=!0}else{a=r.createElement("link");a.href=\nd;a.rel="stylesheet";for(a.dataset.precedence=l=e[m++];f=e[m++];)a.setAttribute(f,e[m++]);f=a._p=new Promise(function(n,z){a.onload=v.bind(a,n);a.onerror=v.bind(a,z)});p.set(d,a)}d=a.getAttribute("media");!f||d&&!matchMedia(d).matches||h.push(f);if(c)continue}else{a=x[b++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=q.get(l)||g;c===g&&(g=a);q.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=r.head,c.insertBefore(a,c.firstChild))}Promise.all(h).then(w.bind(null,\nt,u,""),w.bind(null,t,u,"Resource failed to load"))};$RR("'
  ),
  completeBoundaryWithStylesScript1FullPartial = stringToPrecomputedChunk(
    '$RM=new Map;\n$RR=function(t,u,y){function v(n){this._p=null;n()}for(var w=$RC,p=$RM,q=new Map,r=document,g,b,h=r.querySelectorAll("link[data-precedence],style[data-precedence]"),x=[],k=0;b=h[k++];)"not all"===b.getAttribute("media")?x.push(b):("LINK"===b.tagName&&p.set(b.getAttribute("href"),b),q.set(b.dataset.precedence,g=b));b=0;h=[];var l,a;for(k=!0;;){if(k){var e=y[b++];if(!e){k=!1;b=0;continue}var c=!1,m=0;var d=e[m++];if(a=p.get(d)){var f=a._p;c=!0}else{a=r.createElement("link");a.href=\nd;a.rel="stylesheet";for(a.dataset.precedence=l=e[m++];f=e[m++];)a.setAttribute(f,e[m++]);f=a._p=new Promise(function(n,z){a.onload=v.bind(a,n);a.onerror=v.bind(a,z)});p.set(d,a)}d=a.getAttribute("media");!f||d&&!matchMedia(d).matches||h.push(f);if(c)continue}else{a=x[b++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=q.get(l)||g;c===g&&(g=a);q.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=r.head,c.insertBefore(a,c.firstChild))}Promise.all(h).then(w.bind(null,\nt,u,""),w.bind(null,t,u,"Resource failed to load"))};$RR("'
  ),
  completeBoundaryWithStylesScript1Partial = stringToPrecomputedChunk('$RR("'),
  completeBoundaryScript2 = stringToPrecomputedChunk('","'),
  completeBoundaryScript3a = stringToPrecomputedChunk('",'),
  completeBoundaryScript3b = stringToPrecomputedChunk('"'),
  completeBoundaryScriptEnd = stringToPrecomputedChunk(")\x3c/script>"),
  completeBoundaryData1 = stringToPrecomputedChunk(
    '<template data-rci="" data-bid="'
  ),
  completeBoundaryWithStylesData1 = stringToPrecomputedChunk(
    '<template data-rri="" data-bid="'
  ),
  completeBoundaryData2 = stringToPrecomputedChunk('" data-sid="'),
  completeBoundaryData3a = stringToPrecomputedChunk('" data-sty="'),
  clientRenderScript1Full = stringToPrecomputedChunk(
    '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
  ),
  clientRenderScript1Partial = stringToPrecomputedChunk('$RX("'),
  clientRenderScript1A = stringToPrecomputedChunk('"'),
  clientRenderErrorScriptArgInterstitial = stringToPrecomputedChunk(","),
  clientRenderScriptEnd = stringToPrecomputedChunk(")\x3c/script>"),
  clientRenderData1 = stringToPrecomputedChunk(
    '<template data-rxi="" data-bid="'
  ),
  clientRenderData2 = stringToPrecomputedChunk('" data-dgst="');
stringToPrecomputedChunk('" data-msg="');
stringToPrecomputedChunk('" data-stck="');
stringToPrecomputedChunk('" data-cstck="');
var regexForJSStringsInInstructionScripts = /[<\u2028\u2029]/g;
function escapeJSStringsForInstructionScripts(input) {
  return JSON.stringify(input).replace(
    regexForJSStringsInInstructionScripts,
    function (match) {
      switch (match) {
        case "<":
          return "\\u003c";
        case "\u2028":
          return "\\u2028";
        case "\u2029":
          return "\\u2029";
        default:
          throw Error(
            "escapeJSStringsForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
          );
      }
    }
  );
}
var regexForJSStringsInScripts = /[&><\u2028\u2029]/g;
function escapeJSObjectForInstructionScripts(input) {
  return JSON.stringify(input).replace(
    regexForJSStringsInScripts,
    function (match) {
      switch (match) {
        case "&":
          return "\\u0026";
        case ">":
          return "\\u003e";
        case "<":
          return "\\u003c";
        case "\u2028":
          return "\\u2028";
        case "\u2029":
          return "\\u2029";
        default:
          throw Error(
            "escapeJSObjectForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
          );
      }
    }
  );
}
var lateStyleTagResourceOpen1 = stringToPrecomputedChunk(
    '<style media="not all" data-precedence="'
  ),
  lateStyleTagResourceOpen2 = stringToPrecomputedChunk('" data-href="'),
  lateStyleTagResourceOpen3 = stringToPrecomputedChunk('">'),
  lateStyleTagTemplateClose = stringToPrecomputedChunk("</style>"),
  currentlyRenderingBoundaryHasStylesToHoist = !1,
  destinationHasCapacity = !0;
function flushStyleTagsLateForBoundary(styleQueue) {
  var rules = styleQueue.rules,
    hrefs = styleQueue.hrefs,
    i = 0;
  if (hrefs.length) {
    writeChunk(this, lateStyleTagResourceOpen1);
    writeChunk(this, styleQueue.precedence);
    for (writeChunk(this, lateStyleTagResourceOpen2); i < hrefs.length - 1; i++)
      writeChunk(this, hrefs[i]), writeChunk(this, spaceSeparator);
    writeChunk(this, hrefs[i]);
    writeChunk(this, lateStyleTagResourceOpen3);
    for (i = 0; i < rules.length; i++) writeChunk(this, rules[i]);
    destinationHasCapacity = writeChunkAndReturn(
      this,
      lateStyleTagTemplateClose
    );
    currentlyRenderingBoundaryHasStylesToHoist = !0;
    rules.length = 0;
    hrefs.length = 0;
  }
}
function hasStylesToHoist(stylesheet) {
  return 2 !== stylesheet.state
    ? (currentlyRenderingBoundaryHasStylesToHoist = !0)
    : !1;
}
function writeHoistablesForBoundary(destination, hoistableState, renderState) {
  currentlyRenderingBoundaryHasStylesToHoist = !1;
  destinationHasCapacity = !0;
  hoistableState.styles.forEach(flushStyleTagsLateForBoundary, destination);
  hoistableState.stylesheets.forEach(hasStylesToHoist);
  currentlyRenderingBoundaryHasStylesToHoist &&
    (renderState.stylesToHoist = !0);
  return destinationHasCapacity;
}
function flushResource(resource) {
  for (var i = 0; i < resource.length; i++) writeChunk(this, resource[i]);
  resource.length = 0;
}
var stylesheetFlushingQueue = [];
function flushStyleInPreamble(stylesheet) {
  pushLinkImpl(stylesheetFlushingQueue, stylesheet.props);
  for (var i = 0; i < stylesheetFlushingQueue.length; i++)
    writeChunk(this, stylesheetFlushingQueue[i]);
  stylesheetFlushingQueue.length = 0;
  stylesheet.state = 2;
}
var styleTagResourceOpen1 = stringToPrecomputedChunk(
    '<style data-precedence="'
  ),
  styleTagResourceOpen2 = stringToPrecomputedChunk('" data-href="'),
  spaceSeparator = stringToPrecomputedChunk(" "),
  styleTagResourceOpen3 = stringToPrecomputedChunk('">'),
  styleTagResourceClose = stringToPrecomputedChunk("</style>");
function flushStylesInPreamble(styleQueue) {
  var hasStylesheets = 0 < styleQueue.sheets.size;
  styleQueue.sheets.forEach(flushStyleInPreamble, this);
  styleQueue.sheets.clear();
  var rules = styleQueue.rules,
    hrefs = styleQueue.hrefs;
  if (!hasStylesheets || hrefs.length) {
    writeChunk(this, styleTagResourceOpen1);
    writeChunk(this, styleQueue.precedence);
    styleQueue = 0;
    if (hrefs.length) {
      for (
        writeChunk(this, styleTagResourceOpen2);
        styleQueue < hrefs.length - 1;
        styleQueue++
      )
        writeChunk(this, hrefs[styleQueue]), writeChunk(this, spaceSeparator);
      writeChunk(this, hrefs[styleQueue]);
    }
    writeChunk(this, styleTagResourceOpen3);
    for (styleQueue = 0; styleQueue < rules.length; styleQueue++)
      writeChunk(this, rules[styleQueue]);
    writeChunk(this, styleTagResourceClose);
    rules.length = 0;
    hrefs.length = 0;
  }
}
function preloadLateStyle(stylesheet) {
  if (0 === stylesheet.state) {
    stylesheet.state = 1;
    var props = stylesheet.props;
    pushLinkImpl(stylesheetFlushingQueue, {
      rel: "preload",
      as: "style",
      href: stylesheet.props.href,
      crossOrigin: props.crossOrigin,
      fetchPriority: props.fetchPriority,
      integrity: props.integrity,
      media: props.media,
      hrefLang: props.hrefLang,
      referrerPolicy: props.referrerPolicy
    });
    for (
      stylesheet = 0;
      stylesheet < stylesheetFlushingQueue.length;
      stylesheet++
    )
      writeChunk(this, stylesheetFlushingQueue[stylesheet]);
    stylesheetFlushingQueue.length = 0;
  }
}
function preloadLateStyles(styleQueue) {
  styleQueue.sheets.forEach(preloadLateStyle, this);
  styleQueue.sheets.clear();
}
var arrayFirstOpenBracket = stringToPrecomputedChunk("["),
  arraySubsequentOpenBracket = stringToPrecomputedChunk(",["),
  arrayInterstitial = stringToPrecomputedChunk(","),
  arrayCloseBracket = stringToPrecomputedChunk("]");
function writeStyleResourceDependenciesInJS(destination, hoistableState) {
  writeChunk(destination, arrayFirstOpenBracket);
  var nextArrayOpenBrackChunk = arrayFirstOpenBracket;
  hoistableState.stylesheets.forEach(function (resource) {
    if (2 !== resource.state)
      if (3 === resource.state)
        writeChunk(destination, nextArrayOpenBrackChunk),
          writeChunk(
            destination,
            stringToChunk(
              escapeJSObjectForInstructionScripts("" + resource.props.href)
            )
          ),
          writeChunk(destination, arrayCloseBracket),
          (nextArrayOpenBrackChunk = arraySubsequentOpenBracket);
      else {
        writeChunk(destination, nextArrayOpenBrackChunk);
        var precedence = resource.props["data-precedence"],
          props = resource.props,
          coercedHref = sanitizeURL("" + resource.props.href);
        writeChunk(
          destination,
          stringToChunk(escapeJSObjectForInstructionScripts(coercedHref))
        );
        precedence = "" + precedence;
        writeChunk(destination, arrayInterstitial);
        writeChunk(
          destination,
          stringToChunk(escapeJSObjectForInstructionScripts(precedence))
        );
        for (var propKey in props)
          if (
            hasOwnProperty.call(props, propKey) &&
            ((precedence = props[propKey]), null != precedence)
          )
            switch (propKey) {
              case "href":
              case "rel":
              case "precedence":
              case "data-precedence":
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  "link is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                );
              default:
                writeStyleResourceAttributeInJS(
                  destination,
                  propKey,
                  precedence
                );
            }
        writeChunk(destination, arrayCloseBracket);
        nextArrayOpenBrackChunk = arraySubsequentOpenBracket;
        resource.state = 3;
      }
  });
  writeChunk(destination, arrayCloseBracket);
}
function writeStyleResourceAttributeInJS(destination, name, value) {
  var attributeName = name.toLowerCase();
  switch (typeof value) {
    case "function":
    case "symbol":
      return;
  }
  switch (name) {
    case "innerHTML":
    case "dangerouslySetInnerHTML":
    case "suppressContentEditableWarning":
    case "suppressHydrationWarning":
    case "style":
    case "ref":
      return;
    case "className":
      attributeName = "class";
      name = "" + value;
      break;
    case "hidden":
      if (!1 === value) return;
      name = "";
      break;
    case "src":
    case "href":
      value = sanitizeURL(value);
      name = "" + value;
      break;
    default:
      if (
        (2 < name.length &&
          ("o" === name[0] || "O" === name[0]) &&
          ("n" === name[1] || "N" === name[1])) ||
        !isAttributeNameSafe(name)
      )
        return;
      name = "" + value;
  }
  writeChunk(destination, arrayInterstitial);
  writeChunk(
    destination,
    stringToChunk(escapeJSObjectForInstructionScripts(attributeName))
  );
  writeChunk(destination, arrayInterstitial);
  writeChunk(
    destination,
    stringToChunk(escapeJSObjectForInstructionScripts(name))
  );
}
function writeStyleResourceDependenciesInAttr(destination, hoistableState) {
  writeChunk(destination, arrayFirstOpenBracket);
  var nextArrayOpenBrackChunk = arrayFirstOpenBracket;
  hoistableState.stylesheets.forEach(function (resource) {
    if (2 !== resource.state)
      if (3 === resource.state)
        writeChunk(destination, nextArrayOpenBrackChunk),
          writeChunk(
            destination,
            stringToChunk(
              escapeTextForBrowser(JSON.stringify("" + resource.props.href))
            )
          ),
          writeChunk(destination, arrayCloseBracket),
          (nextArrayOpenBrackChunk = arraySubsequentOpenBracket);
      else {
        writeChunk(destination, nextArrayOpenBrackChunk);
        var precedence = resource.props["data-precedence"],
          props = resource.props,
          coercedHref = sanitizeURL("" + resource.props.href);
        writeChunk(
          destination,
          stringToChunk(escapeTextForBrowser(JSON.stringify(coercedHref)))
        );
        precedence = "" + precedence;
        writeChunk(destination, arrayInterstitial);
        writeChunk(
          destination,
          stringToChunk(escapeTextForBrowser(JSON.stringify(precedence)))
        );
        for (var propKey in props)
          if (
            hasOwnProperty.call(props, propKey) &&
            ((precedence = props[propKey]), null != precedence)
          )
            switch (propKey) {
              case "href":
              case "rel":
              case "precedence":
              case "data-precedence":
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  "link is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                );
              default:
                writeStyleResourceAttributeInAttr(
                  destination,
                  propKey,
                  precedence
                );
            }
        writeChunk(destination, arrayCloseBracket);
        nextArrayOpenBrackChunk = arraySubsequentOpenBracket;
        resource.state = 3;
      }
  });
  writeChunk(destination, arrayCloseBracket);
}
function writeStyleResourceAttributeInAttr(destination, name, value) {
  var attributeName = name.toLowerCase();
  switch (typeof value) {
    case "function":
    case "symbol":
      return;
  }
  switch (name) {
    case "innerHTML":
    case "dangerouslySetInnerHTML":
    case "suppressContentEditableWarning":
    case "suppressHydrationWarning":
    case "style":
    case "ref":
      return;
    case "className":
      attributeName = "class";
      name = "" + value;
      break;
    case "hidden":
      if (!1 === value) return;
      name = "";
      break;
    case "src":
    case "href":
      value = sanitizeURL(value);
      name = "" + value;
      break;
    default:
      if (
        (2 < name.length &&
          ("o" === name[0] || "O" === name[0]) &&
          ("n" === name[1] || "N" === name[1])) ||
        !isAttributeNameSafe(name)
      )
        return;
      name = "" + value;
  }
  writeChunk(destination, arrayInterstitial);
  writeChunk(
    destination,
    stringToChunk(escapeTextForBrowser(JSON.stringify(attributeName)))
  );
  writeChunk(destination, arrayInterstitial);
  writeChunk(
    destination,
    stringToChunk(escapeTextForBrowser(JSON.stringify(name)))
  );
}
function createHoistableState() {
  return { styles: new Set(), stylesheets: new Set() };
}
function prefetchDNS(href) {
  var request = resolveRequest();
  if (request) {
    var resumableState = request.resumableState,
      renderState = request.renderState;
    if ("string" === typeof href && href) {
      if (!resumableState.dnsResources.hasOwnProperty(href)) {
        resumableState.dnsResources[href] = null;
        resumableState = renderState.headers;
        var header, JSCompiler_temp;
        if (
          (JSCompiler_temp =
            resumableState && 0 < resumableState.remainingCapacity)
        )
          JSCompiler_temp =
            ((header =
              "<" +
              ("" + href).replace(
                regexForHrefInLinkHeaderURLContext,
                escapeHrefForLinkHeaderURLContextReplacer
              ) +
              ">; rel=dns-prefetch"),
            0 <= (resumableState.remainingCapacity -= header.length + 2));
        JSCompiler_temp
          ? ((renderState.resets.dns[href] = null),
            resumableState.preconnects && (resumableState.preconnects += ", "),
            (resumableState.preconnects += header))
          : ((header = []),
            pushLinkImpl(header, { href: href, rel: "dns-prefetch" }),
            renderState.preconnects.add(header));
      }
      enqueueFlush(request);
    }
  } else previousDispatcher.D(href);
}
function preconnect(href, crossOrigin) {
  var request = resolveRequest();
  if (request) {
    var resumableState = request.resumableState,
      renderState = request.renderState;
    if ("string" === typeof href && href) {
      var bucket =
        "use-credentials" === crossOrigin
          ? "credentials"
          : "string" === typeof crossOrigin
            ? "anonymous"
            : "default";
      if (!resumableState.connectResources[bucket].hasOwnProperty(href)) {
        resumableState.connectResources[bucket][href] = null;
        resumableState = renderState.headers;
        var header, JSCompiler_temp;
        if (
          (JSCompiler_temp =
            resumableState && 0 < resumableState.remainingCapacity)
        ) {
          JSCompiler_temp =
            "<" +
            ("" + href).replace(
              regexForHrefInLinkHeaderURLContext,
              escapeHrefForLinkHeaderURLContextReplacer
            ) +
            ">; rel=preconnect";
          if ("string" === typeof crossOrigin) {
            var escapedCrossOrigin = ("" + crossOrigin).replace(
              regexForLinkHeaderQuotedParamValueContext,
              escapeStringForLinkHeaderQuotedParamValueContextReplacer
            );
            JSCompiler_temp += '; crossorigin="' + escapedCrossOrigin + '"';
          }
          JSCompiler_temp =
            ((header = JSCompiler_temp),
            0 <= (resumableState.remainingCapacity -= header.length + 2));
        }
        JSCompiler_temp
          ? ((renderState.resets.connect[bucket][href] = null),
            resumableState.preconnects && (resumableState.preconnects += ", "),
            (resumableState.preconnects += header))
          : ((bucket = []),
            pushLinkImpl(bucket, {
              rel: "preconnect",
              href: href,
              crossOrigin: crossOrigin
            }),
            renderState.preconnects.add(bucket));
      }
      enqueueFlush(request);
    }
  } else previousDispatcher.C(href, crossOrigin);
}
function preload(href, as, options) {
  var request = resolveRequest();
  if (request) {
    var resumableState = request.resumableState,
      renderState = request.renderState;
    if (as && href) {
      switch (as) {
        case "image":
          if (options) {
            var imageSrcSet = options.imageSrcSet;
            var imageSizes = options.imageSizes;
            var fetchPriority = options.fetchPriority;
          }
          var key = imageSrcSet
            ? imageSrcSet + "\n" + (imageSizes || "")
            : href;
          if (resumableState.imageResources.hasOwnProperty(key)) return;
          resumableState.imageResources[key] = PRELOAD_NO_CREDS;
          resumableState = renderState.headers;
          var header;
          resumableState &&
          0 < resumableState.remainingCapacity &&
          "high" === fetchPriority &&
          ((header = getPreloadAsHeader(href, as, options)),
          0 <= (resumableState.remainingCapacity -= header.length + 2))
            ? ((renderState.resets.image[key] = PRELOAD_NO_CREDS),
              resumableState.highImagePreloads &&
                (resumableState.highImagePreloads += ", "),
              (resumableState.highImagePreloads += header))
            : ((resumableState = []),
              pushLinkImpl(
                resumableState,
                assign(
                  { rel: "preload", href: imageSrcSet ? void 0 : href, as: as },
                  options
                )
              ),
              "high" === fetchPriority
                ? renderState.highImagePreloads.add(resumableState)
                : (renderState.bulkPreloads.add(resumableState),
                  renderState.preloads.images.set(key, resumableState)));
          break;
        case "style":
          if (resumableState.styleResources.hasOwnProperty(href)) return;
          imageSrcSet = [];
          pushLinkImpl(
            imageSrcSet,
            assign({ rel: "preload", href: href, as: as }, options)
          );
          resumableState.styleResources[href] =
            !options ||
            ("string" !== typeof options.crossOrigin &&
              "string" !== typeof options.integrity)
              ? PRELOAD_NO_CREDS
              : [options.crossOrigin, options.integrity];
          renderState.preloads.stylesheets.set(href, imageSrcSet);
          renderState.bulkPreloads.add(imageSrcSet);
          break;
        case "script":
          if (resumableState.scriptResources.hasOwnProperty(href)) return;
          imageSrcSet = [];
          renderState.preloads.scripts.set(href, imageSrcSet);
          renderState.bulkPreloads.add(imageSrcSet);
          pushLinkImpl(
            imageSrcSet,
            assign({ rel: "preload", href: href, as: as }, options)
          );
          resumableState.scriptResources[href] =
            !options ||
            ("string" !== typeof options.crossOrigin &&
              "string" !== typeof options.integrity)
              ? PRELOAD_NO_CREDS
              : [options.crossOrigin, options.integrity];
          break;
        default:
          if (resumableState.unknownResources.hasOwnProperty(as)) {
            if (
              ((imageSrcSet = resumableState.unknownResources[as]),
              imageSrcSet.hasOwnProperty(href))
            )
              return;
          } else
            (imageSrcSet = {}),
              (resumableState.unknownResources[as] = imageSrcSet);
          imageSrcSet[href] = PRELOAD_NO_CREDS;
          if (
            (resumableState = renderState.headers) &&
            0 < resumableState.remainingCapacity &&
            "font" === as &&
            ((key = getPreloadAsHeader(href, as, options)),
            0 <= (resumableState.remainingCapacity -= key.length + 2))
          )
            (renderState.resets.font[href] = PRELOAD_NO_CREDS),
              resumableState.fontPreloads &&
                (resumableState.fontPreloads += ", "),
              (resumableState.fontPreloads += key);
          else
            switch (
              ((resumableState = []),
              (href = assign({ rel: "preload", href: href, as: as }, options)),
              pushLinkImpl(resumableState, href),
              as)
            ) {
              case "font":
                renderState.fontPreloads.add(resumableState);
                break;
              default:
                renderState.bulkPreloads.add(resumableState);
            }
      }
      enqueueFlush(request);
    }
  } else previousDispatcher.L(href, as, options);
}
function preloadModule(href, options) {
  var request = resolveRequest();
  if (request) {
    var resumableState = request.resumableState,
      renderState = request.renderState;
    if (href) {
      var as =
        options && "string" === typeof options.as ? options.as : "script";
      switch (as) {
        case "script":
          if (resumableState.moduleScriptResources.hasOwnProperty(href)) return;
          as = [];
          resumableState.moduleScriptResources[href] =
            !options ||
            ("string" !== typeof options.crossOrigin &&
              "string" !== typeof options.integrity)
              ? PRELOAD_NO_CREDS
              : [options.crossOrigin, options.integrity];
          renderState.preloads.moduleScripts.set(href, as);
          break;
        default:
          if (resumableState.moduleUnknownResources.hasOwnProperty(as)) {
            var resources = resumableState.unknownResources[as];
            if (resources.hasOwnProperty(href)) return;
          } else
            (resources = {}),
              (resumableState.moduleUnknownResources[as] = resources);
          as = [];
          resources[href] = PRELOAD_NO_CREDS;
      }
      pushLinkImpl(as, assign({ rel: "modulepreload", href: href }, options));
      renderState.bulkPreloads.add(as);
      enqueueFlush(request);
    }
  } else previousDispatcher.m(href, options);
}
function preinitStyle(href, precedence, options) {
  var request = resolveRequest();
  if (request) {
    var resumableState = request.resumableState,
      renderState = request.renderState;
    if (href) {
      precedence = precedence || "default";
      var styleQueue = renderState.styles.get(precedence),
        resourceState = resumableState.styleResources.hasOwnProperty(href)
          ? resumableState.styleResources[href]
          : void 0;
      null !== resourceState &&
        ((resumableState.styleResources[href] = null),
        styleQueue ||
          ((styleQueue = {
            precedence: stringToChunk(escapeTextForBrowser(precedence)),
            rules: [],
            hrefs: [],
            sheets: new Map()
          }),
          renderState.styles.set(precedence, styleQueue)),
        (precedence = {
          state: 0,
          props: assign(
            { rel: "stylesheet", href: href, "data-precedence": precedence },
            options
          )
        }),
        resourceState &&
          (2 === resourceState.length &&
            adoptPreloadCredentials(precedence.props, resourceState),
          (renderState = renderState.preloads.stylesheets.get(href)) &&
          0 < renderState.length
            ? (renderState.length = 0)
            : (precedence.state = 1)),
        styleQueue.sheets.set(href, precedence),
        enqueueFlush(request));
    }
  } else previousDispatcher.S(href, precedence, options);
}
function preinitScript(src, options) {
  var request = resolveRequest();
  if (request) {
    var resumableState = request.resumableState,
      renderState = request.renderState;
    if (src) {
      var resourceState = resumableState.scriptResources.hasOwnProperty(src)
        ? resumableState.scriptResources[src]
        : void 0;
      null !== resourceState &&
        ((resumableState.scriptResources[src] = null),
        (options = assign({ src: src, async: !0 }, options)),
        resourceState &&
          (2 === resourceState.length &&
            adoptPreloadCredentials(options, resourceState),
          (src = renderState.preloads.scripts.get(src))) &&
          (src.length = 0),
        (src = []),
        renderState.scripts.add(src),
        pushScriptImpl(src, options),
        enqueueFlush(request));
    }
  } else previousDispatcher.X(src, options);
}
function preinitModuleScript(src, options) {
  var request = resolveRequest();
  if (request) {
    var resumableState = request.resumableState,
      renderState = request.renderState;
    if (src) {
      var resourceState = resumableState.moduleScriptResources.hasOwnProperty(
        src
      )
        ? resumableState.moduleScriptResources[src]
        : void 0;
      null !== resourceState &&
        ((resumableState.moduleScriptResources[src] = null),
        (options = assign({ src: src, type: "module", async: !0 }, options)),
        resourceState &&
          (2 === resourceState.length &&
            adoptPreloadCredentials(options, resourceState),
          (src = renderState.preloads.moduleScripts.get(src))) &&
          (src.length = 0),
        (src = []),
        renderState.scripts.add(src),
        pushScriptImpl(src, options),
        enqueueFlush(request));
    }
  } else previousDispatcher.M(src, options);
}
function adoptPreloadCredentials(target, preloadState) {
  null == target.crossOrigin && (target.crossOrigin = preloadState[0]);
  null == target.integrity && (target.integrity = preloadState[1]);
}
function getPreloadAsHeader(href, as, params) {
  href = ("" + href).replace(
    regexForHrefInLinkHeaderURLContext,
    escapeHrefForLinkHeaderURLContextReplacer
  );
  as = ("" + as).replace(
    regexForLinkHeaderQuotedParamValueContext,
    escapeStringForLinkHeaderQuotedParamValueContextReplacer
  );
  as = "<" + href + '>; rel=preload; as="' + as + '"';
  for (var paramName in params)
    hasOwnProperty.call(params, paramName) &&
      ((href = params[paramName]),
      "string" === typeof href &&
        (as +=
          "; " +
          paramName.toLowerCase() +
          '="' +
          ("" + href).replace(
            regexForLinkHeaderQuotedParamValueContext,
            escapeStringForLinkHeaderQuotedParamValueContextReplacer
          ) +
          '"'));
  return as;
}
var regexForHrefInLinkHeaderURLContext = /[<>\r\n]/g;
function escapeHrefForLinkHeaderURLContextReplacer(match) {
  switch (match) {
    case "<":
      return "%3C";
    case ">":
      return "%3E";
    case "\n":
      return "%0A";
    case "\r":
      return "%0D";
    default:
      throw Error(
        "escapeLinkHrefForHeaderContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
      );
  }
}
var regexForLinkHeaderQuotedParamValueContext = /["';,\r\n]/g;
function escapeStringForLinkHeaderQuotedParamValueContextReplacer(match) {
  switch (match) {
    case '"':
      return "%22";
    case "'":
      return "%27";
    case ";":
      return "%3B";
    case ",":
      return "%2C";
    case "\n":
      return "%0A";
    case "\r":
      return "%0D";
    default:
      throw Error(
        "escapeStringForLinkHeaderQuotedParamValueContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
      );
  }
}
function hoistStyleQueueDependency(styleQueue) {
  this.styles.add(styleQueue);
}
function hoistStylesheetDependency(stylesheet) {
  this.stylesheets.add(stylesheet);
}
var bind = Function.prototype.bind,
  supportsRequestStorage = "function" === typeof AsyncLocalStorage,
  requestStorage = supportsRequestStorage ? new AsyncLocalStorage() : null,
  REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference");
function getComponentNameFromType(type) {
  if (null == type) return null;
  if ("function" === typeof type)
    return type.$$typeof === REACT_CLIENT_REFERENCE
      ? null
      : type.displayName || type.name || null;
  if ("string" === typeof type) return type;
  switch (type) {
    case REACT_FRAGMENT_TYPE:
      return "Fragment";
    case REACT_PORTAL_TYPE:
      return "Portal";
    case REACT_PROFILER_TYPE:
      return "Profiler";
    case REACT_STRICT_MODE_TYPE:
      return "StrictMode";
    case REACT_SUSPENSE_TYPE:
      return "Suspense";
    case REACT_SUSPENSE_LIST_TYPE:
      return "SuspenseList";
    case REACT_VIEW_TRANSITION_TYPE:
      return "ViewTransition";
  }
  if ("object" === typeof type)
    switch (type.$$typeof) {
      case REACT_CONTEXT_TYPE:
        return (type.displayName || "Context") + ".Provider";
      case REACT_CONSUMER_TYPE:
        return (type._context.displayName || "Context") + ".Consumer";
      case REACT_FORWARD_REF_TYPE:
        var innerType = type.render;
        type = type.displayName;
        type ||
          ((type = innerType.displayName || innerType.name || ""),
          (type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef"));
        return type;
      case REACT_MEMO_TYPE:
        return (
          (innerType = type.displayName || null),
          null !== innerType
            ? innerType
            : getComponentNameFromType(type.type) || "Memo"
        );
      case REACT_LAZY_TYPE:
        innerType = type._payload;
        type = type._init;
        try {
          return getComponentNameFromType(type(innerType));
        } catch (x) {}
    }
  return null;
}
var emptyContextObject = {},
  currentActiveSnapshot = null;
function popToNearestCommonAncestor(prev, next) {
  if (prev !== next) {
    prev.context._currentValue = prev.parentValue;
    prev = prev.parent;
    var parentNext = next.parent;
    if (null === prev) {
      if (null !== parentNext)
        throw Error(
          "The stacks must reach the root at the same time. This is a bug in React."
        );
    } else {
      if (null === parentNext)
        throw Error(
          "The stacks must reach the root at the same time. This is a bug in React."
        );
      popToNearestCommonAncestor(prev, parentNext);
    }
    next.context._currentValue = next.value;
  }
}
function popAllPrevious(prev) {
  prev.context._currentValue = prev.parentValue;
  prev = prev.parent;
  null !== prev && popAllPrevious(prev);
}
function pushAllNext(next) {
  var parentNext = next.parent;
  null !== parentNext && pushAllNext(parentNext);
  next.context._currentValue = next.value;
}
function popPreviousToCommonLevel(prev, next) {
  prev.context._currentValue = prev.parentValue;
  prev = prev.parent;
  if (null === prev)
    throw Error(
      "The depth must equal at least at zero before reaching the root. This is a bug in React."
    );
  prev.depth === next.depth
    ? popToNearestCommonAncestor(prev, next)
    : popPreviousToCommonLevel(prev, next);
}
function popNextToCommonLevel(prev, next) {
  var parentNext = next.parent;
  if (null === parentNext)
    throw Error(
      "The depth must equal at least at zero before reaching the root. This is a bug in React."
    );
  prev.depth === parentNext.depth
    ? popToNearestCommonAncestor(prev, parentNext)
    : popNextToCommonLevel(prev, parentNext);
  next.context._currentValue = next.value;
}
function switchContext(newSnapshot) {
  var prev = currentActiveSnapshot;
  prev !== newSnapshot &&
    (null === prev
      ? pushAllNext(newSnapshot)
      : null === newSnapshot
        ? popAllPrevious(prev)
        : prev.depth === newSnapshot.depth
          ? popToNearestCommonAncestor(prev, newSnapshot)
          : prev.depth > newSnapshot.depth
            ? popPreviousToCommonLevel(prev, newSnapshot)
            : popNextToCommonLevel(prev, newSnapshot),
    (currentActiveSnapshot = newSnapshot));
}
var classComponentUpdater = {
    enqueueSetState: function (inst, payload) {
      inst = inst._reactInternals;
      null !== inst.queue && inst.queue.push(payload);
    },
    enqueueReplaceState: function (inst, payload) {
      inst = inst._reactInternals;
      inst.replace = !0;
      inst.queue = [payload];
    },
    enqueueForceUpdate: function () {}
  },
  emptyTreeContext = { id: 1, overflow: "" };
function pushTreeContext(baseContext, totalChildren, index) {
  var baseIdWithLeadingBit = baseContext.id;
  baseContext = baseContext.overflow;
  var baseLength = 32 - clz32(baseIdWithLeadingBit) - 1;
  baseIdWithLeadingBit &= ~(1 << baseLength);
  index += 1;
  var length = 32 - clz32(totalChildren) + baseLength;
  if (30 < length) {
    var numberOfOverflowBits = baseLength - (baseLength % 5);
    length = (
      baseIdWithLeadingBit &
      ((1 << numberOfOverflowBits) - 1)
    ).toString(32);
    baseIdWithLeadingBit >>= numberOfOverflowBits;
    baseLength -= numberOfOverflowBits;
    return {
      id:
        (1 << (32 - clz32(totalChildren) + baseLength)) |
        (index << baseLength) |
        baseIdWithLeadingBit,
      overflow: length + baseContext
    };
  }
  return {
    id: (1 << length) | (index << baseLength) | baseIdWithLeadingBit,
    overflow: baseContext
  };
}
var clz32 = Math.clz32 ? Math.clz32 : clz32Fallback,
  log = Math.log,
  LN2 = Math.LN2;
function clz32Fallback(x) {
  x >>>= 0;
  return 0 === x ? 32 : (31 - ((log(x) / LN2) | 0)) | 0;
}
var SuspenseException = Error(
  "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
);
function noop$2() {}
function trackUsedThenable(thenableState, thenable, index) {
  index = thenableState[index];
  void 0 === index
    ? thenableState.push(thenable)
    : index !== thenable && (thenable.then(noop$2, noop$2), (thenable = index));
  switch (thenable.status) {
    case "fulfilled":
      return thenable.value;
    case "rejected":
      throw thenable.reason;
    default:
      "string" === typeof thenable.status
        ? thenable.then(noop$2, noop$2)
        : ((thenableState = thenable),
          (thenableState.status = "pending"),
          thenableState.then(
            function (fulfilledValue) {
              if ("pending" === thenable.status) {
                var fulfilledThenable = thenable;
                fulfilledThenable.status = "fulfilled";
                fulfilledThenable.value = fulfilledValue;
              }
            },
            function (error) {
              if ("pending" === thenable.status) {
                var rejectedThenable = thenable;
                rejectedThenable.status = "rejected";
                rejectedThenable.reason = error;
              }
            }
          ));
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
      }
      suspendedThenable = thenable;
      throw SuspenseException;
  }
}
var suspendedThenable = null;
function getSuspendedThenable() {
  if (null === suspendedThenable)
    throw Error(
      "Expected a suspended thenable. This is a bug in React. Please file an issue."
    );
  var thenable = suspendedThenable;
  suspendedThenable = null;
  return thenable;
}
function is(x, y) {
  return (x === y && (0 !== x || 1 / x === 1 / y)) || (x !== x && y !== y);
}
var objectIs = "function" === typeof Object.is ? Object.is : is,
  currentlyRenderingComponent = null,
  currentlyRenderingTask = null,
  currentlyRenderingRequest = null,
  currentlyRenderingKeyPath = null,
  firstWorkInProgressHook = null,
  workInProgressHook = null,
  isReRender = !1,
  didScheduleRenderPhaseUpdate = !1,
  localIdCounter = 0,
  actionStateCounter = 0,
  actionStateMatchingIndex = -1,
  thenableIndexCounter = 0,
  thenableState = null,
  renderPhaseUpdates = null,
  numberOfReRenders = 0;
function resolveCurrentlyRenderingComponent() {
  if (null === currentlyRenderingComponent)
    throw Error(
      "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
    );
  return currentlyRenderingComponent;
}
function createHook() {
  if (0 < numberOfReRenders)
    throw Error("Rendered more hooks than during the previous render");
  return { memoizedState: null, queue: null, next: null };
}
function createWorkInProgressHook() {
  null === workInProgressHook
    ? null === firstWorkInProgressHook
      ? ((isReRender = !1),
        (firstWorkInProgressHook = workInProgressHook = createHook()))
      : ((isReRender = !0), (workInProgressHook = firstWorkInProgressHook))
    : null === workInProgressHook.next
      ? ((isReRender = !1),
        (workInProgressHook = workInProgressHook.next = createHook()))
      : ((isReRender = !0), (workInProgressHook = workInProgressHook.next));
  return workInProgressHook;
}
function getThenableStateAfterSuspending() {
  var state = thenableState;
  thenableState = null;
  return state;
}
function resetHooksState() {
  currentlyRenderingKeyPath =
    currentlyRenderingRequest =
    currentlyRenderingTask =
    currentlyRenderingComponent =
      null;
  didScheduleRenderPhaseUpdate = !1;
  firstWorkInProgressHook = null;
  numberOfReRenders = 0;
  workInProgressHook = renderPhaseUpdates = null;
}
function basicStateReducer(state, action) {
  return "function" === typeof action ? action(state) : action;
}
function useReducer(reducer, initialArg, init) {
  currentlyRenderingComponent = resolveCurrentlyRenderingComponent();
  workInProgressHook = createWorkInProgressHook();
  if (isReRender) {
    var queue = workInProgressHook.queue;
    initialArg = queue.dispatch;
    if (
      null !== renderPhaseUpdates &&
      ((init = renderPhaseUpdates.get(queue)), void 0 !== init)
    ) {
      renderPhaseUpdates.delete(queue);
      queue = workInProgressHook.memoizedState;
      do (queue = reducer(queue, init.action)), (init = init.next);
      while (null !== init);
      workInProgressHook.memoizedState = queue;
      return [queue, initialArg];
    }
    return [workInProgressHook.memoizedState, initialArg];
  }
  reducer =
    reducer === basicStateReducer
      ? "function" === typeof initialArg
        ? initialArg()
        : initialArg
      : void 0 !== init
        ? init(initialArg)
        : initialArg;
  workInProgressHook.memoizedState = reducer;
  reducer = workInProgressHook.queue = { last: null, dispatch: null };
  reducer = reducer.dispatch = dispatchAction.bind(
    null,
    currentlyRenderingComponent,
    reducer
  );
  return [workInProgressHook.memoizedState, reducer];
}
function useMemo(nextCreate, deps) {
  currentlyRenderingComponent = resolveCurrentlyRenderingComponent();
  workInProgressHook = createWorkInProgressHook();
  deps = void 0 === deps ? null : deps;
  if (null !== workInProgressHook) {
    var prevState = workInProgressHook.memoizedState;
    if (null !== prevState && null !== deps) {
      var prevDeps = prevState[1];
      a: if (null === prevDeps) prevDeps = !1;
      else {
        for (var i = 0; i < prevDeps.length && i < deps.length; i++)
          if (!objectIs(deps[i], prevDeps[i])) {
            prevDeps = !1;
            break a;
          }
        prevDeps = !0;
      }
      if (prevDeps) return prevState[0];
    }
  }
  nextCreate = nextCreate();
  workInProgressHook.memoizedState = [nextCreate, deps];
  return nextCreate;
}
function dispatchAction(componentIdentity, queue, action) {
  if (25 <= numberOfReRenders)
    throw Error(
      "Too many re-renders. React limits the number of renders to prevent an infinite loop."
    );
  if (componentIdentity === currentlyRenderingComponent)
    if (
      ((didScheduleRenderPhaseUpdate = !0),
      (componentIdentity = { action: action, next: null }),
      null === renderPhaseUpdates && (renderPhaseUpdates = new Map()),
      (action = renderPhaseUpdates.get(queue)),
      void 0 === action)
    )
      renderPhaseUpdates.set(queue, componentIdentity);
    else {
      for (queue = action; null !== queue.next; ) queue = queue.next;
      queue.next = componentIdentity;
    }
}
function throwOnUseEffectEventCall() {
  throw Error(
    "A function wrapped in useEffectEvent can't be called during rendering."
  );
}
function unsupportedStartTransition() {
  throw Error("startTransition cannot be called during server rendering.");
}
function unsupportedSetOptimisticState() {
  throw Error("Cannot update optimistic state while rendering.");
}
function useActionState(action, initialState, permalink) {
  resolveCurrentlyRenderingComponent();
  var actionStateHookIndex = actionStateCounter++,
    request = currentlyRenderingRequest;
  if ("function" === typeof action.$$FORM_ACTION) {
    var nextPostbackStateKey = null,
      componentKeyPath = currentlyRenderingKeyPath;
    request = request.formState;
    var isSignatureEqual = action.$$IS_SIGNATURE_EQUAL;
    if (null !== request && "function" === typeof isSignatureEqual) {
      var postbackKey = request[1];
      isSignatureEqual.call(action, request[2], request[3]) &&
        ((nextPostbackStateKey =
          void 0 !== permalink
            ? "p" + permalink
            : "k" +
              murmurhash3_32_gc(
                JSON.stringify([componentKeyPath, null, actionStateHookIndex]),
                0
              )),
        postbackKey === nextPostbackStateKey &&
          ((actionStateMatchingIndex = actionStateHookIndex),
          (initialState = request[0])));
    }
    var boundAction = action.bind(null, initialState);
    action = function (payload) {
      boundAction(payload);
    };
    "function" === typeof boundAction.$$FORM_ACTION &&
      (action.$$FORM_ACTION = function (prefix) {
        prefix = boundAction.$$FORM_ACTION(prefix);
        void 0 !== permalink &&
          ((permalink += ""), (prefix.action = permalink));
        var formData = prefix.data;
        formData &&
          (null === nextPostbackStateKey &&
            (nextPostbackStateKey =
              void 0 !== permalink
                ? "p" + permalink
                : "k" +
                  murmurhash3_32_gc(
                    JSON.stringify([
                      componentKeyPath,
                      null,
                      actionStateHookIndex
                    ]),
                    0
                  )),
          formData.append("$ACTION_KEY", nextPostbackStateKey));
        return prefix;
      });
    return [initialState, action, !1];
  }
  var boundAction$22 = action.bind(null, initialState);
  return [
    initialState,
    function (payload) {
      boundAction$22(payload);
    },
    !1
  ];
}
function unwrapThenable(thenable) {
  var index = thenableIndexCounter;
  thenableIndexCounter += 1;
  null === thenableState && (thenableState = []);
  return trackUsedThenable(thenableState, thenable, index);
}
function readPreviousThenableFromState() {
  var index = thenableIndexCounter;
  thenableIndexCounter += 1;
  if (null !== thenableState)
    return (
      (index = thenableState[index]),
      (index = void 0 === index ? void 0 : index.value),
      index
    );
}
function unsupportedRefresh() {
  throw Error("Cache cannot be refreshed during server rendering.");
}
function noop$1() {}
var HooksDispatcher = {
    readContext: function (context) {
      return context._currentValue;
    },
    use: function (usable) {
      if (null !== usable && "object" === typeof usable) {
        if ("function" === typeof usable.then) return unwrapThenable(usable);
        if (usable.$$typeof === REACT_CONTEXT_TYPE) return usable._currentValue;
      }
      throw Error("An unsupported type was passed to use(): " + String(usable));
    },
    useContext: function (context) {
      resolveCurrentlyRenderingComponent();
      return context._currentValue;
    },
    useMemo: useMemo,
    useReducer: useReducer,
    useRef: function (initialValue) {
      currentlyRenderingComponent = resolveCurrentlyRenderingComponent();
      workInProgressHook = createWorkInProgressHook();
      var previousRef = workInProgressHook.memoizedState;
      return null === previousRef
        ? ((initialValue = { current: initialValue }),
          (workInProgressHook.memoizedState = initialValue))
        : previousRef;
    },
    useState: function (initialState) {
      return useReducer(basicStateReducer, initialState);
    },
    useInsertionEffect: noop$1,
    useLayoutEffect: noop$1,
    useCallback: function (callback, deps) {
      return useMemo(function () {
        return callback;
      }, deps);
    },
    useImperativeHandle: noop$1,
    useEffect: noop$1,
    useDebugValue: noop$1,
    useDeferredValue: function (value, initialValue) {
      resolveCurrentlyRenderingComponent();
      return void 0 !== initialValue ? initialValue : value;
    },
    useTransition: function () {
      resolveCurrentlyRenderingComponent();
      return [!1, unsupportedStartTransition];
    },
    useId: function () {
      var JSCompiler_inline_result = currentlyRenderingTask.treeContext;
      var overflow = JSCompiler_inline_result.overflow;
      JSCompiler_inline_result = JSCompiler_inline_result.id;
      JSCompiler_inline_result =
        (
          JSCompiler_inline_result &
          ~(1 << (32 - clz32(JSCompiler_inline_result) - 1))
        ).toString(32) + overflow;
      var resumableState = currentResumableState;
      if (null === resumableState)
        throw Error(
          "Invalid hook call. Hooks can only be called inside of the body of a function component."
        );
      overflow = localIdCounter++;
      JSCompiler_inline_result =
        ":" + resumableState.idPrefix + "R" + JSCompiler_inline_result;
      0 < overflow && (JSCompiler_inline_result += "H" + overflow.toString(32));
      return JSCompiler_inline_result + ":";
    },
    useSyncExternalStore: function (subscribe, getSnapshot, getServerSnapshot) {
      if (void 0 === getServerSnapshot)
        throw Error(
          "Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering."
        );
      return getServerSnapshot();
    },
    useOptimistic: function (passthrough) {
      resolveCurrentlyRenderingComponent();
      return [passthrough, unsupportedSetOptimisticState];
    },
    useActionState: useActionState,
    useFormState: useActionState,
    useHostTransitionStatus: function () {
      resolveCurrentlyRenderingComponent();
      return sharedNotPendingObject;
    },
    useMemoCache: function (size) {
      for (var data = Array(size), i = 0; i < size; i++)
        data[i] = REACT_MEMO_CACHE_SENTINEL;
      return data;
    },
    useCacheRefresh: function () {
      return unsupportedRefresh;
    },
    useEffectEvent: function () {
      return throwOnUseEffectEventCall;
    }
  },
  currentResumableState = null,
  DefaultAsyncDispatcher = {
    getCacheForType: function () {
      throw Error("Not implemented.");
    }
  };
function prepareStackTrace(error, structuredStackTrace) {
  error = (error.name || "Error") + ": " + (error.message || "");
  for (var i = 0; i < structuredStackTrace.length; i++)
    error += "\n    at " + structuredStackTrace[i].toString();
  return error;
}
var prefix, suffix;
function describeBuiltInComponentFrame(name) {
  if (void 0 === prefix)
    try {
      throw Error();
    } catch (x) {
      var match = x.stack.trim().match(/\n( *(at )?)/);
      prefix = (match && match[1]) || "";
      suffix =
        -1 < x.stack.indexOf("\n    at")
          ? " (<anonymous>)"
          : -1 < x.stack.indexOf("@")
            ? "@unknown:0:0"
            : "";
    }
  return "\n" + prefix + name + suffix;
}
var reentry = !1;
function describeNativeComponentFrame(fn, construct) {
  if (!fn || reentry) return "";
  reentry = !0;
  var previousPrepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = prepareStackTrace;
  try {
    var RunInRootFrame = {
      DetermineComponentFrameRoot: function () {
        try {
          if (construct) {
            var Fake = function () {
              throw Error();
            };
            Object.defineProperty(Fake.prototype, "props", {
              set: function () {
                throw Error();
              }
            });
            if ("object" === typeof Reflect && Reflect.construct) {
              try {
                Reflect.construct(Fake, []);
              } catch (x) {
                var control = x;
              }
              Reflect.construct(fn, [], Fake);
            } else {
              try {
                Fake.call();
              } catch (x$24) {
                control = x$24;
              }
              fn.call(Fake.prototype);
            }
          } else {
            try {
              throw Error();
            } catch (x$25) {
              control = x$25;
            }
            (Fake = fn()) &&
              "function" === typeof Fake.catch &&
              Fake.catch(function () {});
          }
        } catch (sample) {
          if (sample && control && "string" === typeof sample.stack)
            return [sample.stack, control.stack];
        }
        return [null, null];
      }
    };
    RunInRootFrame.DetermineComponentFrameRoot.displayName =
      "DetermineComponentFrameRoot";
    var namePropDescriptor = Object.getOwnPropertyDescriptor(
      RunInRootFrame.DetermineComponentFrameRoot,
      "name"
    );
    namePropDescriptor &&
      namePropDescriptor.configurable &&
      Object.defineProperty(
        RunInRootFrame.DetermineComponentFrameRoot,
        "name",
        { value: "DetermineComponentFrameRoot" }
      );
    var _RunInRootFrame$Deter = RunInRootFrame.DetermineComponentFrameRoot(),
      sampleStack = _RunInRootFrame$Deter[0],
      controlStack = _RunInRootFrame$Deter[1];
    if (sampleStack && controlStack) {
      var sampleLines = sampleStack.split("\n"),
        controlLines = controlStack.split("\n");
      for (
        namePropDescriptor = RunInRootFrame = 0;
        RunInRootFrame < sampleLines.length &&
        !sampleLines[RunInRootFrame].includes("DetermineComponentFrameRoot");

      )
        RunInRootFrame++;
      for (
        ;
        namePropDescriptor < controlLines.length &&
        !controlLines[namePropDescriptor].includes(
          "DetermineComponentFrameRoot"
        );

      )
        namePropDescriptor++;
      if (
        RunInRootFrame === sampleLines.length ||
        namePropDescriptor === controlLines.length
      )
        for (
          RunInRootFrame = sampleLines.length - 1,
            namePropDescriptor = controlLines.length - 1;
          1 <= RunInRootFrame &&
          0 <= namePropDescriptor &&
          sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor];

        )
          namePropDescriptor--;
      for (
        ;
        1 <= RunInRootFrame && 0 <= namePropDescriptor;
        RunInRootFrame--, namePropDescriptor--
      )
        if (sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
          if (1 !== RunInRootFrame || 1 !== namePropDescriptor) {
            do
              if (
                (RunInRootFrame--,
                namePropDescriptor--,
                0 > namePropDescriptor ||
                  sampleLines[RunInRootFrame] !==
                    controlLines[namePropDescriptor])
              ) {
                var frame =
                  "\n" +
                  sampleLines[RunInRootFrame].replace(" at new ", " at ");
                fn.displayName &&
                  frame.includes("<anonymous>") &&
                  (frame = frame.replace("<anonymous>", fn.displayName));
                return frame;
              }
            while (1 <= RunInRootFrame && 0 <= namePropDescriptor);
          }
          break;
        }
    }
  } finally {
    (reentry = !1), (Error.prepareStackTrace = previousPrepareStackTrace);
  }
  return (previousPrepareStackTrace = fn ? fn.displayName || fn.name : "")
    ? describeBuiltInComponentFrame(previousPrepareStackTrace)
    : "";
}
function describeComponentStackByType(type) {
  if ("string" === typeof type) return describeBuiltInComponentFrame(type);
  if ("function" === typeof type)
    return type.prototype && type.prototype.isReactComponent
      ? describeNativeComponentFrame(type, !0)
      : describeNativeComponentFrame(type, !1);
  if ("object" === typeof type && null !== type) {
    switch (type.$$typeof) {
      case REACT_FORWARD_REF_TYPE:
        return describeNativeComponentFrame(type.render, !1);
      case REACT_MEMO_TYPE:
        return describeNativeComponentFrame(type.type, !1);
      case REACT_LAZY_TYPE:
        var lazyComponent = type,
          payload = lazyComponent._payload;
        lazyComponent = lazyComponent._init;
        try {
          type = lazyComponent(payload);
        } catch (x) {
          return describeBuiltInComponentFrame("Lazy");
        }
        return describeComponentStackByType(type);
    }
    if ("string" === typeof type.name)
      return (
        (payload = type.env),
        describeBuiltInComponentFrame(
          type.name + (payload ? " [" + payload + "]" : "")
        )
      );
  }
  switch (type) {
    case REACT_SUSPENSE_LIST_TYPE:
      return describeBuiltInComponentFrame("SuspenseList");
    case REACT_SUSPENSE_TYPE:
      return describeBuiltInComponentFrame("Suspense");
    case REACT_VIEW_TRANSITION_TYPE:
      return describeBuiltInComponentFrame("ViewTransition");
  }
  return "";
}
function defaultErrorHandler(error) {
  if (
    "object" === typeof error &&
    null !== error &&
    "string" === typeof error.environmentName
  ) {
    var JSCompiler_inline_result = error.environmentName;
    error = [error].slice(0);
    "string" === typeof error[0]
      ? error.splice(
          0,
          1,
          "\u001b[0m\u001b[7m%c%s\u001b[0m%c " + error[0],
          "background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px",
          " " + JSCompiler_inline_result + " ",
          ""
        )
      : error.splice(
          0,
          0,
          "\u001b[0m\u001b[7m%c%s\u001b[0m%c ",
          "background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px",
          " " + JSCompiler_inline_result + " ",
          ""
        );
    error.unshift(console);
    JSCompiler_inline_result = bind.apply(console.error, error);
    JSCompiler_inline_result();
  } else console.error(error);
  return null;
}
function noop() {}
function RequestInstance(
  resumableState,
  renderState,
  rootFormatContext,
  progressiveChunkSize,
  onError,
  onAllReady,
  onShellReady,
  onShellError,
  onFatalError,
  onPostpone,
  formState
) {
  var abortSet = new Set();
  this.destination = null;
  this.flushScheduled = !1;
  this.resumableState = resumableState;
  this.renderState = renderState;
  this.rootFormatContext = rootFormatContext;
  this.progressiveChunkSize =
    void 0 === progressiveChunkSize ? 12800 : progressiveChunkSize;
  this.status = 10;
  this.fatalError = null;
  this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0;
  this.completedRootSegment = null;
  this.abortableTasks = abortSet;
  this.pingedTasks = [];
  this.clientRenderedBoundaries = [];
  this.completedBoundaries = [];
  this.partialBoundaries = [];
  this.trackedPostpones = null;
  this.onError = void 0 === onError ? defaultErrorHandler : onError;
  this.onPostpone = void 0 === onPostpone ? noop : onPostpone;
  this.onAllReady = void 0 === onAllReady ? noop : onAllReady;
  this.onShellReady = void 0 === onShellReady ? noop : onShellReady;
  this.onShellError = void 0 === onShellError ? noop : onShellError;
  this.onFatalError = void 0 === onFatalError ? noop : onFatalError;
  this.formState = void 0 === formState ? null : formState;
}
function createRequest(
  children,
  resumableState,
  renderState,
  rootFormatContext,
  progressiveChunkSize,
  onError,
  onAllReady,
  onShellReady,
  onShellError,
  onFatalError,
  onPostpone,
  formState
) {
  resumableState = new RequestInstance(
    resumableState,
    renderState,
    rootFormatContext,
    progressiveChunkSize,
    onError,
    onAllReady,
    onShellReady,
    onShellError,
    onFatalError,
    onPostpone,
    formState
  );
  renderState = createPendingSegment(
    resumableState,
    0,
    null,
    rootFormatContext,
    !1,
    !1
  );
  renderState.parentFlushed = !0;
  children = createRenderTask(
    resumableState,
    null,
    children,
    -1,
    null,
    renderState,
    null,
    resumableState.abortableTasks,
    null,
    rootFormatContext,
    null,
    emptyTreeContext,
    null,
    !1
  );
  pushComponentStack(children);
  resumableState.pingedTasks.push(children);
  return resumableState;
}
function createPrerenderRequest(
  children,
  resumableState,
  renderState,
  rootFormatContext,
  progressiveChunkSize,
  onError,
  onAllReady,
  onShellReady,
  onShellError,
  onFatalError,
  onPostpone
) {
  children = createRequest(
    children,
    resumableState,
    renderState,
    rootFormatContext,
    progressiveChunkSize,
    onError,
    onAllReady,
    onShellReady,
    onShellError,
    onFatalError,
    onPostpone,
    void 0
  );
  children.trackedPostpones = {
    workingMap: new Map(),
    rootNodes: [],
    rootSlots: null
  };
  return children;
}
function resumeRequest(
  children,
  postponedState,
  renderState,
  onError,
  onAllReady,
  onShellReady,
  onShellError,
  onFatalError,
  onPostpone
) {
  renderState = new RequestInstance(
    postponedState.resumableState,
    renderState,
    postponedState.rootFormatContext,
    postponedState.progressiveChunkSize,
    onError,
    onAllReady,
    onShellReady,
    onShellError,
    onFatalError,
    onPostpone,
    null
  );
  renderState.nextSegmentId = postponedState.nextSegmentId;
  if ("number" === typeof postponedState.replaySlots)
    return (
      (onError = postponedState.replaySlots),
      (onAllReady = createPendingSegment(
        renderState,
        0,
        null,
        postponedState.rootFormatContext,
        !1,
        !1
      )),
      (onAllReady.id = onError),
      (onAllReady.parentFlushed = !0),
      (children = createRenderTask(
        renderState,
        null,
        children,
        -1,
        null,
        onAllReady,
        null,
        renderState.abortableTasks,
        null,
        postponedState.rootFormatContext,
        null,
        emptyTreeContext,
        null,
        !1
      )),
      pushComponentStack(children),
      renderState.pingedTasks.push(children),
      renderState
    );
  children = createReplayTask(
    renderState,
    null,
    {
      nodes: postponedState.replayNodes,
      slots: postponedState.replaySlots,
      pendingTasks: 0
    },
    children,
    -1,
    null,
    null,
    renderState.abortableTasks,
    null,
    postponedState.rootFormatContext,
    null,
    emptyTreeContext,
    null,
    !1
  );
  pushComponentStack(children);
  renderState.pingedTasks.push(children);
  return renderState;
}
function resumeAndPrerenderRequest(
  children,
  postponedState,
  renderState,
  onError,
  onAllReady,
  onShellReady,
  onShellError,
  onFatalError,
  onPostpone
) {
  children = resumeRequest(
    children,
    postponedState,
    renderState,
    onError,
    onAllReady,
    onShellReady,
    onShellError,
    onFatalError,
    onPostpone
  );
  children.trackedPostpones = {
    workingMap: new Map(),
    rootNodes: [],
    rootSlots: null
  };
  return children;
}
var currentRequest = null;
function resolveRequest() {
  if (currentRequest) return currentRequest;
  if (supportsRequestStorage) {
    var store = requestStorage.getStore();
    if (store) return store;
  }
  return null;
}
function pingTask(request, task) {
  request.pingedTasks.push(task);
  1 === request.pingedTasks.length &&
    ((request.flushScheduled = null !== request.destination),
    null !== request.trackedPostpones || 10 === request.status
      ? scheduleMicrotask(function () {
          return performWork(request);
        })
      : setTimeoutOrImmediate(function () {
          return performWork(request);
        }, 0));
}
function createSuspenseBoundary(request, fallbackAbortableTasks) {
  return {
    status: 0,
    rootSegmentID: -1,
    parentFlushed: !1,
    pendingTasks: 0,
    completedSegments: [],
    byteSize: 0,
    fallbackAbortableTasks: fallbackAbortableTasks,
    errorDigest: null,
    contentState: createHoistableState(),
    fallbackState: createHoistableState(),
    trackedContentKeyPath: null,
    trackedFallbackNode: null
  };
}
function createRenderTask(
  request,
  thenableState,
  node,
  childIndex,
  blockedBoundary,
  blockedSegment,
  hoistableState,
  abortSet,
  keyPath,
  formatContext,
  context,
  treeContext,
  componentStack,
  isFallback
) {
  request.allPendingTasks++;
  null === blockedBoundary
    ? request.pendingRootTasks++
    : blockedBoundary.pendingTasks++;
  var task = {
    replay: null,
    node: node,
    childIndex: childIndex,
    ping: function () {
      return pingTask(request, task);
    },
    blockedBoundary: blockedBoundary,
    blockedSegment: blockedSegment,
    hoistableState: hoistableState,
    abortSet: abortSet,
    keyPath: keyPath,
    formatContext: formatContext,
    context: context,
    treeContext: treeContext,
    componentStack: componentStack,
    thenableState: thenableState,
    isFallback: isFallback
  };
  abortSet.add(task);
  return task;
}
function createReplayTask(
  request,
  thenableState,
  replay,
  node,
  childIndex,
  blockedBoundary,
  hoistableState,
  abortSet,
  keyPath,
  formatContext,
  context,
  treeContext,
  componentStack,
  isFallback
) {
  request.allPendingTasks++;
  null === blockedBoundary
    ? request.pendingRootTasks++
    : blockedBoundary.pendingTasks++;
  replay.pendingTasks++;
  var task = {
    replay: replay,
    node: node,
    childIndex: childIndex,
    ping: function () {
      return pingTask(request, task);
    },
    blockedBoundary: blockedBoundary,
    blockedSegment: null,
    hoistableState: hoistableState,
    abortSet: abortSet,
    keyPath: keyPath,
    formatContext: formatContext,
    context: context,
    treeContext: treeContext,
    componentStack: componentStack,
    thenableState: thenableState,
    isFallback: isFallback
  };
  abortSet.add(task);
  return task;
}
function createPendingSegment(
  request,
  index,
  boundary,
  parentFormatContext,
  lastPushedText,
  textEmbedded
) {
  return {
    status: 0,
    id: -1,
    index: index,
    parentFlushed: !1,
    chunks: [],
    children: [],
    parentFormatContext: parentFormatContext,
    boundary: boundary,
    lastPushedText: lastPushedText,
    textEmbedded: textEmbedded
  };
}
function pushComponentStack(task) {
  var node = task.node;
  if ("object" === typeof node && null !== node)
    switch (node.$$typeof) {
      case REACT_ELEMENT_TYPE:
        task.componentStack = { parent: task.componentStack, type: node.type };
    }
}
function getThrownInfo(node$jscomp$0) {
  var errorInfo = {};
  node$jscomp$0 &&
    Object.defineProperty(errorInfo, "componentStack", {
      configurable: !0,
      enumerable: !0,
      get: function () {
        try {
          var info = "",
            node = node$jscomp$0;
          do
            (info += describeComponentStackByType(node.type)),
              (node = node.parent);
          while (node);
          var JSCompiler_inline_result = info;
        } catch (x) {
          JSCompiler_inline_result =
            "\nError generating stack: " + x.message + "\n" + x.stack;
        }
        Object.defineProperty(errorInfo, "componentStack", {
          value: JSCompiler_inline_result
        });
        return JSCompiler_inline_result;
      }
    });
  return errorInfo;
}
function logPostpone(request, reason, postponeInfo) {
  request = request.onPostpone;
  request(reason, postponeInfo);
}
function logRecoverableError(request, error, errorInfo) {
  request = request.onError;
  error = request(error, errorInfo);
  if (null == error || "string" === typeof error) return error;
}
function fatalError(request, error) {
  var onShellError = request.onShellError,
    onFatalError = request.onFatalError;
  onShellError(error);
  onFatalError(error);
  null !== request.destination
    ? ((request.status = 14), closeWithError(request.destination, error))
    : ((request.status = 13), (request.fatalError = error));
}
function renderWithHooks(request, task, keyPath, Component, props, secondArg) {
  var prevThenableState = task.thenableState;
  task.thenableState = null;
  currentlyRenderingComponent = {};
  currentlyRenderingTask = task;
  currentlyRenderingRequest = request;
  currentlyRenderingKeyPath = keyPath;
  actionStateCounter = localIdCounter = 0;
  actionStateMatchingIndex = -1;
  thenableIndexCounter = 0;
  thenableState = prevThenableState;
  for (request = Component(props, secondArg); didScheduleRenderPhaseUpdate; )
    (didScheduleRenderPhaseUpdate = !1),
      (actionStateCounter = localIdCounter = 0),
      (actionStateMatchingIndex = -1),
      (thenableIndexCounter = 0),
      (numberOfReRenders += 1),
      (workInProgressHook = null),
      (request = Component(props, secondArg));
  resetHooksState();
  return request;
}
function finishFunctionComponent(
  request,
  task,
  keyPath,
  children,
  hasId,
  actionStateCount,
  actionStateMatchingIndex
) {
  var didEmitActionStateMarkers = !1;
  if (0 !== actionStateCount && null !== request.formState) {
    var segment = task.blockedSegment;
    if (null !== segment) {
      didEmitActionStateMarkers = !0;
      segment = segment.chunks;
      for (var i = 0; i < actionStateCount; i++)
        i === actionStateMatchingIndex
          ? segment.push(formStateMarkerIsMatching)
          : segment.push(formStateMarkerIsNotMatching);
    }
  }
  actionStateCount = task.keyPath;
  task.keyPath = keyPath;
  hasId
    ? ((keyPath = task.treeContext),
      (task.treeContext = pushTreeContext(keyPath, 1, 0)),
      renderNode(request, task, children, -1),
      (task.treeContext = keyPath))
    : didEmitActionStateMarkers
      ? renderNode(request, task, children, -1)
      : renderNodeDestructive(request, task, children, -1);
  task.keyPath = actionStateCount;
}
function renderElement(request, task, keyPath, type, props, ref) {
  if ("function" === typeof type)
    if (type.prototype && type.prototype.isReactComponent) {
      var newProps = props;
      if ("ref" in props) {
        newProps = {};
        for (var propName in props)
          "ref" !== propName && (newProps[propName] = props[propName]);
      }
      var defaultProps = type.defaultProps;
      if (defaultProps) {
        newProps === props && (newProps = assign({}, newProps, props));
        for (var propName$34 in defaultProps)
          void 0 === newProps[propName$34] &&
            (newProps[propName$34] = defaultProps[propName$34]);
      }
      props = newProps;
      newProps = emptyContextObject;
      defaultProps = type.contextType;
      "object" === typeof defaultProps &&
        null !== defaultProps &&
        (newProps = defaultProps._currentValue);
      newProps = new type(props, newProps);
      var initialState = void 0 !== newProps.state ? newProps.state : null;
      newProps.updater = classComponentUpdater;
      newProps.props = props;
      newProps.state = initialState;
      defaultProps = { queue: [], replace: !1 };
      newProps._reactInternals = defaultProps;
      ref = type.contextType;
      newProps.context =
        "object" === typeof ref && null !== ref
          ? ref._currentValue
          : emptyContextObject;
      ref = type.getDerivedStateFromProps;
      "function" === typeof ref &&
        ((ref = ref(props, initialState)),
        (initialState =
          null === ref || void 0 === ref
            ? initialState
            : assign({}, initialState, ref)),
        (newProps.state = initialState));
      if (
        "function" !== typeof type.getDerivedStateFromProps &&
        "function" !== typeof newProps.getSnapshotBeforeUpdate &&
        ("function" === typeof newProps.UNSAFE_componentWillMount ||
          "function" === typeof newProps.componentWillMount)
      )
        if (
          ((type = newProps.state),
          "function" === typeof newProps.componentWillMount &&
            newProps.componentWillMount(),
          "function" === typeof newProps.UNSAFE_componentWillMount &&
            newProps.UNSAFE_componentWillMount(),
          type !== newProps.state &&
            classComponentUpdater.enqueueReplaceState(
              newProps,
              newProps.state,
              null
            ),
          null !== defaultProps.queue && 0 < defaultProps.queue.length)
        )
          if (
            ((type = defaultProps.queue),
            (ref = defaultProps.replace),
            (defaultProps.queue = null),
            (defaultProps.replace = !1),
            ref && 1 === type.length)
          )
            newProps.state = type[0];
          else {
            defaultProps = ref ? type[0] : newProps.state;
            initialState = !0;
            for (ref = ref ? 1 : 0; ref < type.length; ref++)
              (propName$34 = type[ref]),
                (propName$34 =
                  "function" === typeof propName$34
                    ? propName$34.call(newProps, defaultProps, props, void 0)
                    : propName$34),
                null != propName$34 &&
                  (initialState
                    ? ((initialState = !1),
                      (defaultProps = assign({}, defaultProps, propName$34)))
                    : assign(defaultProps, propName$34));
            newProps.state = defaultProps;
          }
        else defaultProps.queue = null;
      type = newProps.render();
      if (12 === request.status) throw null;
      props = task.keyPath;
      task.keyPath = keyPath;
      renderNodeDestructive(request, task, type, -1);
      task.keyPath = props;
    } else {
      type = renderWithHooks(request, task, keyPath, type, props, void 0);
      if (12 === request.status) throw null;
      finishFunctionComponent(
        request,
        task,
        keyPath,
        type,
        0 !== localIdCounter,
        actionStateCounter,
        actionStateMatchingIndex
      );
    }
  else if ("string" === typeof type)
    if (((newProps = task.blockedSegment), null === newProps))
      (newProps = props.children),
        (defaultProps = task.formatContext),
        (initialState = task.keyPath),
        (task.formatContext = getChildFormatContext(defaultProps, type, props)),
        (task.keyPath = keyPath),
        renderNode(request, task, newProps, -1),
        (task.formatContext = defaultProps),
        (task.keyPath = initialState);
    else {
      initialState = pushStartInstance(
        newProps.chunks,
        type,
        props,
        request.resumableState,
        request.renderState,
        task.hoistableState,
        task.formatContext,
        newProps.lastPushedText,
        task.isFallback
      );
      newProps.lastPushedText = !1;
      defaultProps = task.formatContext;
      ref = task.keyPath;
      task.formatContext = getChildFormatContext(defaultProps, type, props);
      task.keyPath = keyPath;
      renderNode(request, task, initialState, -1);
      task.formatContext = defaultProps;
      task.keyPath = ref;
      a: {
        task = newProps.chunks;
        request = request.resumableState;
        switch (type) {
          case "title":
          case "style":
          case "script":
          case "area":
          case "base":
          case "br":
          case "col":
          case "embed":
          case "hr":
          case "img":
          case "input":
          case "keygen":
          case "link":
          case "meta":
          case "param":
          case "source":
          case "track":
          case "wbr":
            break a;
          case "body":
            if (1 >= defaultProps.insertionMode) {
              request.hasBody = !0;
              break a;
            }
            break;
          case "html":
            if (0 === defaultProps.insertionMode) {
              request.hasHtml = !0;
              break a;
            }
        }
        task.push(endChunkForTag(type));
      }
      newProps.lastPushedText = !1;
    }
  else {
    switch (type) {
      case REACT_LEGACY_HIDDEN_TYPE:
      case REACT_STRICT_MODE_TYPE:
      case REACT_PROFILER_TYPE:
      case REACT_FRAGMENT_TYPE:
        type = task.keyPath;
        task.keyPath = keyPath;
        renderNodeDestructive(request, task, props.children, -1);
        task.keyPath = type;
        return;
      case REACT_OFFSCREEN_TYPE:
        "hidden" !== props.mode &&
          ((type = task.keyPath),
          (task.keyPath = keyPath),
          renderNodeDestructive(request, task, props.children, -1),
          (task.keyPath = type));
        return;
      case REACT_SUSPENSE_LIST_TYPE:
        type = task.keyPath;
        task.keyPath = keyPath;
        renderNodeDestructive(request, task, props.children, -1);
        task.keyPath = type;
        return;
      case REACT_VIEW_TRANSITION_TYPE:
        type = task.keyPath;
        task.keyPath = keyPath;
        renderNodeDestructive(request, task, props.children, -1);
        task.keyPath = type;
        return;
      case REACT_SCOPE_TYPE:
        throw Error("ReactDOMServer does not yet support scope components.");
      case REACT_SUSPENSE_TYPE:
        a: if (null !== task.replay) {
          type = task.keyPath;
          task.keyPath = keyPath;
          keyPath = props.children;
          try {
            renderNode(request, task, keyPath, -1);
          } finally {
            task.keyPath = type;
          }
        } else {
          type = task.keyPath;
          var parentBoundary = task.blockedBoundary,
            parentHoistableState = task.hoistableState;
          ref = task.blockedSegment;
          propName$34 = props.fallback;
          props = props.children;
          var fallbackAbortSet = new Set();
          propName = createSuspenseBoundary(request, fallbackAbortSet);
          null !== request.trackedPostpones &&
            (propName.trackedContentKeyPath = keyPath);
          var boundarySegment = createPendingSegment(
            request,
            ref.chunks.length,
            propName,
            task.formatContext,
            !1,
            !1
          );
          ref.children.push(boundarySegment);
          ref.lastPushedText = !1;
          var contentRootSegment = createPendingSegment(
            request,
            0,
            null,
            task.formatContext,
            !1,
            !1
          );
          contentRootSegment.parentFlushed = !0;
          if (null !== request.trackedPostpones) {
            newProps = [keyPath[0], "Suspense Fallback", keyPath[2]];
            defaultProps = [newProps[1], newProps[2], [], null];
            request.trackedPostpones.workingMap.set(newProps, defaultProps);
            propName.trackedFallbackNode = defaultProps;
            task.blockedSegment = boundarySegment;
            task.keyPath = newProps;
            boundarySegment.status = 6;
            try {
              renderNode(request, task, propName$34, -1),
                boundarySegment.lastPushedText &&
                  boundarySegment.textEmbedded &&
                  boundarySegment.chunks.push(textSeparator),
                (boundarySegment.status = 1);
            } catch (thrownValue) {
              throw (
                ((boundarySegment.status = 12 === request.status ? 3 : 4),
                thrownValue)
              );
            } finally {
              (task.blockedSegment = ref), (task.keyPath = type);
            }
            task = createRenderTask(
              request,
              null,
              props,
              -1,
              propName,
              contentRootSegment,
              propName.contentState,
              task.abortSet,
              keyPath,
              task.formatContext,
              task.context,
              task.treeContext,
              task.componentStack,
              task.isFallback
            );
            pushComponentStack(task);
            request.pingedTasks.push(task);
          } else {
            task.blockedBoundary = propName;
            task.hoistableState = propName.contentState;
            task.blockedSegment = contentRootSegment;
            task.keyPath = keyPath;
            contentRootSegment.status = 6;
            try {
              if (
                (renderNode(request, task, props, -1),
                contentRootSegment.lastPushedText &&
                  contentRootSegment.textEmbedded &&
                  contentRootSegment.chunks.push(textSeparator),
                (contentRootSegment.status = 1),
                queueCompletedSegment(propName, contentRootSegment),
                0 === propName.pendingTasks && 0 === propName.status)
              ) {
                propName.status = 1;
                break a;
              }
            } catch (thrownValue$29) {
              (propName.status = 4),
                12 === request.status
                  ? ((contentRootSegment.status = 3),
                    (newProps = request.fatalError))
                  : ((contentRootSegment.status = 4),
                    (newProps = thrownValue$29)),
                (defaultProps = getThrownInfo(task.componentStack)),
                "object" === typeof newProps &&
                null !== newProps &&
                newProps.$$typeof === REACT_POSTPONE_TYPE
                  ? (logPostpone(request, newProps.message, defaultProps),
                    (initialState = "POSTPONE"))
                  : (initialState = logRecoverableError(
                      request,
                      newProps,
                      defaultProps
                    )),
                (propName.errorDigest = initialState),
                untrackBoundary(request, propName);
            } finally {
              (task.blockedBoundary = parentBoundary),
                (task.hoistableState = parentHoistableState),
                (task.blockedSegment = ref),
                (task.keyPath = type);
            }
            task = createRenderTask(
              request,
              null,
              propName$34,
              -1,
              parentBoundary,
              boundarySegment,
              propName.fallbackState,
              fallbackAbortSet,
              [keyPath[0], "Suspense Fallback", keyPath[2]],
              task.formatContext,
              task.context,
              task.treeContext,
              task.componentStack,
              !0
            );
            pushComponentStack(task);
            request.pingedTasks.push(task);
          }
        }
        return;
    }
    if ("object" === typeof type && null !== type)
      switch (type.$$typeof) {
        case REACT_FORWARD_REF_TYPE:
          if ("ref" in props)
            for (boundarySegment in ((newProps = {}), props))
              "ref" !== boundarySegment &&
                (newProps[boundarySegment] = props[boundarySegment]);
          else newProps = props;
          type = renderWithHooks(
            request,
            task,
            keyPath,
            type.render,
            newProps,
            ref
          );
          finishFunctionComponent(
            request,
            task,
            keyPath,
            type,
            0 !== localIdCounter,
            actionStateCounter,
            actionStateMatchingIndex
          );
          return;
        case REACT_MEMO_TYPE:
          renderElement(request, task, keyPath, type.type, props, ref);
          return;
        case REACT_PROVIDER_TYPE:
        case REACT_CONTEXT_TYPE:
          defaultProps = props.children;
          newProps = task.keyPath;
          props = props.value;
          initialState = type._currentValue;
          type._currentValue = props;
          ref = currentActiveSnapshot;
          currentActiveSnapshot = type = {
            parent: ref,
            depth: null === ref ? 0 : ref.depth + 1,
            context: type,
            parentValue: initialState,
            value: props
          };
          task.context = type;
          task.keyPath = keyPath;
          renderNodeDestructive(request, task, defaultProps, -1);
          request = currentActiveSnapshot;
          if (null === request)
            throw Error(
              "Tried to pop a Context at the root of the app. This is a bug in React."
            );
          request.context._currentValue = request.parentValue;
          request = currentActiveSnapshot = request.parent;
          task.context = request;
          task.keyPath = newProps;
          return;
        case REACT_CONSUMER_TYPE:
          props = props.children;
          type = props(type._context._currentValue);
          props = task.keyPath;
          task.keyPath = keyPath;
          renderNodeDestructive(request, task, type, -1);
          task.keyPath = props;
          return;
        case REACT_LAZY_TYPE:
          newProps = type._init;
          type = newProps(type._payload);
          if (12 === request.status) throw null;
          renderElement(request, task, keyPath, type, props, ref);
          return;
      }
    throw Error(
      "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " +
        ((null == type ? type : typeof type) + ".")
    );
  }
}
function resumeNode(request, task, segmentId, node, childIndex) {
  var prevReplay = task.replay,
    blockedBoundary = task.blockedBoundary,
    resumedSegment = createPendingSegment(
      request,
      0,
      null,
      task.formatContext,
      !1,
      !1
    );
  resumedSegment.id = segmentId;
  resumedSegment.parentFlushed = !0;
  try {
    (task.replay = null),
      (task.blockedSegment = resumedSegment),
      renderNode(request, task, node, childIndex),
      (resumedSegment.status = 1),
      null === blockedBoundary
        ? (request.completedRootSegment = resumedSegment)
        : (queueCompletedSegment(blockedBoundary, resumedSegment),
          blockedBoundary.parentFlushed &&
            request.partialBoundaries.push(blockedBoundary));
  } finally {
    (task.replay = prevReplay), (task.blockedSegment = null);
  }
}
function renderNodeDestructive(request, task, node, childIndex) {
  null !== task.replay && "number" === typeof task.replay.slots
    ? resumeNode(request, task, task.replay.slots, node, childIndex)
    : ((task.node = node),
      (task.childIndex = childIndex),
      (node = task.componentStack),
      pushComponentStack(task),
      retryNode(request, task),
      (task.componentStack = node));
}
function retryNode(request, task) {
  var node = task.node,
    childIndex = task.childIndex;
  if (null !== node) {
    if ("object" === typeof node) {
      switch (node.$$typeof) {
        case REACT_ELEMENT_TYPE:
          var type = node.type,
            key = node.key,
            props = node.props;
          node = props.ref;
          var ref = void 0 !== node ? node : null,
            name = getComponentNameFromType(type),
            keyOrIndex =
              null == key ? (-1 === childIndex ? 0 : childIndex) : key;
          key = [task.keyPath, name, keyOrIndex];
          if (null !== task.replay)
            a: {
              var replay = task.replay;
              childIndex = replay.nodes;
              for (node = 0; node < childIndex.length; node++) {
                var node$jscomp$0 = childIndex[node];
                if (keyOrIndex === node$jscomp$0[1]) {
                  if (4 === node$jscomp$0.length) {
                    if (null !== name && name !== node$jscomp$0[0])
                      throw Error(
                        "Expected the resume to render <" +
                          node$jscomp$0[0] +
                          "> in this slot but instead it rendered <" +
                          name +
                          ">. The tree doesn't match so React will fallback to client rendering."
                      );
                    var childNodes = node$jscomp$0[2];
                    name = node$jscomp$0[3];
                    keyOrIndex = task.node;
                    task.replay = {
                      nodes: childNodes,
                      slots: name,
                      pendingTasks: 1
                    };
                    try {
                      renderElement(request, task, key, type, props, ref);
                      if (
                        1 === task.replay.pendingTasks &&
                        0 < task.replay.nodes.length
                      )
                        throw Error(
                          "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                        );
                      task.replay.pendingTasks--;
                    } catch (x) {
                      if (
                        "object" === typeof x &&
                        null !== x &&
                        (x === SuspenseException ||
                          "function" === typeof x.then)
                      )
                        throw (
                          (task.node === keyOrIndex && (task.replay = replay),
                          x)
                        );
                      task.replay.pendingTasks--;
                      props = getThrownInfo(task.componentStack);
                      erroredReplay(
                        request,
                        task.blockedBoundary,
                        x,
                        props,
                        childNodes,
                        name
                      );
                    }
                    task.replay = replay;
                  } else {
                    if (type !== REACT_SUSPENSE_TYPE)
                      throw Error(
                        "Expected the resume to render <Suspense> in this slot but instead it rendered <" +
                          (getComponentNameFromType(type) || "Unknown") +
                          ">. The tree doesn't match so React will fallback to client rendering."
                      );
                    b: {
                      type = void 0;
                      ref = node$jscomp$0[5];
                      replay = node$jscomp$0[2];
                      name = node$jscomp$0[3];
                      keyOrIndex =
                        null === node$jscomp$0[4] ? [] : node$jscomp$0[4][2];
                      node$jscomp$0 =
                        null === node$jscomp$0[4] ? null : node$jscomp$0[4][3];
                      var prevKeyPath = task.keyPath,
                        previousReplaySet = task.replay,
                        parentBoundary = task.blockedBoundary,
                        parentHoistableState = task.hoistableState,
                        content = props.children;
                      props = props.fallback;
                      var fallbackAbortSet = new Set(),
                        resumedBoundary = createSuspenseBoundary(
                          request,
                          fallbackAbortSet
                        );
                      resumedBoundary.parentFlushed = !0;
                      resumedBoundary.rootSegmentID = ref;
                      task.blockedBoundary = resumedBoundary;
                      task.hoistableState = resumedBoundary.contentState;
                      task.keyPath = key;
                      task.replay = {
                        nodes: replay,
                        slots: name,
                        pendingTasks: 1
                      };
                      try {
                        renderNode(request, task, content, -1);
                        if (
                          1 === task.replay.pendingTasks &&
                          0 < task.replay.nodes.length
                        )
                          throw Error(
                            "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                          );
                        task.replay.pendingTasks--;
                        if (
                          0 === resumedBoundary.pendingTasks &&
                          0 === resumedBoundary.status
                        ) {
                          resumedBoundary.status = 1;
                          request.completedBoundaries.push(resumedBoundary);
                          break b;
                        }
                      } catch (error) {
                        (resumedBoundary.status = 4),
                          (childNodes = getThrownInfo(task.componentStack)),
                          "object" === typeof error &&
                          null !== error &&
                          error.$$typeof === REACT_POSTPONE_TYPE
                            ? (logPostpone(request, error.message, childNodes),
                              (type = "POSTPONE"))
                            : (type = logRecoverableError(
                                request,
                                error,
                                childNodes
                              )),
                          (resumedBoundary.errorDigest = type),
                          task.replay.pendingTasks--,
                          request.clientRenderedBoundaries.push(
                            resumedBoundary
                          );
                      } finally {
                        (task.blockedBoundary = parentBoundary),
                          (task.hoistableState = parentHoistableState),
                          (task.replay = previousReplaySet),
                          (task.keyPath = prevKeyPath);
                      }
                      task = createReplayTask(
                        request,
                        null,
                        {
                          nodes: keyOrIndex,
                          slots: node$jscomp$0,
                          pendingTasks: 0
                        },
                        props,
                        -1,
                        parentBoundary,
                        resumedBoundary.fallbackState,
                        fallbackAbortSet,
                        [key[0], "Suspense Fallback", key[2]],
                        task.formatContext,
                        task.context,
                        task.treeContext,
                        task.componentStack,
                        !0
                      );
                      pushComponentStack(task);
                      request.pingedTasks.push(task);
                    }
                  }
                  childIndex.splice(node, 1);
                  break a;
                }
              }
            }
          else renderElement(request, task, key, type, props, ref);
          return;
        case REACT_PORTAL_TYPE:
          throw Error(
            "Portals are not currently supported by the server renderer. Render them conditionally so that they only appear on the client render."
          );
        case REACT_LAZY_TYPE:
          childNodes = node._init;
          node = childNodes(node._payload);
          if (12 === request.status) throw null;
          renderNodeDestructive(request, task, node, childIndex);
          return;
      }
      if (isArrayImpl(node)) {
        renderChildrenArray(request, task, node, childIndex);
        return;
      }
      null === node || "object" !== typeof node
        ? (childNodes = null)
        : ((childNodes =
            (MAYBE_ITERATOR_SYMBOL && node[MAYBE_ITERATOR_SYMBOL]) ||
            node["@@iterator"]),
          (childNodes = "function" === typeof childNodes ? childNodes : null));
      if (childNodes && (childNodes = childNodes.call(node))) {
        node = childNodes.next();
        if (!node.done) {
          props = [];
          do props.push(node.value), (node = childNodes.next());
          while (!node.done);
          renderChildrenArray(request, task, props, childIndex);
        }
        return;
      }
      if (
        "function" === typeof node[ASYNC_ITERATOR] &&
        (childNodes = node[ASYNC_ITERATOR]())
      ) {
        props = task.thenableState;
        task.thenableState = null;
        thenableIndexCounter = 0;
        thenableState = props;
        props = [];
        key = !1;
        if (childNodes === node)
          for (node = readPreviousThenableFromState(); void 0 !== node; ) {
            if (node.done) {
              key = !0;
              break;
            }
            props.push(node.value);
            node = readPreviousThenableFromState();
          }
        if (!key)
          for (node = unwrapThenable(childNodes.next()); !node.done; )
            props.push(node.value), (node = unwrapThenable(childNodes.next()));
        renderChildrenArray(request, task, props, childIndex);
        return;
      }
      if ("function" === typeof node.then)
        return (
          (task.thenableState = null),
          renderNodeDestructive(request, task, unwrapThenable(node), childIndex)
        );
      if (node.$$typeof === REACT_CONTEXT_TYPE)
        return renderNodeDestructive(
          request,
          task,
          node._currentValue,
          childIndex
        );
      request = Object.prototype.toString.call(node);
      throw Error(
        "Objects are not valid as a React child (found: " +
          ("[object Object]" === request
            ? "object with keys {" + Object.keys(node).join(", ") + "}"
            : request) +
          "). If you meant to render a collection of children, use an array instead."
      );
    }
    if ("string" === typeof node)
      (task = task.blockedSegment),
        null !== task &&
          (task.lastPushedText = pushTextInstance(
            task.chunks,
            node,
            request.renderState,
            task.lastPushedText
          ));
    else if ("number" === typeof node || "bigint" === typeof node)
      (task = task.blockedSegment),
        null !== task &&
          (task.lastPushedText = pushTextInstance(
            task.chunks,
            "" + node,
            request.renderState,
            task.lastPushedText
          ));
  }
}
function renderChildrenArray(request, task, children, childIndex) {
  var prevKeyPath = task.keyPath;
  if (
    -1 !== childIndex &&
    ((task.keyPath = [task.keyPath, "Fragment", childIndex]),
    null !== task.replay)
  ) {
    for (
      var replay = task.replay, replayNodes = replay.nodes, j = 0;
      j < replayNodes.length;
      j++
    ) {
      var node = replayNodes[j];
      if (node[1] === childIndex) {
        childIndex = node[2];
        node = node[3];
        task.replay = { nodes: childIndex, slots: node, pendingTasks: 1 };
        try {
          renderChildrenArray(request, task, children, -1);
          if (1 === task.replay.pendingTasks && 0 < task.replay.nodes.length)
            throw Error(
              "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
            );
          task.replay.pendingTasks--;
        } catch (x) {
          if (
            "object" === typeof x &&
            null !== x &&
            (x === SuspenseException || "function" === typeof x.then)
          )
            throw x;
          task.replay.pendingTasks--;
          children = getThrownInfo(task.componentStack);
          erroredReplay(
            request,
            task.blockedBoundary,
            x,
            children,
            childIndex,
            node
          );
        }
        task.replay = replay;
        replayNodes.splice(j, 1);
        break;
      }
    }
    task.keyPath = prevKeyPath;
    return;
  }
  replay = task.treeContext;
  replayNodes = children.length;
  if (
    null !== task.replay &&
    ((j = task.replay.slots), null !== j && "object" === typeof j)
  ) {
    for (childIndex = 0; childIndex < replayNodes; childIndex++) {
      node = children[childIndex];
      task.treeContext = pushTreeContext(replay, replayNodes, childIndex);
      var resumeSegmentID = j[childIndex];
      "number" === typeof resumeSegmentID
        ? (resumeNode(request, task, resumeSegmentID, node, childIndex),
          delete j[childIndex])
        : renderNode(request, task, node, childIndex);
    }
    task.treeContext = replay;
    task.keyPath = prevKeyPath;
    return;
  }
  for (j = 0; j < replayNodes; j++)
    (childIndex = children[j]),
      (task.treeContext = pushTreeContext(replay, replayNodes, j)),
      renderNode(request, task, childIndex, j);
  task.treeContext = replay;
  task.keyPath = prevKeyPath;
}
function trackPostpone(request, trackedPostpones, task, segment) {
  segment.status = 5;
  var keyPath = task.keyPath,
    boundary = task.blockedBoundary;
  if (null === boundary)
    (segment.id = request.nextSegmentId++),
      (trackedPostpones.rootSlots = segment.id),
      null !== request.completedRootSegment &&
        (request.completedRootSegment.status = 5);
  else {
    if (null !== boundary && 0 === boundary.status) {
      boundary.status = 5;
      boundary.rootSegmentID = request.nextSegmentId++;
      var boundaryKeyPath = boundary.trackedContentKeyPath;
      if (null === boundaryKeyPath)
        throw Error(
          "It should not be possible to postpone at the root. This is a bug in React."
        );
      var fallbackReplayNode = boundary.trackedFallbackNode,
        children = [];
      if (boundaryKeyPath === keyPath && -1 === task.childIndex) {
        -1 === segment.id &&
          (segment.id = segment.parentFlushed
            ? boundary.rootSegmentID
            : request.nextSegmentId++);
        segment = [
          boundaryKeyPath[1],
          boundaryKeyPath[2],
          children,
          segment.id,
          fallbackReplayNode,
          boundary.rootSegmentID
        ];
        trackedPostpones.workingMap.set(boundaryKeyPath, segment);
        addToReplayParent(segment, boundaryKeyPath[0], trackedPostpones);
        return;
      }
      var boundaryNode$45 = trackedPostpones.workingMap.get(boundaryKeyPath);
      void 0 === boundaryNode$45
        ? ((boundaryNode$45 = [
            boundaryKeyPath[1],
            boundaryKeyPath[2],
            children,
            null,
            fallbackReplayNode,
            boundary.rootSegmentID
          ]),
          trackedPostpones.workingMap.set(boundaryKeyPath, boundaryNode$45),
          addToReplayParent(
            boundaryNode$45,
            boundaryKeyPath[0],
            trackedPostpones
          ))
        : ((boundaryKeyPath = boundaryNode$45),
          (boundaryKeyPath[4] = fallbackReplayNode),
          (boundaryKeyPath[5] = boundary.rootSegmentID));
    }
    -1 === segment.id &&
      (segment.id =
        segment.parentFlushed && null !== boundary
          ? boundary.rootSegmentID
          : request.nextSegmentId++);
    if (-1 === task.childIndex)
      null === keyPath
        ? (trackedPostpones.rootSlots = segment.id)
        : ((task = trackedPostpones.workingMap.get(keyPath)),
          void 0 === task
            ? ((task = [keyPath[1], keyPath[2], [], segment.id]),
              addToReplayParent(task, keyPath[0], trackedPostpones))
            : (task[3] = segment.id));
    else {
      if (null === keyPath)
        if (((request = trackedPostpones.rootSlots), null === request))
          request = trackedPostpones.rootSlots = {};
        else {
          if ("number" === typeof request)
            throw Error(
              "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
            );
        }
      else if (
        ((boundary = trackedPostpones.workingMap),
        (boundaryKeyPath = boundary.get(keyPath)),
        void 0 === boundaryKeyPath)
      )
        (request = {}),
          (boundaryKeyPath = [keyPath[1], keyPath[2], [], request]),
          boundary.set(keyPath, boundaryKeyPath),
          addToReplayParent(boundaryKeyPath, keyPath[0], trackedPostpones);
      else if (((request = boundaryKeyPath[3]), null === request))
        request = boundaryKeyPath[3] = {};
      else if ("number" === typeof request)
        throw Error(
          "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
        );
      request[task.childIndex] = segment.id;
    }
  }
}
function untrackBoundary(request, boundary) {
  request = request.trackedPostpones;
  null !== request &&
    ((boundary = boundary.trackedContentKeyPath),
    null !== boundary &&
      ((boundary = request.workingMap.get(boundary)),
      void 0 !== boundary &&
        ((boundary.length = 4), (boundary[2] = []), (boundary[3] = null))));
}
function spawnNewSuspendedReplayTask(request, task, thenableState) {
  return createReplayTask(
    request,
    thenableState,
    task.replay,
    task.node,
    task.childIndex,
    task.blockedBoundary,
    task.hoistableState,
    task.abortSet,
    task.keyPath,
    task.formatContext,
    task.context,
    task.treeContext,
    task.componentStack,
    task.isFallback
  );
}
function spawnNewSuspendedRenderTask(request, task, thenableState) {
  var segment = task.blockedSegment,
    newSegment = createPendingSegment(
      request,
      segment.chunks.length,
      null,
      task.formatContext,
      segment.lastPushedText,
      !0
    );
  segment.children.push(newSegment);
  segment.lastPushedText = !1;
  return createRenderTask(
    request,
    thenableState,
    task.node,
    task.childIndex,
    task.blockedBoundary,
    newSegment,
    task.hoistableState,
    task.abortSet,
    task.keyPath,
    task.formatContext,
    task.context,
    task.treeContext,
    task.componentStack,
    task.isFallback
  );
}
function renderNode(request, task, node, childIndex) {
  var previousFormatContext = task.formatContext,
    previousContext = task.context,
    previousKeyPath = task.keyPath,
    previousTreeContext = task.treeContext,
    previousComponentStack = task.componentStack,
    segment = task.blockedSegment;
  if (null === segment)
    try {
      return renderNodeDestructive(request, task, node, childIndex);
    } catch (thrownValue) {
      if (
        (resetHooksState(),
        (childIndex =
          thrownValue === SuspenseException
            ? getSuspendedThenable()
            : thrownValue),
        "object" === typeof childIndex && null !== childIndex)
      ) {
        if ("function" === typeof childIndex.then) {
          node = childIndex;
          childIndex = getThenableStateAfterSuspending();
          request = spawnNewSuspendedReplayTask(request, task, childIndex).ping;
          node.then(request, request);
          task.formatContext = previousFormatContext;
          task.context = previousContext;
          task.keyPath = previousKeyPath;
          task.treeContext = previousTreeContext;
          task.componentStack = previousComponentStack;
          switchContext(previousContext);
          return;
        }
        if ("Maximum call stack size exceeded" === childIndex.message) {
          node = getThenableStateAfterSuspending();
          node = spawnNewSuspendedReplayTask(request, task, node);
          request.pingedTasks.push(node);
          task.formatContext = previousFormatContext;
          task.context = previousContext;
          task.keyPath = previousKeyPath;
          task.treeContext = previousTreeContext;
          task.componentStack = previousComponentStack;
          switchContext(previousContext);
          return;
        }
      }
    }
  else {
    var childrenLength = segment.children.length,
      chunkLength = segment.chunks.length;
    try {
      return renderNodeDestructive(request, task, node, childIndex);
    } catch (thrownValue$57) {
      if (
        (resetHooksState(),
        (segment.children.length = childrenLength),
        (segment.chunks.length = chunkLength),
        (childIndex =
          thrownValue$57 === SuspenseException
            ? getSuspendedThenable()
            : thrownValue$57),
        "object" === typeof childIndex && null !== childIndex)
      ) {
        if ("function" === typeof childIndex.then) {
          node = childIndex;
          childIndex = getThenableStateAfterSuspending();
          request = spawnNewSuspendedRenderTask(request, task, childIndex).ping;
          node.then(request, request);
          task.formatContext = previousFormatContext;
          task.context = previousContext;
          task.keyPath = previousKeyPath;
          task.treeContext = previousTreeContext;
          task.componentStack = previousComponentStack;
          switchContext(previousContext);
          return;
        }
        if (
          childIndex.$$typeof === REACT_POSTPONE_TYPE &&
          null !== request.trackedPostpones &&
          null !== task.blockedBoundary
        ) {
          node = request.trackedPostpones;
          segment = getThrownInfo(task.componentStack);
          logPostpone(request, childIndex.message, segment);
          childIndex = task.blockedSegment;
          segment = createPendingSegment(
            request,
            childIndex.chunks.length,
            null,
            task.formatContext,
            childIndex.lastPushedText,
            !0
          );
          childIndex.children.push(segment);
          childIndex.lastPushedText = !1;
          trackPostpone(request, node, task, segment);
          task.formatContext = previousFormatContext;
          task.context = previousContext;
          task.keyPath = previousKeyPath;
          task.treeContext = previousTreeContext;
          task.componentStack = previousComponentStack;
          switchContext(previousContext);
          return;
        }
        if ("Maximum call stack size exceeded" === childIndex.message) {
          node = getThenableStateAfterSuspending();
          node = spawnNewSuspendedRenderTask(request, task, node);
          request.pingedTasks.push(node);
          task.formatContext = previousFormatContext;
          task.context = previousContext;
          task.keyPath = previousKeyPath;
          task.treeContext = previousTreeContext;
          task.componentStack = previousComponentStack;
          switchContext(previousContext);
          return;
        }
      }
    }
  }
  task.formatContext = previousFormatContext;
  task.context = previousContext;
  task.keyPath = previousKeyPath;
  task.treeContext = previousTreeContext;
  switchContext(previousContext);
  throw childIndex;
}
function erroredReplay(
  request,
  boundary,
  error,
  errorInfo,
  replayNodes,
  resumeSlots
) {
  "object" === typeof error &&
  null !== error &&
  error.$$typeof === REACT_POSTPONE_TYPE
    ? (logPostpone(request, error.message, errorInfo), (errorInfo = "POSTPONE"))
    : (errorInfo = logRecoverableError(request, error, errorInfo));
  abortRemainingReplayNodes(
    request,
    boundary,
    replayNodes,
    resumeSlots,
    error,
    errorInfo
  );
}
function abortTaskSoft(task) {
  var boundary = task.blockedBoundary;
  task = task.blockedSegment;
  null !== task && ((task.status = 3), finishedTask(this, boundary, task));
}
function abortRemainingReplayNodes(
  request$jscomp$0,
  boundary,
  nodes,
  slots,
  error,
  errorDigest$jscomp$0
) {
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (4 === node.length)
      abortRemainingReplayNodes(
        request$jscomp$0,
        boundary,
        node[2],
        node[3],
        error,
        errorDigest$jscomp$0
      );
    else {
      node = node[5];
      var request = request$jscomp$0,
        errorDigest = errorDigest$jscomp$0,
        resumedBoundary = createSuspenseBoundary(request, new Set());
      resumedBoundary.parentFlushed = !0;
      resumedBoundary.rootSegmentID = node;
      resumedBoundary.status = 4;
      resumedBoundary.errorDigest = errorDigest;
      resumedBoundary.parentFlushed &&
        request.clientRenderedBoundaries.push(resumedBoundary);
    }
  }
  nodes.length = 0;
  if (null !== slots) {
    if (null === boundary)
      throw Error(
        "We should not have any resumable nodes in the shell. This is a bug in React."
      );
    4 !== boundary.status &&
      ((boundary.status = 4),
      (boundary.errorDigest = errorDigest$jscomp$0),
      boundary.parentFlushed &&
        request$jscomp$0.clientRenderedBoundaries.push(boundary));
    if ("object" === typeof slots) for (var index in slots) delete slots[index];
  }
}
function abortTask(task, request, error) {
  var boundary = task.blockedBoundary,
    segment = task.blockedSegment;
  if (null !== segment) {
    if (6 === segment.status) return;
    segment.status = 3;
  }
  var errorInfo = getThrownInfo(task.componentStack);
  if (null === boundary) {
    if (13 !== request.status && 14 !== request.status) {
      boundary = task.replay;
      if (null === boundary) {
        "object" === typeof error &&
        null !== error &&
        error.$$typeof === REACT_POSTPONE_TYPE
          ? ((boundary = request.trackedPostpones),
            null !== boundary && null !== segment
              ? (logPostpone(request, error.message, errorInfo),
                trackPostpone(request, boundary, task, segment),
                finishedTask(request, null, segment))
              : ((task = Error(
                  "The render was aborted with postpone when the shell is incomplete. Reason: " +
                    error.message
                )),
                logRecoverableError(request, task, errorInfo),
                fatalError(request, task)))
          : null !== request.trackedPostpones && null !== segment
            ? ((boundary = request.trackedPostpones),
              logRecoverableError(request, error, errorInfo),
              trackPostpone(request, boundary, task, segment),
              finishedTask(request, null, segment))
            : (logRecoverableError(request, error, errorInfo),
              fatalError(request, error));
        return;
      }
      boundary.pendingTasks--;
      0 === boundary.pendingTasks &&
        0 < boundary.nodes.length &&
        ("object" === typeof error &&
        null !== error &&
        error.$$typeof === REACT_POSTPONE_TYPE
          ? (logPostpone(request, error.message, errorInfo),
            (errorInfo = "POSTPONE"))
          : (errorInfo = logRecoverableError(request, error, errorInfo)),
        abortRemainingReplayNodes(
          request,
          null,
          boundary.nodes,
          boundary.slots,
          error,
          errorInfo
        ));
      request.pendingRootTasks--;
      0 === request.pendingRootTasks && completeShell(request);
    }
  } else {
    boundary.pendingTasks--;
    var trackedPostpones$60 = request.trackedPostpones;
    if (4 !== boundary.status) {
      if (null !== trackedPostpones$60 && null !== segment)
        return (
          "object" === typeof error &&
          null !== error &&
          error.$$typeof === REACT_POSTPONE_TYPE
            ? logPostpone(request, error.message, errorInfo)
            : logRecoverableError(request, error, errorInfo),
          trackPostpone(request, trackedPostpones$60, task, segment),
          boundary.fallbackAbortableTasks.forEach(function (fallbackTask) {
            return abortTask(fallbackTask, request, error);
          }),
          boundary.fallbackAbortableTasks.clear(),
          finishedTask(request, boundary, segment)
        );
      boundary.status = 4;
      if (
        "object" === typeof error &&
        null !== error &&
        error.$$typeof === REACT_POSTPONE_TYPE
      ) {
        logPostpone(request, error.message, errorInfo);
        if (null !== request.trackedPostpones && null !== segment) {
          trackPostpone(request, request.trackedPostpones, task, segment);
          finishedTask(request, task.blockedBoundary, segment);
          boundary.fallbackAbortableTasks.forEach(function (fallbackTask) {
            return abortTask(fallbackTask, request, error);
          });
          boundary.fallbackAbortableTasks.clear();
          return;
        }
        errorInfo = "POSTPONE";
      } else errorInfo = logRecoverableError(request, error, errorInfo);
      boundary.status = 4;
      boundary.errorDigest = errorInfo;
      untrackBoundary(request, boundary);
      boundary.parentFlushed && request.clientRenderedBoundaries.push(boundary);
    }
    boundary.fallbackAbortableTasks.forEach(function (fallbackTask) {
      return abortTask(fallbackTask, request, error);
    });
    boundary.fallbackAbortableTasks.clear();
  }
  request.allPendingTasks--;
  0 === request.allPendingTasks && completeAll(request);
}
function safelyEmitEarlyPreloads(request, shellComplete) {
  try {
    var renderState = request.renderState,
      onHeaders = renderState.onHeaders;
    if (onHeaders) {
      var headers = renderState.headers;
      if (headers) {
        renderState.headers = null;
        var linkHeader = headers.preconnects;
        headers.fontPreloads &&
          (linkHeader && (linkHeader += ", "),
          (linkHeader += headers.fontPreloads));
        headers.highImagePreloads &&
          (linkHeader && (linkHeader += ", "),
          (linkHeader += headers.highImagePreloads));
        if (!shellComplete) {
          var queueIter = renderState.styles.values(),
            queueStep = queueIter.next();
          b: for (
            ;
            0 < headers.remainingCapacity && !queueStep.done;
            queueStep = queueIter.next()
          )
            for (
              var sheetIter = queueStep.value.sheets.values(),
                sheetStep = sheetIter.next();
              0 < headers.remainingCapacity && !sheetStep.done;
              sheetStep = sheetIter.next()
            ) {
              var sheet = sheetStep.value,
                props = sheet.props,
                key = props.href,
                props$jscomp$0 = sheet.props,
                header = getPreloadAsHeader(props$jscomp$0.href, "style", {
                  crossOrigin: props$jscomp$0.crossOrigin,
                  integrity: props$jscomp$0.integrity,
                  nonce: props$jscomp$0.nonce,
                  type: props$jscomp$0.type,
                  fetchPriority: props$jscomp$0.fetchPriority,
                  referrerPolicy: props$jscomp$0.referrerPolicy,
                  media: props$jscomp$0.media
                });
              if (0 <= (headers.remainingCapacity -= header.length + 2))
                (renderState.resets.style[key] = PRELOAD_NO_CREDS),
                  linkHeader && (linkHeader += ", "),
                  (linkHeader += header),
                  (renderState.resets.style[key] =
                    "string" === typeof props.crossOrigin ||
                    "string" === typeof props.integrity
                      ? [props.crossOrigin, props.integrity]
                      : PRELOAD_NO_CREDS);
              else break b;
            }
        }
        linkHeader ? onHeaders({ Link: linkHeader }) : onHeaders({});
      }
    }
  } catch (error) {
    logRecoverableError(request, error, {});
  }
}
function completeShell(request) {
  null === request.trackedPostpones && safelyEmitEarlyPreloads(request, !0);
  request.onShellError = noop;
  request = request.onShellReady;
  request();
}
function completeAll(request) {
  safelyEmitEarlyPreloads(
    request,
    null === request.trackedPostpones
      ? !0
      : null === request.completedRootSegment ||
          5 !== request.completedRootSegment.status
  );
  request = request.onAllReady;
  request();
}
function queueCompletedSegment(boundary, segment) {
  if (
    0 === segment.chunks.length &&
    1 === segment.children.length &&
    null === segment.children[0].boundary &&
    -1 === segment.children[0].id
  ) {
    var childSegment = segment.children[0];
    childSegment.id = segment.id;
    childSegment.parentFlushed = !0;
    1 === childSegment.status && queueCompletedSegment(boundary, childSegment);
  } else boundary.completedSegments.push(segment);
}
function finishedTask(request, boundary, segment) {
  if (null === boundary) {
    if (null !== segment && segment.parentFlushed) {
      if (null !== request.completedRootSegment)
        throw Error(
          "There can only be one root segment. This is a bug in React."
        );
      request.completedRootSegment = segment;
    }
    request.pendingRootTasks--;
    0 === request.pendingRootTasks && completeShell(request);
  } else
    boundary.pendingTasks--,
      4 !== boundary.status &&
        (0 === boundary.pendingTasks
          ? (0 === boundary.status && (boundary.status = 1),
            null !== segment &&
              segment.parentFlushed &&
              1 === segment.status &&
              queueCompletedSegment(boundary, segment),
            boundary.parentFlushed &&
              request.completedBoundaries.push(boundary),
            1 === boundary.status &&
              (boundary.fallbackAbortableTasks.forEach(abortTaskSoft, request),
              boundary.fallbackAbortableTasks.clear()))
          : null !== segment &&
            segment.parentFlushed &&
            1 === segment.status &&
            (queueCompletedSegment(boundary, segment),
            1 === boundary.completedSegments.length &&
              boundary.parentFlushed &&
              request.partialBoundaries.push(boundary)));
  request.allPendingTasks--;
  0 === request.allPendingTasks && completeAll(request);
}
function performWork(request$jscomp$1) {
  if (14 !== request$jscomp$1.status && 13 !== request$jscomp$1.status) {
    var prevContext = currentActiveSnapshot,
      prevDispatcher = ReactSharedInternals.H;
    ReactSharedInternals.H = HooksDispatcher;
    var prevAsyncDispatcher = ReactSharedInternals.A;
    ReactSharedInternals.A = DefaultAsyncDispatcher;
    var prevRequest = currentRequest;
    currentRequest = request$jscomp$1;
    var prevResumableState = currentResumableState;
    currentResumableState = request$jscomp$1.resumableState;
    try {
      var pingedTasks = request$jscomp$1.pingedTasks,
        i;
      for (i = 0; i < pingedTasks.length; i++) {
        var task = pingedTasks[i],
          request = request$jscomp$1,
          segment = task.blockedSegment;
        if (null === segment) {
          var request$jscomp$0 = request;
          if (0 !== task.replay.pendingTasks) {
            switchContext(task.context);
            try {
              "number" === typeof task.replay.slots
                ? resumeNode(
                    request$jscomp$0,
                    task,
                    task.replay.slots,
                    task.node,
                    task.childIndex
                  )
                : retryNode(request$jscomp$0, task);
              if (
                1 === task.replay.pendingTasks &&
                0 < task.replay.nodes.length
              )
                throw Error(
                  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                );
              task.replay.pendingTasks--;
              task.abortSet.delete(task);
              finishedTask(request$jscomp$0, task.blockedBoundary, null);
            } catch (thrownValue) {
              resetHooksState();
              var x =
                thrownValue === SuspenseException
                  ? getSuspendedThenable()
                  : thrownValue;
              if (
                "object" === typeof x &&
                null !== x &&
                "function" === typeof x.then
              ) {
                var ping = task.ping;
                x.then(ping, ping);
                task.thenableState = getThenableStateAfterSuspending();
              } else {
                task.replay.pendingTasks--;
                task.abortSet.delete(task);
                var errorInfo = getThrownInfo(task.componentStack);
                erroredReplay(
                  request$jscomp$0,
                  task.blockedBoundary,
                  12 === request$jscomp$0.status
                    ? request$jscomp$0.fatalError
                    : x,
                  errorInfo,
                  task.replay.nodes,
                  task.replay.slots
                );
                request$jscomp$0.pendingRootTasks--;
                0 === request$jscomp$0.pendingRootTasks &&
                  completeShell(request$jscomp$0);
                request$jscomp$0.allPendingTasks--;
                0 === request$jscomp$0.allPendingTasks &&
                  completeAll(request$jscomp$0);
              }
            } finally {
            }
          }
        } else
          a: {
            request$jscomp$0 = void 0;
            var segment$jscomp$0 = segment;
            if (0 === segment$jscomp$0.status) {
              segment$jscomp$0.status = 6;
              switchContext(task.context);
              var childrenLength = segment$jscomp$0.children.length,
                chunkLength = segment$jscomp$0.chunks.length;
              try {
                retryNode(request, task),
                  segment$jscomp$0.lastPushedText &&
                    segment$jscomp$0.textEmbedded &&
                    segment$jscomp$0.chunks.push(textSeparator),
                  task.abortSet.delete(task),
                  (segment$jscomp$0.status = 1),
                  finishedTask(request, task.blockedBoundary, segment$jscomp$0);
              } catch (thrownValue) {
                resetHooksState();
                segment$jscomp$0.children.length = childrenLength;
                segment$jscomp$0.chunks.length = chunkLength;
                var x$jscomp$0 =
                  thrownValue === SuspenseException
                    ? getSuspendedThenable()
                    : 12 === request.status
                      ? request.fatalError
                      : thrownValue;
                if (
                  12 === request.status &&
                  null !== request.trackedPostpones
                ) {
                  var trackedPostpones = request.trackedPostpones,
                    thrownInfo = getThrownInfo(task.componentStack);
                  task.abortSet.delete(task);
                  "object" === typeof x$jscomp$0 &&
                  null !== x$jscomp$0 &&
                  x$jscomp$0.$$typeof === REACT_POSTPONE_TYPE
                    ? logPostpone(request, x$jscomp$0.message, thrownInfo)
                    : logRecoverableError(request, x$jscomp$0, thrownInfo);
                  trackPostpone(
                    request,
                    trackedPostpones,
                    task,
                    segment$jscomp$0
                  );
                  finishedTask(request, task.blockedBoundary, segment$jscomp$0);
                } else {
                  if ("object" === typeof x$jscomp$0 && null !== x$jscomp$0) {
                    if ("function" === typeof x$jscomp$0.then) {
                      segment$jscomp$0.status = 0;
                      task.thenableState = getThenableStateAfterSuspending();
                      var ping$jscomp$0 = task.ping;
                      x$jscomp$0.then(ping$jscomp$0, ping$jscomp$0);
                      break a;
                    }
                    if (
                      null !== request.trackedPostpones &&
                      x$jscomp$0.$$typeof === REACT_POSTPONE_TYPE
                    ) {
                      var trackedPostpones$64 = request.trackedPostpones;
                      task.abortSet.delete(task);
                      var postponeInfo = getThrownInfo(task.componentStack);
                      logPostpone(request, x$jscomp$0.message, postponeInfo);
                      trackPostpone(
                        request,
                        trackedPostpones$64,
                        task,
                        segment$jscomp$0
                      );
                      finishedTask(
                        request,
                        task.blockedBoundary,
                        segment$jscomp$0
                      );
                      break a;
                    }
                  }
                  var errorInfo$jscomp$0 = getThrownInfo(task.componentStack);
                  task.abortSet.delete(task);
                  segment$jscomp$0.status = 4;
                  var boundary = task.blockedBoundary;
                  "object" === typeof x$jscomp$0 &&
                  null !== x$jscomp$0 &&
                  x$jscomp$0.$$typeof === REACT_POSTPONE_TYPE
                    ? (logPostpone(
                        request,
                        x$jscomp$0.message,
                        errorInfo$jscomp$0
                      ),
                      (request$jscomp$0 = "POSTPONE"))
                    : (request$jscomp$0 = logRecoverableError(
                        request,
                        x$jscomp$0,
                        errorInfo$jscomp$0
                      ));
                  null === boundary
                    ? fatalError(request, x$jscomp$0)
                    : (boundary.pendingTasks--,
                      4 !== boundary.status &&
                        ((boundary.status = 4),
                        (boundary.errorDigest = request$jscomp$0),
                        untrackBoundary(request, boundary),
                        boundary.parentFlushed &&
                          request.clientRenderedBoundaries.push(boundary)));
                  request.allPendingTasks--;
                  0 === request.allPendingTasks && completeAll(request);
                }
              } finally {
              }
            }
          }
      }
      pingedTasks.splice(0, i);
      null !== request$jscomp$1.destination &&
        flushCompletedQueues(request$jscomp$1, request$jscomp$1.destination);
    } catch (error) {
      logRecoverableError(request$jscomp$1, error, {}),
        fatalError(request$jscomp$1, error);
    } finally {
      (currentResumableState = prevResumableState),
        (ReactSharedInternals.H = prevDispatcher),
        (ReactSharedInternals.A = prevAsyncDispatcher),
        prevDispatcher === HooksDispatcher && switchContext(prevContext),
        (currentRequest = prevRequest);
    }
  }
}
function flushSubtree(request, destination, segment, hoistableState) {
  segment.parentFlushed = !0;
  switch (segment.status) {
    case 0:
      segment.id = request.nextSegmentId++;
    case 5:
      return (
        (hoistableState = segment.id),
        (segment.lastPushedText = !1),
        (segment.textEmbedded = !1),
        (request = request.renderState),
        writeChunk(destination, placeholder1),
        writeChunk(destination, request.placeholderPrefix),
        (request = stringToChunk(hoistableState.toString(16))),
        writeChunk(destination, request),
        writeChunkAndReturn(destination, placeholder2)
      );
    case 1:
      segment.status = 2;
      var r = !0,
        chunks = segment.chunks,
        chunkIdx = 0;
      segment = segment.children;
      for (var childIdx = 0; childIdx < segment.length; childIdx++) {
        for (r = segment[childIdx]; chunkIdx < r.index; chunkIdx++)
          writeChunk(destination, chunks[chunkIdx]);
        r = flushSegment(request, destination, r, hoistableState);
      }
      for (; chunkIdx < chunks.length - 1; chunkIdx++)
        writeChunk(destination, chunks[chunkIdx]);
      chunkIdx < chunks.length &&
        (r = writeChunkAndReturn(destination, chunks[chunkIdx]));
      return r;
    default:
      throw Error(
        "Aborted, errored or already flushed boundaries should not be flushed again. This is a bug in React."
      );
  }
}
function flushSegment(request, destination, segment, hoistableState) {
  var boundary = segment.boundary;
  if (null === boundary)
    return flushSubtree(request, destination, segment, hoistableState);
  boundary.parentFlushed = !0;
  if (4 === boundary.status)
    (boundary = boundary.errorDigest),
      writeChunkAndReturn(destination, startClientRenderedSuspenseBoundary),
      writeChunk(destination, clientRenderedSuspenseBoundaryError1),
      boundary &&
        (writeChunk(destination, clientRenderedSuspenseBoundaryError1A),
        writeChunk(destination, stringToChunk(escapeTextForBrowser(boundary))),
        writeChunk(
          destination,
          clientRenderedSuspenseBoundaryErrorAttrInterstitial
        )),
      writeChunkAndReturn(destination, clientRenderedSuspenseBoundaryError2),
      flushSubtree(request, destination, segment, hoistableState);
  else if (1 !== boundary.status)
    0 === boundary.status && (boundary.rootSegmentID = request.nextSegmentId++),
      0 < boundary.completedSegments.length &&
        request.partialBoundaries.push(boundary),
      writeStartPendingSuspenseBoundary(
        destination,
        request.renderState,
        boundary.rootSegmentID
      ),
      hoistableState &&
        ((boundary = boundary.fallbackState),
        boundary.styles.forEach(hoistStyleQueueDependency, hoistableState),
        boundary.stylesheets.forEach(
          hoistStylesheetDependency,
          hoistableState
        )),
      flushSubtree(request, destination, segment, hoistableState);
  else if (boundary.byteSize > request.progressiveChunkSize)
    (boundary.rootSegmentID = request.nextSegmentId++),
      request.completedBoundaries.push(boundary),
      writeStartPendingSuspenseBoundary(
        destination,
        request.renderState,
        boundary.rootSegmentID
      ),
      flushSubtree(request, destination, segment, hoistableState);
  else {
    hoistableState &&
      ((segment = boundary.contentState),
      segment.styles.forEach(hoistStyleQueueDependency, hoistableState),
      segment.stylesheets.forEach(hoistStylesheetDependency, hoistableState));
    writeChunkAndReturn(destination, startCompletedSuspenseBoundary);
    segment = boundary.completedSegments;
    if (1 !== segment.length)
      throw Error(
        "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
      );
    flushSegment(request, destination, segment[0], hoistableState);
  }
  return writeChunkAndReturn(destination, endSuspenseBoundary);
}
function flushSegmentContainer(request, destination, segment, hoistableState) {
  writeStartSegment(
    destination,
    request.renderState,
    segment.parentFormatContext,
    segment.id
  );
  flushSegment(request, destination, segment, hoistableState);
  return writeEndSegment(destination, segment.parentFormatContext);
}
function flushCompletedBoundary(request, destination, boundary) {
  for (
    var completedSegments = boundary.completedSegments, i = 0;
    i < completedSegments.length;
    i++
  )
    flushPartiallyCompletedSegment(
      request,
      destination,
      boundary,
      completedSegments[i]
    );
  completedSegments.length = 0;
  writeHoistablesForBoundary(
    destination,
    boundary.contentState,
    request.renderState
  );
  completedSegments = request.resumableState;
  request = request.renderState;
  i = boundary.rootSegmentID;
  boundary = boundary.contentState;
  var requiresStyleInsertion = request.stylesToHoist;
  request.stylesToHoist = !1;
  var scriptFormat = 0 === completedSegments.streamingFormat;
  scriptFormat
    ? (writeChunk(destination, request.startInlineScript),
      requiresStyleInsertion
        ? 0 === (completedSegments.instructions & 2)
          ? ((completedSegments.instructions |= 10),
            writeChunk(destination, completeBoundaryWithStylesScript1FullBoth))
          : 0 === (completedSegments.instructions & 8)
            ? ((completedSegments.instructions |= 8),
              writeChunk(
                destination,
                completeBoundaryWithStylesScript1FullPartial
              ))
            : writeChunk(destination, completeBoundaryWithStylesScript1Partial)
        : 0 === (completedSegments.instructions & 2)
          ? ((completedSegments.instructions |= 2),
            writeChunk(destination, completeBoundaryScript1Full))
          : writeChunk(destination, completeBoundaryScript1Partial))
    : requiresStyleInsertion
      ? writeChunk(destination, completeBoundaryWithStylesData1)
      : writeChunk(destination, completeBoundaryData1);
  completedSegments = stringToChunk(i.toString(16));
  writeChunk(destination, request.boundaryPrefix);
  writeChunk(destination, completedSegments);
  scriptFormat
    ? writeChunk(destination, completeBoundaryScript2)
    : writeChunk(destination, completeBoundaryData2);
  writeChunk(destination, request.segmentPrefix);
  writeChunk(destination, completedSegments);
  requiresStyleInsertion
    ? scriptFormat
      ? (writeChunk(destination, completeBoundaryScript3a),
        writeStyleResourceDependenciesInJS(destination, boundary))
      : (writeChunk(destination, completeBoundaryData3a),
        writeStyleResourceDependenciesInAttr(destination, boundary))
    : scriptFormat && writeChunk(destination, completeBoundaryScript3b);
  completedSegments = scriptFormat
    ? writeChunkAndReturn(destination, completeBoundaryScriptEnd)
    : writeChunkAndReturn(destination, dataElementQuotedEnd);
  return writeBootstrap(destination, request) && completedSegments;
}
function flushPartiallyCompletedSegment(
  request,
  destination,
  boundary,
  segment
) {
  if (2 === segment.status) return !0;
  var hoistableState = boundary.contentState,
    segmentID = segment.id;
  if (-1 === segmentID) {
    if (-1 === (segment.id = boundary.rootSegmentID))
      throw Error(
        "A root segment ID must have been assigned by now. This is a bug in React."
      );
    return flushSegmentContainer(request, destination, segment, hoistableState);
  }
  if (segmentID === boundary.rootSegmentID)
    return flushSegmentContainer(request, destination, segment, hoistableState);
  flushSegmentContainer(request, destination, segment, hoistableState);
  boundary = request.resumableState;
  request = request.renderState;
  (segment = 0 === boundary.streamingFormat)
    ? (writeChunk(destination, request.startInlineScript),
      0 === (boundary.instructions & 1)
        ? ((boundary.instructions |= 1),
          writeChunk(destination, completeSegmentScript1Full))
        : writeChunk(destination, completeSegmentScript1Partial))
    : writeChunk(destination, completeSegmentData1);
  writeChunk(destination, request.segmentPrefix);
  segmentID = stringToChunk(segmentID.toString(16));
  writeChunk(destination, segmentID);
  segment
    ? writeChunk(destination, completeSegmentScript2)
    : writeChunk(destination, completeSegmentData2);
  writeChunk(destination, request.placeholderPrefix);
  writeChunk(destination, segmentID);
  destination = segment
    ? writeChunkAndReturn(destination, completeSegmentScriptEnd)
    : writeChunkAndReturn(destination, dataElementQuotedEnd);
  return destination;
}
function flushCompletedQueues(request, destination) {
  currentView = new Uint8Array(2048);
  writtenBytes = 0;
  try {
    if (!(0 < request.pendingRootTasks)) {
      var i,
        completedRootSegment = request.completedRootSegment;
      if (null !== completedRootSegment) {
        if (5 === completedRootSegment.status) return;
        var renderState = request.renderState;
        if (
          (0 !== request.allPendingTasks ||
            null !== request.trackedPostpones) &&
          renderState.externalRuntimeScript
        ) {
          var _renderState$external = renderState.externalRuntimeScript,
            resumableState = request.resumableState,
            src = _renderState$external.src,
            chunks = _renderState$external.chunks;
          resumableState.scriptResources.hasOwnProperty(src) ||
            ((resumableState.scriptResources[src] = null),
            renderState.scripts.add(chunks));
        }
        var htmlChunks = renderState.htmlChunks,
          headChunks = renderState.headChunks,
          i$jscomp$0;
        if (htmlChunks) {
          for (i$jscomp$0 = 0; i$jscomp$0 < htmlChunks.length; i$jscomp$0++)
            writeChunk(destination, htmlChunks[i$jscomp$0]);
          if (headChunks)
            for (i$jscomp$0 = 0; i$jscomp$0 < headChunks.length; i$jscomp$0++)
              writeChunk(destination, headChunks[i$jscomp$0]);
          else
            writeChunk(destination, startChunkForTag("head")),
              writeChunk(destination, endOfStartTag);
        } else if (headChunks)
          for (i$jscomp$0 = 0; i$jscomp$0 < headChunks.length; i$jscomp$0++)
            writeChunk(destination, headChunks[i$jscomp$0]);
        var charsetChunks = renderState.charsetChunks;
        for (i$jscomp$0 = 0; i$jscomp$0 < charsetChunks.length; i$jscomp$0++)
          writeChunk(destination, charsetChunks[i$jscomp$0]);
        charsetChunks.length = 0;
        renderState.preconnects.forEach(flushResource, destination);
        renderState.preconnects.clear();
        var viewportChunks = renderState.viewportChunks;
        for (i$jscomp$0 = 0; i$jscomp$0 < viewportChunks.length; i$jscomp$0++)
          writeChunk(destination, viewportChunks[i$jscomp$0]);
        viewportChunks.length = 0;
        renderState.fontPreloads.forEach(flushResource, destination);
        renderState.fontPreloads.clear();
        renderState.highImagePreloads.forEach(flushResource, destination);
        renderState.highImagePreloads.clear();
        renderState.styles.forEach(flushStylesInPreamble, destination);
        var importMapChunks = renderState.importMapChunks;
        for (i$jscomp$0 = 0; i$jscomp$0 < importMapChunks.length; i$jscomp$0++)
          writeChunk(destination, importMapChunks[i$jscomp$0]);
        importMapChunks.length = 0;
        renderState.bootstrapScripts.forEach(flushResource, destination);
        renderState.scripts.forEach(flushResource, destination);
        renderState.scripts.clear();
        renderState.bulkPreloads.forEach(flushResource, destination);
        renderState.bulkPreloads.clear();
        var hoistableChunks = renderState.hoistableChunks;
        for (i$jscomp$0 = 0; i$jscomp$0 < hoistableChunks.length; i$jscomp$0++)
          writeChunk(destination, hoistableChunks[i$jscomp$0]);
        hoistableChunks.length = 0;
        htmlChunks &&
          null === headChunks &&
          writeChunk(destination, endChunkForTag("head"));
        flushSegment(request, destination, completedRootSegment, null);
        request.completedRootSegment = null;
        writeBootstrap(destination, request.renderState);
      }
      var renderState$jscomp$0 = request.renderState;
      completedRootSegment = 0;
      var viewportChunks$jscomp$0 = renderState$jscomp$0.viewportChunks;
      for (
        completedRootSegment = 0;
        completedRootSegment < viewportChunks$jscomp$0.length;
        completedRootSegment++
      )
        writeChunk(destination, viewportChunks$jscomp$0[completedRootSegment]);
      viewportChunks$jscomp$0.length = 0;
      renderState$jscomp$0.preconnects.forEach(flushResource, destination);
      renderState$jscomp$0.preconnects.clear();
      renderState$jscomp$0.fontPreloads.forEach(flushResource, destination);
      renderState$jscomp$0.fontPreloads.clear();
      renderState$jscomp$0.highImagePreloads.forEach(
        flushResource,
        destination
      );
      renderState$jscomp$0.highImagePreloads.clear();
      renderState$jscomp$0.styles.forEach(preloadLateStyles, destination);
      renderState$jscomp$0.scripts.forEach(flushResource, destination);
      renderState$jscomp$0.scripts.clear();
      renderState$jscomp$0.bulkPreloads.forEach(flushResource, destination);
      renderState$jscomp$0.bulkPreloads.clear();
      var hoistableChunks$jscomp$0 = renderState$jscomp$0.hoistableChunks;
      for (
        completedRootSegment = 0;
        completedRootSegment < hoistableChunks$jscomp$0.length;
        completedRootSegment++
      )
        writeChunk(destination, hoistableChunks$jscomp$0[completedRootSegment]);
      hoistableChunks$jscomp$0.length = 0;
      var clientRenderedBoundaries = request.clientRenderedBoundaries;
      for (i = 0; i < clientRenderedBoundaries.length; i++) {
        var boundary = clientRenderedBoundaries[i];
        renderState$jscomp$0 = destination;
        var resumableState$jscomp$0 = request.resumableState,
          renderState$jscomp$1 = request.renderState,
          id = boundary.rootSegmentID,
          errorDigest = boundary.errorDigest,
          scriptFormat = 0 === resumableState$jscomp$0.streamingFormat;
        scriptFormat
          ? (writeChunk(
              renderState$jscomp$0,
              renderState$jscomp$1.startInlineScript
            ),
            0 === (resumableState$jscomp$0.instructions & 4)
              ? ((resumableState$jscomp$0.instructions |= 4),
                writeChunk(renderState$jscomp$0, clientRenderScript1Full))
              : writeChunk(renderState$jscomp$0, clientRenderScript1Partial))
          : writeChunk(renderState$jscomp$0, clientRenderData1);
        writeChunk(renderState$jscomp$0, renderState$jscomp$1.boundaryPrefix);
        writeChunk(renderState$jscomp$0, stringToChunk(id.toString(16)));
        scriptFormat && writeChunk(renderState$jscomp$0, clientRenderScript1A);
        errorDigest &&
          (scriptFormat
            ? (writeChunk(
                renderState$jscomp$0,
                clientRenderErrorScriptArgInterstitial
              ),
              writeChunk(
                renderState$jscomp$0,
                stringToChunk(
                  escapeJSStringsForInstructionScripts(errorDigest || "")
                )
              ))
            : (writeChunk(renderState$jscomp$0, clientRenderData2),
              writeChunk(
                renderState$jscomp$0,
                stringToChunk(escapeTextForBrowser(errorDigest || ""))
              )));
        var JSCompiler_inline_result = scriptFormat
          ? writeChunkAndReturn(renderState$jscomp$0, clientRenderScriptEnd)
          : writeChunkAndReturn(renderState$jscomp$0, dataElementQuotedEnd);
        if (!JSCompiler_inline_result) {
          request.destination = null;
          i++;
          clientRenderedBoundaries.splice(0, i);
          return;
        }
      }
      clientRenderedBoundaries.splice(0, i);
      var completedBoundaries = request.completedBoundaries;
      for (i = 0; i < completedBoundaries.length; i++)
        if (
          !flushCompletedBoundary(request, destination, completedBoundaries[i])
        ) {
          request.destination = null;
          i++;
          completedBoundaries.splice(0, i);
          return;
        }
      completedBoundaries.splice(0, i);
      completeWriting(destination);
      currentView = new Uint8Array(2048);
      writtenBytes = 0;
      var partialBoundaries = request.partialBoundaries;
      for (i = 0; i < partialBoundaries.length; i++) {
        var boundary$67 = partialBoundaries[i];
        a: {
          clientRenderedBoundaries = request;
          boundary = destination;
          var completedSegments = boundary$67.completedSegments;
          for (
            JSCompiler_inline_result = 0;
            JSCompiler_inline_result < completedSegments.length;
            JSCompiler_inline_result++
          )
            if (
              !flushPartiallyCompletedSegment(
                clientRenderedBoundaries,
                boundary,
                boundary$67,
                completedSegments[JSCompiler_inline_result]
              )
            ) {
              JSCompiler_inline_result++;
              completedSegments.splice(0, JSCompiler_inline_result);
              var JSCompiler_inline_result$jscomp$0 = !1;
              break a;
            }
          completedSegments.splice(0, JSCompiler_inline_result);
          JSCompiler_inline_result$jscomp$0 = writeHoistablesForBoundary(
            boundary,
            boundary$67.contentState,
            clientRenderedBoundaries.renderState
          );
        }
        if (!JSCompiler_inline_result$jscomp$0) {
          request.destination = null;
          i++;
          partialBoundaries.splice(0, i);
          return;
        }
      }
      partialBoundaries.splice(0, i);
      var largeBoundaries = request.completedBoundaries;
      for (i = 0; i < largeBoundaries.length; i++)
        if (!flushCompletedBoundary(request, destination, largeBoundaries[i])) {
          request.destination = null;
          i++;
          largeBoundaries.splice(0, i);
          return;
        }
      largeBoundaries.splice(0, i);
    }
  } finally {
    0 === request.allPendingTasks &&
    0 === request.pingedTasks.length &&
    0 === request.clientRenderedBoundaries.length &&
    0 === request.completedBoundaries.length
      ? ((request.flushScheduled = !1),
        null === request.trackedPostpones &&
          ((i = request.resumableState),
          i.hasBody && writeChunk(destination, endChunkForTag("body")),
          i.hasHtml && writeChunk(destination, endChunkForTag("html"))),
        completeWriting(destination),
        (request.status = 14),
        destination.close(),
        (request.destination = null))
      : completeWriting(destination);
  }
}
function startWork(request) {
  request.flushScheduled = null !== request.destination;
  supportsRequestStorage
    ? scheduleMicrotask(function () {
        return requestStorage.run(request, performWork, request);
      })
    : scheduleMicrotask(function () {
        return performWork(request);
      });
  setTimeoutOrImmediate(function () {
    10 === request.status && (request.status = 11);
    null === request.trackedPostpones &&
      (supportsRequestStorage
        ? requestStorage.run(
            request,
            enqueueEarlyPreloadsAfterInitialWork,
            request
          )
        : enqueueEarlyPreloadsAfterInitialWork(request));
  }, 0);
}
function enqueueEarlyPreloadsAfterInitialWork(request) {
  safelyEmitEarlyPreloads(request, 0 === request.pendingRootTasks);
}
function enqueueFlush(request) {
  !1 === request.flushScheduled &&
    0 === request.pingedTasks.length &&
    null !== request.destination &&
    ((request.flushScheduled = !0),
    setTimeoutOrImmediate(function () {
      var destination = request.destination;
      destination
        ? flushCompletedQueues(request, destination)
        : (request.flushScheduled = !1);
    }, 0));
}
function startFlowing(request, destination) {
  if (13 === request.status)
    (request.status = 14), closeWithError(destination, request.fatalError);
  else if (14 !== request.status && null === request.destination) {
    request.destination = destination;
    try {
      flushCompletedQueues(request, destination);
    } catch (error) {
      logRecoverableError(request, error, {}), fatalError(request, error);
    }
  }
}
function abort(request, reason) {
  if (11 === request.status || 10 === request.status) request.status = 12;
  try {
    var abortableTasks = request.abortableTasks;
    if (0 < abortableTasks.size) {
      var error =
        void 0 === reason
          ? Error("The render was aborted by the server without a reason.")
          : "object" === typeof reason &&
              null !== reason &&
              "function" === typeof reason.then
            ? Error("The render was aborted by the server with a promise.")
            : reason;
      request.fatalError = error;
      abortableTasks.forEach(function (task) {
        return abortTask(task, request, error);
      });
      abortableTasks.clear();
    }
    null !== request.destination &&
      flushCompletedQueues(request, request.destination);
  } catch (error$69) {
    logRecoverableError(request, error$69, {}), fatalError(request, error$69);
  }
}
function addToReplayParent(node, parentKeyPath, trackedPostpones) {
  if (null === parentKeyPath) trackedPostpones.rootNodes.push(node);
  else {
    var workingMap = trackedPostpones.workingMap,
      parentNode = workingMap.get(parentKeyPath);
    void 0 === parentNode &&
      ((parentNode = [parentKeyPath[1], parentKeyPath[2], [], null]),
      workingMap.set(parentKeyPath, parentNode),
      addToReplayParent(parentNode, parentKeyPath[0], trackedPostpones));
    parentNode[2].push(node);
  }
}
function getPostponedState(request) {
  var trackedPostpones = request.trackedPostpones;
  if (
    null === trackedPostpones ||
    (0 === trackedPostpones.rootNodes.length &&
      null === trackedPostpones.rootSlots)
  )
    return (request.trackedPostpones = null);
  if (
    null !== request.completedRootSegment &&
    5 === request.completedRootSegment.status
  ) {
    var resumableState = request.resumableState,
      renderState = request.renderState;
    resumableState.nextFormID = 0;
    resumableState.hasBody = !1;
    resumableState.hasHtml = !1;
    resumableState.unknownResources = { font: renderState.resets.font };
    resumableState.dnsResources = renderState.resets.dns;
    resumableState.connectResources = renderState.resets.connect;
    resumableState.imageResources = renderState.resets.image;
    resumableState.styleResources = renderState.resets.style;
    resumableState.scriptResources = {};
    resumableState.moduleUnknownResources = {};
    resumableState.moduleScriptResources = {};
  } else
    (resumableState = request.resumableState),
      (resumableState.bootstrapScriptContent = void 0),
      (resumableState.bootstrapScripts = void 0),
      (resumableState.bootstrapModules = void 0);
  return {
    nextSegmentId: request.nextSegmentId,
    rootFormatContext: request.rootFormatContext,
    progressiveChunkSize: request.progressiveChunkSize,
    resumableState: request.resumableState,
    replayNodes: trackedPostpones.rootNodes,
    replaySlots: trackedPostpones.rootSlots
  };
}
function ensureCorrectIsomorphicReactVersion() {
  var isomorphicReactPackageVersion = React.version;
  if ("19.1.0-experimental-5b51a2b9-20250116" !== isomorphicReactPackageVersion)
    throw Error(
      'Incompatible React versions: The "react" and "react-dom" packages must have the exact same version. Instead got:\n  - react:      ' +
        (isomorphicReactPackageVersion +
          "\n  - react-dom:  19.1.0-experimental-5b51a2b9-20250116\nLearn more: https://react.dev/warnings/version-mismatch")
    );
}
ensureCorrectIsomorphicReactVersion();
ensureCorrectIsomorphicReactVersion();
exports.prerender = function (children, options) {
  return new Promise(function (resolve, reject) {
    var onHeaders = options ? options.onHeaders : void 0,
      onHeadersImpl;
    onHeaders &&
      (onHeadersImpl = function (headersDescriptor) {
        onHeaders(new Headers(headersDescriptor));
      });
    var resources = createResumableState(
        options ? options.identifierPrefix : void 0,
        options ? options.unstable_externalRuntimeSrc : void 0,
        options ? options.bootstrapScriptContent : void 0,
        options ? options.bootstrapScripts : void 0,
        options ? options.bootstrapModules : void 0
      ),
      request = createPrerenderRequest(
        children,
        resources,
        createRenderState(
          resources,
          void 0,
          options ? options.unstable_externalRuntimeSrc : void 0,
          options ? options.importMap : void 0,
          onHeadersImpl,
          options ? options.maxHeadersLength : void 0
        ),
        createRootFormatContext(options ? options.namespaceURI : void 0),
        options ? options.progressiveChunkSize : void 0,
        options ? options.onError : void 0,
        function () {
          var stream = new ReadableStream(
            {
              type: "bytes",
              pull: function (controller) {
                startFlowing(request, controller);
              },
              cancel: function (reason) {
                request.destination = null;
                abort(request, reason);
              }
            },
            { highWaterMark: 0 }
          );
          stream = { postponed: getPostponedState(request), prelude: stream };
          resolve(stream);
        },
        void 0,
        void 0,
        reject,
        options ? options.onPostpone : void 0
      );
    if (options && options.signal) {
      var signal = options.signal;
      if (signal.aborted) abort(request, signal.reason);
      else {
        var listener = function () {
          abort(request, signal.reason);
          signal.removeEventListener("abort", listener);
        };
        signal.addEventListener("abort", listener);
      }
    }
    startWork(request);
  });
};
exports.renderToReadableStream = function (children, options) {
  return new Promise(function (resolve, reject) {
    var onFatalError,
      onAllReady,
      allReady = new Promise(function (res, rej) {
        onAllReady = res;
        onFatalError = rej;
      }),
      onHeaders = options ? options.onHeaders : void 0,
      onHeadersImpl;
    onHeaders &&
      (onHeadersImpl = function (headersDescriptor) {
        onHeaders(new Headers(headersDescriptor));
      });
    var resumableState = createResumableState(
        options ? options.identifierPrefix : void 0,
        options ? options.unstable_externalRuntimeSrc : void 0,
        options ? options.bootstrapScriptContent : void 0,
        options ? options.bootstrapScripts : void 0,
        options ? options.bootstrapModules : void 0
      ),
      request = createRequest(
        children,
        resumableState,
        createRenderState(
          resumableState,
          options ? options.nonce : void 0,
          options ? options.unstable_externalRuntimeSrc : void 0,
          options ? options.importMap : void 0,
          onHeadersImpl,
          options ? options.maxHeadersLength : void 0
        ),
        createRootFormatContext(options ? options.namespaceURI : void 0),
        options ? options.progressiveChunkSize : void 0,
        options ? options.onError : void 0,
        onAllReady,
        function () {
          var stream = new ReadableStream(
            {
              type: "bytes",
              pull: function (controller) {
                startFlowing(request, controller);
              },
              cancel: function (reason) {
                request.destination = null;
                abort(request, reason);
              }
            },
            { highWaterMark: 0 }
          );
          stream.allReady = allReady;
          resolve(stream);
        },
        function (error) {
          allReady.catch(function () {});
          reject(error);
        },
        onFatalError,
        options ? options.onPostpone : void 0,
        options ? options.formState : void 0
      );
    if (options && options.signal) {
      var signal = options.signal;
      if (signal.aborted) abort(request, signal.reason);
      else {
        var listener = function () {
          abort(request, signal.reason);
          signal.removeEventListener("abort", listener);
        };
        signal.addEventListener("abort", listener);
      }
    }
    startWork(request);
  });
};
exports.resume = function (children, postponedState, options) {
  return new Promise(function (resolve, reject) {
    var onFatalError,
      onAllReady,
      allReady = new Promise(function (res, rej) {
        onAllReady = res;
        onFatalError = rej;
      }),
      request = resumeRequest(
        children,
        postponedState,
        createRenderState(
          postponedState.resumableState,
          options ? options.nonce : void 0,
          void 0,
          void 0,
          void 0,
          void 0
        ),
        options ? options.onError : void 0,
        onAllReady,
        function () {
          var stream = new ReadableStream(
            {
              type: "bytes",
              pull: function (controller) {
                startFlowing(request, controller);
              },
              cancel: function (reason) {
                request.destination = null;
                abort(request, reason);
              }
            },
            { highWaterMark: 0 }
          );
          stream.allReady = allReady;
          resolve(stream);
        },
        function (error) {
          allReady.catch(function () {});
          reject(error);
        },
        onFatalError,
        options ? options.onPostpone : void 0
      );
    if (options && options.signal) {
      var signal = options.signal;
      if (signal.aborted) abort(request, signal.reason);
      else {
        var listener = function () {
          abort(request, signal.reason);
          signal.removeEventListener("abort", listener);
        };
        signal.addEventListener("abort", listener);
      }
    }
    startWork(request);
  });
};
exports.resumeAndPrerender = function (children, postponedState, options) {
  return new Promise(function (resolve, reject) {
    var request = resumeAndPrerenderRequest(
      children,
      postponedState,
      createRenderState(
        postponedState.resumableState,
        options ? options.nonce : void 0,
        void 0,
        void 0,
        void 0,
        void 0
      ),
      options ? options.onError : void 0,
      function () {
        var stream = new ReadableStream(
          {
            type: "bytes",
            pull: function (controller) {
              startFlowing(request, controller);
            },
            cancel: function (reason) {
              request.destination = null;
              abort(request, reason);
            }
          },
          { highWaterMark: 0 }
        );
        stream = { postponed: getPostponedState(request), prelude: stream };
        resolve(stream);
      },
      void 0,
      void 0,
      reject,
      options ? options.onPostpone : void 0
    );
    if (options && options.signal) {
      var signal = options.signal;
      if (signal.aborted) abort(request, signal.reason);
      else {
        var listener = function () {
          abort(request, signal.reason);
          signal.removeEventListener("abort", listener);
        };
        signal.addEventListener("abort", listener);
      }
    }
    startWork(request);
  });
};

// This is a patch added by Next.js
const setTimeoutOrImmediate =
  typeof globalThis['set' + 'Immediate'] === 'function' &&
  // edge runtime sandbox defines a stub for setImmediate
  // (see 'addStub' in packages/next/src/server/web/sandbox/context.ts)
  // but it's made non-enumerable, so we can detect it
  globalThis.propertyIsEnumerable('setImmediate')
    ? globalThis['set' + 'Immediate']
    : setTimeout;

exports.version = "19.1.0-experimental-5b51a2b9-20250116";
