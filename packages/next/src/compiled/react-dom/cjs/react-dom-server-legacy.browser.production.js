/**
 * @license React
 * react-dom-server-legacy.browser.production.min.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

var React = require("next/dist/compiled/react");
var ReactDOM = require('react-dom');

// Do not require this module directly! Use normal `invariant` calls with
// template literal strings. The messages will be replaced with error codes
// during build.
function formatProdErrorMessage(code) {
  let url = 'https://react.dev/errors/' + code;

  if (arguments.length > 1) {
    url += '?args[]=' + encodeURIComponent(arguments[1]);

    for (let i = 2; i < arguments.length; i++) {
      url += '&args[]=' + encodeURIComponent(arguments[i]);
    }
  }

  return "Minified React error #" + code + "; visit " + url + " for the full message or " + 'use the non-minified dev environment for full errors and additional ' + 'helpful warnings.';
}

var ReactVersion = '18.3.0-canary-14898b6a9-20240318';

// ATTENTION
// When adding new symbols to this file,
// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'
// The Symbol used to tag the ReactElement-like types.
const REACT_ELEMENT_TYPE = Symbol.for('react.element');
const REACT_PORTAL_TYPE = Symbol.for('react.portal');
const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
const REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode');
const REACT_PROFILER_TYPE = Symbol.for('react.profiler');
const REACT_PROVIDER_TYPE = Symbol.for('react.provider'); // TODO: Delete with enableRenderableContext

const REACT_CONSUMER_TYPE = Symbol.for('react.consumer');
const REACT_CONTEXT_TYPE = Symbol.for('react.context');
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
const REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
const REACT_SUSPENSE_LIST_TYPE = Symbol.for('react.suspense_list');
const REACT_MEMO_TYPE = Symbol.for('react.memo');
const REACT_LAZY_TYPE = Symbol.for('react.lazy');
const REACT_SCOPE_TYPE = Symbol.for('react.scope');
const REACT_DEBUG_TRACING_MODE_TYPE = Symbol.for('react.debug_trace_mode');
const REACT_OFFSCREEN_TYPE = Symbol.for('react.offscreen');
const REACT_LEGACY_HIDDEN_TYPE = Symbol.for('react.legacy_hidden');
const REACT_CACHE_TYPE = Symbol.for('react.cache');
const MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
const FAUX_ITERATOR_SYMBOL = '@@iterator';
function getIteratorFn(maybeIterable) {
  if (maybeIterable === null || typeof maybeIterable !== 'object') {
    return null;
  }

  const maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];

  if (typeof maybeIterator === 'function') {
    return maybeIterator;
  }

  return null;
}

const isArrayImpl = Array.isArray; // eslint-disable-next-line no-redeclare

function isArray(a) {
  return isArrayImpl(a);
}

// A pure JS implementation of a string hashing function. We do not use it for
// security or obfuscation purposes, only to create compact hashes. So we
// prioritize speed over collision avoidance. For example, we use this to hash
// the component key path used by useFormState for MPA-style submissions.
//
// In environments where built-in hashing functions are available, we prefer
// those instead. Like Node's crypto module, or Bun.hash. Unfortunately this
// does not include the web standard crypto API because those methods are all
// async. For our purposes, we need it to be sync because the cost of context
// switching is too high to be worth it.
//
// The most popular hashing algorithm that meets these requirements in the JS
// ecosystem is MurmurHash3, and almost all implementations I could find used
// some version of the implementation by Gary Court inlined below.
function createFastHashJS(key) {
  return murmurhash3_32_gc(key, 0);
}
/* eslint-disable prefer-const, no-fallthrough */

/**
 * @license
 *
 * JS Implementation of MurmurHash3 (r136) (as of May 20, 2011)
 *
 * Copyright (c) 2011 Gary Court
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

function murmurhash3_32_gc(key, seed) {
  let remainder, bytes, h1, h1b, c1, c2, k1, i;
  remainder = key.length & 3; // key.length % 4

  bytes = key.length - remainder;
  h1 = seed;
  c1 = 0xcc9e2d51;
  c2 = 0x1b873593;
  i = 0;

  while (i < bytes) {
    k1 = key.charCodeAt(i) & 0xff | (key.charCodeAt(++i) & 0xff) << 8 | (key.charCodeAt(++i) & 0xff) << 16 | (key.charCodeAt(++i) & 0xff) << 24;
    ++i;
    k1 = (k1 & 0xffff) * c1 + (((k1 >>> 16) * c1 & 0xffff) << 16) & 0xffffffff;
    k1 = k1 << 15 | k1 >>> 17;
    k1 = (k1 & 0xffff) * c2 + (((k1 >>> 16) * c2 & 0xffff) << 16) & 0xffffffff;
    h1 ^= k1;
    h1 = h1 << 13 | h1 >>> 19;
    h1b = (h1 & 0xffff) * 5 + (((h1 >>> 16) * 5 & 0xffff) << 16) & 0xffffffff;
    h1 = (h1b & 0xffff) + 0x6b64 + (((h1b >>> 16) + 0xe654 & 0xffff) << 16);
  }

  k1 = 0;

  switch (remainder) {
    case 3:
      k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;

    case 2:
      k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;

    case 1:
      k1 ^= key.charCodeAt(i) & 0xff;
      k1 = (k1 & 0xffff) * c1 + (((k1 >>> 16) * c1 & 0xffff) << 16) & 0xffffffff;
      k1 = k1 << 15 | k1 >>> 17;
      k1 = (k1 & 0xffff) * c2 + (((k1 >>> 16) * c2 & 0xffff) << 16) & 0xffffffff;
      h1 ^= k1;
  }

  h1 ^= key.length;
  h1 ^= h1 >>> 16;
  h1 = (h1 & 0xffff) * 0x85ebca6b + (((h1 >>> 16) * 0x85ebca6b & 0xffff) << 16) & 0xffffffff;
  h1 ^= h1 >>> 13;
  h1 = (h1 & 0xffff) * 0xc2b2ae35 + (((h1 >>> 16) * 0xc2b2ae35 & 0xffff) << 16) & 0xffffffff;
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
}

function scheduleWork(callback) {
  callback();
}
function beginWriting(destination) {}
function writeChunk(destination, chunk) {
  writeChunkAndReturn(destination, chunk);
}
function writeChunkAndReturn(destination, chunk) {
  return destination.push(chunk);
}
function completeWriting(destination) {}
function close(destination) {
  destination.push(null);
}
function stringToChunk(content) {
  return content;
}
function stringToPrecomputedChunk(content) {
  return content;
}
function closeWithError(destination, error) {
  // $FlowFixMe[incompatible-call]: This is an Error object or the destination accepts other types.
  destination.destroy(error);
}

const assign = Object.assign;

// -----------------------------------------------------------------------------
const enableFloat = true; // Enables unstable_useMemoCache hook, intended as a compilation target for

// $FlowFixMe[method-unbinding]
const hasOwnProperty = Object.prototype.hasOwnProperty;

/* eslint-disable max-len */

const ATTRIBUTE_NAME_START_CHAR = ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
/* eslint-enable max-len */

const ATTRIBUTE_NAME_CHAR = ATTRIBUTE_NAME_START_CHAR + '\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040';
const VALID_ATTRIBUTE_NAME_REGEX = new RegExp('^[' + ATTRIBUTE_NAME_START_CHAR + '][' + ATTRIBUTE_NAME_CHAR + ']*$');
const illegalAttributeNameCache = {};
const validatedAttributeNameCache = {};
function isAttributeNameSafe(attributeName) {
  if (hasOwnProperty.call(validatedAttributeNameCache, attributeName)) {
    return true;
  }

  if (hasOwnProperty.call(illegalAttributeNameCache, attributeName)) {
    return false;
  }

  if (VALID_ATTRIBUTE_NAME_REGEX.test(attributeName)) {
    validatedAttributeNameCache[attributeName] = true;
    return true;
  }

  illegalAttributeNameCache[attributeName] = true;

  return false;
}

/**
 * CSS properties which accept numbers but are not in units of "px".
 */
const unitlessNumbers = new Set(['animationIterationCount', 'aspectRatio', 'borderImageOutset', 'borderImageSlice', 'borderImageWidth', 'boxFlex', 'boxFlexGroup', 'boxOrdinalGroup', 'columnCount', 'columns', 'flex', 'flexGrow', 'flexPositive', 'flexShrink', 'flexNegative', 'flexOrder', 'gridArea', 'gridRow', 'gridRowEnd', 'gridRowSpan', 'gridRowStart', 'gridColumn', 'gridColumnEnd', 'gridColumnSpan', 'gridColumnStart', 'fontWeight', 'lineClamp', 'lineHeight', 'opacity', 'order', 'orphans', 'scale', 'tabSize', 'widows', 'zIndex', 'zoom', 'fillOpacity', // SVG-related properties
'floodOpacity', 'stopOpacity', 'strokeDasharray', 'strokeDashoffset', 'strokeMiterlimit', 'strokeOpacity', 'strokeWidth', 'MozAnimationIterationCount', // Known Prefixed Properties
'MozBoxFlex', // TODO: Remove these since they shouldn't be used in modern code
'MozBoxFlexGroup', 'MozLineClamp', 'msAnimationIterationCount', 'msFlex', 'msZoom', 'msFlexGrow', 'msFlexNegative', 'msFlexOrder', 'msFlexPositive', 'msFlexShrink', 'msGridColumn', 'msGridColumnSpan', 'msGridRow', 'msGridRowSpan', 'WebkitAnimationIterationCount', 'WebkitBoxFlex', 'WebKitBoxFlexGroup', 'WebkitBoxOrdinalGroup', 'WebkitColumnCount', 'WebkitColumns', 'WebkitFlex', 'WebkitFlexGrow', 'WebkitFlexPositive', 'WebkitFlexShrink', 'WebkitLineClamp']);
function isUnitlessNumber (name) {
  return unitlessNumbers.has(name);
}

const aliases = new Map([['acceptCharset', 'accept-charset'], ['htmlFor', 'for'], ['httpEquiv', 'http-equiv'], // HTML and SVG attributes, but the SVG attribute is case sensitive.],
['crossOrigin', 'crossorigin'], // This is a list of all SVG attributes that need special casing.
// Regular attributes that just accept strings.],
['accentHeight', 'accent-height'], ['alignmentBaseline', 'alignment-baseline'], ['arabicForm', 'arabic-form'], ['baselineShift', 'baseline-shift'], ['capHeight', 'cap-height'], ['clipPath', 'clip-path'], ['clipRule', 'clip-rule'], ['colorInterpolation', 'color-interpolation'], ['colorInterpolationFilters', 'color-interpolation-filters'], ['colorProfile', 'color-profile'], ['colorRendering', 'color-rendering'], ['dominantBaseline', 'dominant-baseline'], ['enableBackground', 'enable-background'], ['fillOpacity', 'fill-opacity'], ['fillRule', 'fill-rule'], ['floodColor', 'flood-color'], ['floodOpacity', 'flood-opacity'], ['fontFamily', 'font-family'], ['fontSize', 'font-size'], ['fontSizeAdjust', 'font-size-adjust'], ['fontStretch', 'font-stretch'], ['fontStyle', 'font-style'], ['fontVariant', 'font-variant'], ['fontWeight', 'font-weight'], ['glyphName', 'glyph-name'], ['glyphOrientationHorizontal', 'glyph-orientation-horizontal'], ['glyphOrientationVertical', 'glyph-orientation-vertical'], ['horizAdvX', 'horiz-adv-x'], ['horizOriginX', 'horiz-origin-x'], ['imageRendering', 'image-rendering'], ['letterSpacing', 'letter-spacing'], ['lightingColor', 'lighting-color'], ['markerEnd', 'marker-end'], ['markerMid', 'marker-mid'], ['markerStart', 'marker-start'], ['overlinePosition', 'overline-position'], ['overlineThickness', 'overline-thickness'], ['paintOrder', 'paint-order'], ['panose-1', 'panose-1'], ['pointerEvents', 'pointer-events'], ['renderingIntent', 'rendering-intent'], ['shapeRendering', 'shape-rendering'], ['stopColor', 'stop-color'], ['stopOpacity', 'stop-opacity'], ['strikethroughPosition', 'strikethrough-position'], ['strikethroughThickness', 'strikethrough-thickness'], ['strokeDasharray', 'stroke-dasharray'], ['strokeDashoffset', 'stroke-dashoffset'], ['strokeLinecap', 'stroke-linecap'], ['strokeLinejoin', 'stroke-linejoin'], ['strokeMiterlimit', 'stroke-miterlimit'], ['strokeOpacity', 'stroke-opacity'], ['strokeWidth', 'stroke-width'], ['textAnchor', 'text-anchor'], ['textDecoration', 'text-decoration'], ['textRendering', 'text-rendering'], ['transformOrigin', 'transform-origin'], ['underlinePosition', 'underline-position'], ['underlineThickness', 'underline-thickness'], ['unicodeBidi', 'unicode-bidi'], ['unicodeRange', 'unicode-range'], ['unitsPerEm', 'units-per-em'], ['vAlphabetic', 'v-alphabetic'], ['vHanging', 'v-hanging'], ['vIdeographic', 'v-ideographic'], ['vMathematical', 'v-mathematical'], ['vectorEffect', 'vector-effect'], ['vertAdvY', 'vert-adv-y'], ['vertOriginX', 'vert-origin-x'], ['vertOriginY', 'vert-origin-y'], ['wordSpacing', 'word-spacing'], ['writingMode', 'writing-mode'], ['xmlnsXlink', 'xmlns:xlink'], ['xHeight', 'x-height']]);
function getAttributeAlias (name) {
  return aliases.get(name) || name;
}

function getCrossOriginString(input) {
  if (typeof input === 'string') {
    return input === 'use-credentials' ? input : '';
  }

  return undefined;
}

// code copied and modified from escape-html
const matchHtmlRegExp = /["'&<>]/;
/**
 * Escapes special characters and HTML entities in a given html string.
 *
 * @param  {string} string HTML string to escape for later insertion
 * @return {string}
 * @public
 */

function escapeHtml(string) {

  const str = '' + string;
  const match = matchHtmlRegExp.exec(str);

  if (!match) {
    return str;
  }

  let escape;
  let html = '';
  let index;
  let lastIndex = 0;

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34:
        // "
        escape = '&quot;';
        break;

      case 38:
        // &
        escape = '&amp;';
        break;

      case 39:
        // '
        escape = '&#x27;'; // modified from escape-html; used to be '&#39'

        break;

      case 60:
        // <
        escape = '&lt;';
        break;

      case 62:
        // >
        escape = '&gt;';
        break;

      default:
        continue;
    }

    if (lastIndex !== index) {
      html += str.slice(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index ? html + str.slice(lastIndex, index) : html;
} // end code copied and modified from escape-html

/**
 * Escapes text to prevent scripting attacks.
 *
 * @param {*} text Text value to escape.
 * @return {string} An escaped string.
 */


function escapeTextForBrowser(text) {
  if (typeof text === 'boolean' || typeof text === 'number') {
    // this shortcircuit helps perf for types that we know will never have
    // special characters, especially given that this function is used often
    // for numeric dom ids.
    return '' + text;
  }

  return escapeHtml(text);
}

const uppercasePattern = /([A-Z])/g;
const msPattern = /^ms-/;
/**
 * Hyphenates a camelcased CSS property name, for example:
 *
 *   > hyphenateStyleName('backgroundColor')
 *   < "background-color"
 *   > hyphenateStyleName('MozTransition')
 *   < "-moz-transition"
 *   > hyphenateStyleName('msTransition')
 *   < "-ms-transition"
 *
 * As Modernizr suggests (http://modernizr.com/docs/#prefixed), an `ms` prefix
 * is converted to `-ms-`.
 */

function hyphenateStyleName(name) {
  return name.replace(uppercasePattern, '-$1').toLowerCase().replace(msPattern, '-ms-');
}

function sanitizeURL(url) {

  return url;
}

// The build script is at scripts/rollup/generate-inline-fizz-runtime.js.
// Run `yarn generate-inline-fizz-runtime` to generate.
const clientRenderBoundary = '$RX=function(b,c,d,e){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),b._reactRetry&&b._reactRetry())};';
const completeBoundary = '$RC=function(b,c,e){c=document.getElementById(c);c.parentNode.removeChild(c);var a=document.getElementById(b);if(a){b=a.previousSibling;if(e)b.data="$!",a.setAttribute("data-dgst",e);else{e=b.parentNode;a=b.nextSibling;var f=0;do{if(a&&8===a.nodeType){var d=a.data;if("/$"===d)if(0===f)break;else f--;else"$"!==d&&"$?"!==d&&"$!"!==d||f++}d=a.nextSibling;e.removeChild(a);a=d}while(a);for(;c.firstChild;)e.insertBefore(c.firstChild,a);b.data="$"}b._reactRetry&&b._reactRetry()}};';
const completeBoundaryWithStyles = '$RM=new Map;\n$RR=function(r,t,w){for(var u=$RC,n=$RM,p=new Map,q=document,g,b,h=q.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=h[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&n.set(b.getAttribute("href"),b),p.set(b.dataset.precedence,g=b));b=0;h=[];var l,a;for(k=!0;;){if(k){var f=w[b++];if(!f){k=!1;b=0;continue}var c=!1,m=0;var d=f[m++];if(a=n.get(d)){var e=a._p;c=!0}else{a=q.createElement("link");a.href=d;a.rel="stylesheet";for(a.dataset.precedence=\nl=f[m++];e=f[m++];)a.setAttribute(e,f[m++]);e=a._p=new Promise(function(x,y){a.onload=x;a.onerror=y});n.set(d,a)}d=a.getAttribute("media");!e||"l"===e.s||d&&!matchMedia(d).matches||h.push(e);if(c)continue}else{a=v[b++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=p.get(l)||g;c===g&&(g=a);p.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=q.head,c.insertBefore(a,c.firstChild))}Promise.all(h).then(u.bind(null,r,t,""),u.bind(null,r,t,"Resource failed to load"))};';
const completeSegment = '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};';
const formReplaying = 'addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error(\'React form unexpectedly submitted.\')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});';

const ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

// same object across all transitions.

const sharedNotPendingObject = {
  pending: false,
  data: null,
  method: null,
  action: null
};
const NotPending = sharedNotPendingObject;

const ReactDOMSharedInternals = ReactDOM.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

const ReactDOMCurrentDispatcher = ReactDOMSharedInternals.Dispatcher;
const ReactDOMServerDispatcher = {
  prefetchDNS,
  preconnect,
  preload,
  preloadModule,
  preinitStyle,
  preinitScript,
  preinitModuleScript
};
function prepareHostDispatcher() {
  ReactDOMCurrentDispatcher.current = ReactDOMServerDispatcher;
} // We make every property of the descriptor optional because it is not a contract that
const ScriptStreamingFormat = 0;
const DataStreamingFormat = 1;
const NothingSent
/*                      */
= 0b00000;
const SentCompleteSegmentFunction
/*      */
= 0b00001;
const SentCompleteBoundaryFunction
/*     */
= 0b00010;
const SentClientRenderFunction
/*         */
= 0b00100;
const SentStyleInsertionFunction
/*       */
= 0b01000;
const SentFormReplayingRuntime
/*         */
= 0b10000; // Per request, global state that is not contextual to the rendering subtree.
// This cannot be resumed and therefore should only contain things that are
// temporary working state or are never used in the prerender pass.
// Credentials here are things that affect whether a browser will make a request
// as well as things that affect which connection the browser will use for that request.
// We want these to be aligned across preloads and resources because otherwise the preload
// will be wasted.
// We investigated whether referrerPolicy should be included here but from experimentation
// it seems that browsers do not treat this as part of the http cache key and does not affect
// which connection is used.

const EXISTS = null; // This constant is to mark preloads that have no unique credentials
// to convey. It should never be checked by identity and we should not
// assume Preload values in ResumableState equal this value because they
// will have come from some parsed input.

const PRELOAD_NO_CREDS = [];
// This is resumable and therefore should be serializable.


const dataElementQuotedEnd = stringToPrecomputedChunk('"></template>');
const startInlineScript = stringToPrecomputedChunk('<script>');
const endInlineScript = stringToPrecomputedChunk('</script>');
const startScriptSrc = stringToPrecomputedChunk('<script src="');
const startModuleSrc = stringToPrecomputedChunk('<script type="module" src="');
const scriptNonce = stringToPrecomputedChunk('" nonce="');
const scriptIntegirty = stringToPrecomputedChunk('" integrity="');
const scriptCrossOrigin = stringToPrecomputedChunk('" crossorigin="');
const endAsyncScript = stringToPrecomputedChunk('" async=""></script>');
/**
 * This escaping function is designed to work with bootstrapScriptContent and importMap only.
 * because we know we are escaping the entire script. We can avoid for instance
 * escaping html comment string sequences that are valid javascript as well because
 * if there are no sebsequent <script sequences the html parser will never enter
 * script data double escaped state (see: https://www.w3.org/TR/html53/syntax.html#script-data-double-escaped-state)
 *
 * While untrusted script content should be made safe before using this api it will
 * ensure that the script cannot be early terminated or never terminated state
 */

function escapeBootstrapAndImportMapScriptContent(scriptText) {

  return ('' + scriptText).replace(scriptRegex, scriptReplacer);
}

const scriptRegex = /(<\/|<)(s)(cript)/gi;

const scriptReplacer = (match, prefix, s, suffix) => "" + prefix + (s === 's' ? '\\u0073' : '\\u0053') + suffix;

const importMapScriptStart = stringToPrecomputedChunk('<script type="importmap">');
const importMapScriptEnd = stringToPrecomputedChunk('</script>'); // Since we store headers as strings we deal with their length in utf16 code units
// rather than visual characters or the utf8 encoding that is used for most binary
// serialization. Some common HTTP servers only allow for headers to be 4kB in length.
// We choose a default length that is likely to be well under this already limited length however
// pathological cases may still cause the utf-8 encoding of the headers to approach this limit.
// It should also be noted that this maximum is a soft maximum. we have not reached the limit we will
// allow one more header to be captured which means in practice if the limit is approached it will be exceeded

const DEFAULT_HEADERS_CAPACITY_IN_UTF16_CODE_UNITS = 2000; // Allows us to keep track of what we've already written so we can refer back to it.
// if passed externalRuntimeConfig and the enableFizzExternalRuntime feature flag
// is set, the server will send instructions via data attributes (instead of inline scripts)

function createRenderState$1(resumableState, nonce, externalRuntimeConfig, importMap, onHeaders, maxHeadersLength) {
  const inlineScriptWithNonce = nonce === undefined ? startInlineScript : stringToPrecomputedChunk('<script nonce="' + escapeTextForBrowser(nonce) + '">');
  const idPrefix = resumableState.idPrefix;
  const bootstrapChunks = [];
  let externalRuntimeScript = null;
  const bootstrapScriptContent = resumableState.bootstrapScriptContent,
        bootstrapScripts = resumableState.bootstrapScripts,
        bootstrapModules = resumableState.bootstrapModules;

  if (bootstrapScriptContent !== undefined) {
    bootstrapChunks.push(inlineScriptWithNonce, stringToChunk(escapeBootstrapAndImportMapScriptContent(bootstrapScriptContent)), endInlineScript);
  }

  {

    if (externalRuntimeConfig !== undefined) {
      if (typeof externalRuntimeConfig === 'string') {
        externalRuntimeScript = {
          src: externalRuntimeConfig,
          chunks: []
        };
        pushScriptImpl(externalRuntimeScript.chunks, {
          src: externalRuntimeConfig,
          async: true,
          integrity: undefined,
          nonce: nonce
        });
      } else {
        externalRuntimeScript = {
          src: externalRuntimeConfig.src,
          chunks: []
        };
        pushScriptImpl(externalRuntimeScript.chunks, {
          src: externalRuntimeConfig.src,
          async: true,
          integrity: externalRuntimeConfig.integrity,
          nonce: nonce
        });
      }
    }
  }

  const importMapChunks = [];

  if (importMap !== undefined) {
    const map = importMap;
    importMapChunks.push(importMapScriptStart);
    importMapChunks.push(stringToChunk(escapeBootstrapAndImportMapScriptContent(JSON.stringify(map))));
    importMapChunks.push(importMapScriptEnd);
  }

  const headers = onHeaders ? {
    preconnects: '',
    fontPreloads: '',
    highImagePreloads: '',
    remainingCapacity: typeof maxHeadersLength === 'number' ? maxHeadersLength : DEFAULT_HEADERS_CAPACITY_IN_UTF16_CODE_UNITS
  } : null;
  const renderState = {
    placeholderPrefix: stringToPrecomputedChunk(idPrefix + 'P:'),
    segmentPrefix: stringToPrecomputedChunk(idPrefix + 'S:'),
    boundaryPrefix: stringToPrecomputedChunk(idPrefix + 'B:'),
    startInlineScript: inlineScriptWithNonce,
    htmlChunks: null,
    headChunks: null,
    externalRuntimeScript: externalRuntimeScript,
    bootstrapChunks: bootstrapChunks,
    importMapChunks,
    onHeaders,
    headers,
    resets: {
      font: {},
      dns: {},
      connect: {
        default: {},
        anonymous: {},
        credentials: {}
      },
      image: {},
      style: {}
    },
    charsetChunks: [],
    viewportChunks: [],
    hoistableChunks: [],
    // cleared on flush
    preconnects: new Set(),
    fontPreloads: new Set(),
    highImagePreloads: new Set(),
    // usedImagePreloads: new Set(),
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
    nonce,
    // like a module global for currently rendering boundary
    hoistableState: null,
    stylesToHoist: false
  };

  if (bootstrapScripts !== undefined) {
    for (let i = 0; i < bootstrapScripts.length; i++) {
      const scriptConfig = bootstrapScripts[i];
      let src, crossOrigin, integrity;
      const props = {
        rel: 'preload',
        as: 'script',
        fetchPriority: 'low',
        nonce
      };

      if (typeof scriptConfig === 'string') {
        props.href = src = scriptConfig;
      } else {
        props.href = src = scriptConfig.src;
        props.integrity = integrity = typeof scriptConfig.integrity === 'string' ? scriptConfig.integrity : undefined;
        props.crossOrigin = crossOrigin = typeof scriptConfig === 'string' || scriptConfig.crossOrigin == null ? undefined : scriptConfig.crossOrigin === 'use-credentials' ? 'use-credentials' : '';
      }

      preloadBootstrapScriptOrModule(resumableState, renderState, src, props);
      bootstrapChunks.push(startScriptSrc, stringToChunk(escapeTextForBrowser(src)));

      if (nonce) {
        bootstrapChunks.push(scriptNonce, stringToChunk(escapeTextForBrowser(nonce)));
      }

      if (typeof integrity === 'string') {
        bootstrapChunks.push(scriptIntegirty, stringToChunk(escapeTextForBrowser(integrity)));
      }

      if (typeof crossOrigin === 'string') {
        bootstrapChunks.push(scriptCrossOrigin, stringToChunk(escapeTextForBrowser(crossOrigin)));
      }

      bootstrapChunks.push(endAsyncScript);
    }
  }

  if (bootstrapModules !== undefined) {
    for (let i = 0; i < bootstrapModules.length; i++) {
      const scriptConfig = bootstrapModules[i];
      let src, crossOrigin, integrity;
      const props = {
        rel: 'modulepreload',
        fetchPriority: 'low',
        nonce
      };

      if (typeof scriptConfig === 'string') {
        props.href = src = scriptConfig;
      } else {
        props.href = src = scriptConfig.src;
        props.integrity = integrity = typeof scriptConfig.integrity === 'string' ? scriptConfig.integrity : undefined;
        props.crossOrigin = crossOrigin = typeof scriptConfig === 'string' || scriptConfig.crossOrigin == null ? undefined : scriptConfig.crossOrigin === 'use-credentials' ? 'use-credentials' : '';
      }

      preloadBootstrapScriptOrModule(resumableState, renderState, src, props);
      bootstrapChunks.push(startModuleSrc, stringToChunk(escapeTextForBrowser(src)));

      if (nonce) {
        bootstrapChunks.push(scriptNonce, stringToChunk(escapeTextForBrowser(nonce)));
      }

      if (typeof integrity === 'string') {
        bootstrapChunks.push(scriptIntegirty, stringToChunk(escapeTextForBrowser(integrity)));
      }

      if (typeof crossOrigin === 'string') {
        bootstrapChunks.push(scriptCrossOrigin, stringToChunk(escapeTextForBrowser(crossOrigin)));
      }

      bootstrapChunks.push(endAsyncScript);
    }
  }

  return renderState;
}
function createResumableState(identifierPrefix, externalRuntimeConfig, bootstrapScriptContent, bootstrapScripts, bootstrapModules) {
  const idPrefix = identifierPrefix === undefined ? '' : identifierPrefix;
  let streamingFormat = ScriptStreamingFormat;

  {
    if (externalRuntimeConfig !== undefined) {
      streamingFormat = DataStreamingFormat;
    }
  }

  return {
    idPrefix: idPrefix,
    nextFormID: 0,
    streamingFormat,
    bootstrapScriptContent,
    bootstrapScripts,
    bootstrapModules,
    instructions: NothingSent,
    hasBody: false,
    hasHtml: false,
    // @TODO add bootstrap script to implicit preloads
    // persistent
    unknownResources: {},
    dnsResources: {},
    connectResources: {
      default: {},
      anonymous: {},
      credentials: {}
    },
    imageResources: {},
    styleResources: {},
    scriptResources: {},
    moduleUnknownResources: {},
    moduleScriptResources: {}
  };
}
// modes. We only include the variants as they matter for the sake of our purposes.
// We don't actually provide the namespace therefore we use constants instead of the string.

const ROOT_HTML_MODE = 0; // Used for the root most element tag.
// We have a less than HTML_HTML_MODE check elsewhere. If you add more cases here, make sure it
// still makes sense

const HTML_HTML_MODE = 1; // Used for the <html> if it is at the top level.

const HTML_MODE = 2;
const SVG_MODE = 3;
const MATHML_MODE = 4;
const HTML_TABLE_MODE = 5;
const HTML_TABLE_BODY_MODE = 6;
const HTML_TABLE_ROW_MODE = 7;
const HTML_COLGROUP_MODE = 8; // We have a greater than HTML_TABLE_MODE check elsewhere. If you add more cases here, make sure it
// still makes sense

const NO_SCOPE =
/*         */
0b00;
const NOSCRIPT_SCOPE =
/*   */
0b01;
const PICTURE_SCOPE =
/*    */
0b10; // Lets us keep track of contextual state and pick it back up after suspending.

function createFormatContext(insertionMode, selectedValue, tagScope) {
  return {
    insertionMode,
    selectedValue,
    tagScope
  };
}

function createRootFormatContext(namespaceURI) {
  const insertionMode = namespaceURI === 'http://www.w3.org/2000/svg' ? SVG_MODE : namespaceURI === 'http://www.w3.org/1998/Math/MathML' ? MATHML_MODE : ROOT_HTML_MODE;
  return createFormatContext(insertionMode, null, NO_SCOPE);
}
function getChildFormatContext(parentContext, type, props) {
  switch (type) {
    case 'noscript':
      return createFormatContext(HTML_MODE, null, parentContext.tagScope | NOSCRIPT_SCOPE);

    case 'select':
      return createFormatContext(HTML_MODE, props.value != null ? props.value : props.defaultValue, parentContext.tagScope);

    case 'svg':
      return createFormatContext(SVG_MODE, null, parentContext.tagScope);

    case 'picture':
      return createFormatContext(HTML_MODE, null, parentContext.tagScope | PICTURE_SCOPE);

    case 'math':
      return createFormatContext(MATHML_MODE, null, parentContext.tagScope);

    case 'foreignObject':
      return createFormatContext(HTML_MODE, null, parentContext.tagScope);
    // Table parents are special in that their children can only be created at all if they're
    // wrapped in a table parent. So we need to encode that we're entering this mode.

    case 'table':
      return createFormatContext(HTML_TABLE_MODE, null, parentContext.tagScope);

    case 'thead':
    case 'tbody':
    case 'tfoot':
      return createFormatContext(HTML_TABLE_BODY_MODE, null, parentContext.tagScope);

    case 'colgroup':
      return createFormatContext(HTML_COLGROUP_MODE, null, parentContext.tagScope);

    case 'tr':
      return createFormatContext(HTML_TABLE_ROW_MODE, null, parentContext.tagScope);
  }

  if (parentContext.insertionMode >= HTML_TABLE_MODE) {
    // Whatever tag this was, it wasn't a table parent or other special parent, so we must have
    // entered plain HTML again.
    return createFormatContext(HTML_MODE, null, parentContext.tagScope);
  }

  if (parentContext.insertionMode === ROOT_HTML_MODE) {
    if (type === 'html') {
      // We've emitted the root and is now in <html> mode.
      return createFormatContext(HTML_HTML_MODE, null, parentContext.tagScope);
    } else {
      // We've emitted the root and is now in plain HTML mode.
      return createFormatContext(HTML_MODE, null, parentContext.tagScope);
    }
  } else if (parentContext.insertionMode === HTML_HTML_MODE) {
    // We've emitted the document element and is now in plain HTML mode.
    return createFormatContext(HTML_MODE, null, parentContext.tagScope);
  }

  return parentContext;
}
function makeId(resumableState, treeId, localId) {
  const idPrefix = resumableState.idPrefix;
  let id = ':' + idPrefix + 'R' + treeId; // Unless this is the first id at this level, append a number at the end
  // that represents the position of this useId hook among all the useId
  // hooks for this fiber.

  if (localId > 0) {
    id += 'H' + localId.toString(32);
  }

  return id + ':';
}

function encodeHTMLTextNode(text) {
  return escapeTextForBrowser(text);
}

const textSeparator = stringToPrecomputedChunk('<!-- -->');
function pushTextInstance$1(target, text, renderState, textEmbedded) {
  if (text === '') {
    // Empty text doesn't have a DOM node representation and the hydration is aware of this.
    return textEmbedded;
  }

  if (textEmbedded) {
    target.push(textSeparator);
  }

  target.push(stringToChunk(encodeHTMLTextNode(text)));
  return true;
} // Called when Fizz is done with a Segment. Currently the only purpose is to conditionally
// emit a text separator when we don't know for sure it is safe to omit

function pushSegmentFinale$1(target, renderState, lastPushedText, textEmbedded) {
  if (lastPushedText && textEmbedded) {
    target.push(textSeparator);
  }
}
const styleNameCache = new Map();

function processStyleName(styleName) {
  const chunk = styleNameCache.get(styleName);

  if (chunk !== undefined) {
    return chunk;
  }

  const result = stringToPrecomputedChunk(escapeTextForBrowser(hyphenateStyleName(styleName)));
  styleNameCache.set(styleName, result);
  return result;
}

const styleAttributeStart = stringToPrecomputedChunk(' style="');
const styleAssign = stringToPrecomputedChunk(':');
const styleSeparator = stringToPrecomputedChunk(';');

function pushStyleAttribute(target, style) {
  if (typeof style !== 'object') {
    throw Error(formatProdErrorMessage(62));
  }

  let isFirst = true;

  for (const styleName in style) {
    if (!hasOwnProperty.call(style, styleName)) {
      continue;
    } // If you provide unsafe user data here they can inject arbitrary CSS
    // which may be problematic (I couldn't repro this):
    // https://www.owasp.org/index.php/XSS_Filter_Evasion_Cheat_Sheet
    // http://www.thespanner.co.uk/2007/11/26/ultimate-xss-css-injection/
    // This is not an XSS hole but instead a potential CSS injection issue
    // which has lead to a greater discussion about how we're going to
    // trust URLs moving forward. See #2115901


    const styleValue = style[styleName];

    if (styleValue == null || typeof styleValue === 'boolean' || styleValue === '') {
      // TODO: We used to set empty string as a style with an empty value. Does that ever make sense?
      continue;
    }

    let nameChunk;
    let valueChunk;
    const isCustomProperty = styleName.indexOf('--') === 0;

    if (isCustomProperty) {
      nameChunk = stringToChunk(escapeTextForBrowser(styleName));

      valueChunk = stringToChunk(escapeTextForBrowser(('' + styleValue).trim()));
    } else {

      nameChunk = processStyleName(styleName);

      if (typeof styleValue === 'number') {
        if (styleValue !== 0 && !isUnitlessNumber(styleName)) {
          valueChunk = stringToChunk(styleValue + 'px'); // Presumes implicit 'px' suffix for unitless numbers
        } else {
          valueChunk = stringToChunk('' + styleValue);
        }
      } else {

        valueChunk = stringToChunk(escapeTextForBrowser(('' + styleValue).trim()));
      }
    }

    if (isFirst) {
      isFirst = false; // If it's first, we don't need any separators prefixed.

      target.push(styleAttributeStart, nameChunk, styleAssign, valueChunk);
    } else {
      target.push(styleSeparator, nameChunk, styleAssign, valueChunk);
    }
  }

  if (!isFirst) {
    target.push(attributeEnd);
  }
}

const attributeSeparator = stringToPrecomputedChunk(' ');
const attributeAssign = stringToPrecomputedChunk('="');
const attributeEnd = stringToPrecomputedChunk('"');
const attributeEmptyString = stringToPrecomputedChunk('=""');

function pushBooleanAttribute(target, name, value) // not null or undefined
{
  if (value && typeof value !== 'function' && typeof value !== 'symbol') {
    target.push(attributeSeparator, stringToChunk(name), attributeEmptyString);
  }
}

function pushStringAttribute(target, name, value) // not null or undefined
{
  if (typeof value !== 'function' && typeof value !== 'symbol' && typeof value !== 'boolean') {
    target.push(attributeSeparator, stringToChunk(name), attributeAssign, stringToChunk(escapeTextForBrowser(value)), attributeEnd);
  }
}

function makeFormFieldPrefix(resumableState) {
  const id = resumableState.nextFormID++;
  return resumableState.idPrefix + id;
} // Since this will likely be repeated a lot in the HTML, we use a more concise message
// than on the client and hopefully it's googleable.


const actionJavaScriptURL = stringToPrecomputedChunk(escapeTextForBrowser( // eslint-disable-next-line no-script-url
"javascript:throw new Error('React form unexpectedly submitted.')"));
const startHiddenInputChunk = stringToPrecomputedChunk('<input type="hidden"');

function pushAdditionalFormField(value, key) {
  const target = this;
  target.push(startHiddenInputChunk);

  if (typeof value !== 'string') {
    throw Error(formatProdErrorMessage(480));
  }

  pushStringAttribute(target, 'name', key);
  pushStringAttribute(target, 'value', value);
  target.push(endOfStartTagSelfClosing);
}

function pushAdditionalFormFields(target, formData) {
  if (formData !== null) {
    // $FlowFixMe[prop-missing]: FormData has forEach.
    formData.forEach(pushAdditionalFormField, target);
  }
}

function pushFormActionAttribute(target, resumableState, renderState, formAction, formEncType, formMethod, formTarget, name) {
  let formData = null;

  if (typeof formAction === 'function') {

    const customAction = formAction.$$FORM_ACTION;

    if (typeof customAction === 'function') {
      // This action has a custom progressive enhancement form that can submit the form
      // back to the server if it's invoked before hydration. Such as a Server Action.
      const prefix = makeFormFieldPrefix(resumableState);
      const customFields = formAction.$$FORM_ACTION(prefix);
      name = customFields.name;
      formAction = customFields.action || '';
      formEncType = customFields.encType;
      formMethod = customFields.method;
      formTarget = customFields.target;
      formData = customFields.data;
    } else {
      // Set a javascript URL that doesn't do anything. We don't expect this to be invoked
      // because we'll preventDefault in the Fizz runtime, but it can happen if a form is
      // manually submitted or if someone calls stopPropagation before React gets the event.
      // If CSP is used to block javascript: URLs that's fine too. It just won't show this
      // error message but the URL will be logged.
      target.push(attributeSeparator, stringToChunk('formAction'), attributeAssign, actionJavaScriptURL, attributeEnd);
      name = null;
      formAction = null;
      formEncType = null;
      formMethod = null;
      formTarget = null;
      injectFormReplayingRuntime(resumableState, renderState);
    }
  }

  if (name != null) {
    pushAttribute(target, 'name', name);
  }

  if (formAction != null) {
    pushAttribute(target, 'formAction', formAction);
  }

  if (formEncType != null) {
    pushAttribute(target, 'formEncType', formEncType);
  }

  if (formMethod != null) {
    pushAttribute(target, 'formMethod', formMethod);
  }

  if (formTarget != null) {
    pushAttribute(target, 'formTarget', formTarget);
  }

  return formData;
}

function pushAttribute(target, name, value) // not null or undefined
{
  switch (name) {
    // These are very common props and therefore are in the beginning of the switch.
    // TODO: aria-label is a very common prop but allows booleans so is not like the others
    // but should ideally go in this list too.
    case 'className':
      {
        pushStringAttribute(target, 'class', value);
        break;
      }

    case 'tabIndex':
      {
        pushStringAttribute(target, 'tabindex', value);
        break;
      }

    case 'dir':
    case 'role':
    case 'viewBox':
    case 'width':
    case 'height':
      {
        pushStringAttribute(target, name, value);
        break;
      }

    case 'style':
      {
        pushStyleAttribute(target, value);
        return;
      }

    case 'src':
    case 'href':
    // Fall through to the last case which shouldn't remove empty strings.

    case 'action':
    case 'formAction':
      {
        // TODO: Consider only special casing these for each tag.
        if (value == null || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'boolean') {
          return;
        }

        const sanitizedValue = sanitizeURL('' + value);
        target.push(attributeSeparator, stringToChunk(name), attributeAssign, stringToChunk(escapeTextForBrowser(sanitizedValue)), attributeEnd);
        return;
      }

    case 'defaultValue':
    case 'defaultChecked': // These shouldn't be set as attributes on generic HTML elements.

    case 'innerHTML': // Must use dangerouslySetInnerHTML instead.

    case 'suppressContentEditableWarning':
    case 'suppressHydrationWarning':
    case 'ref':
      // Ignored. These are built-in to React on the client.
      return;

    case 'autoFocus':
    case 'multiple':
    case 'muted':
      {
        pushBooleanAttribute(target, name.toLowerCase(), value);
        return;
      }

    case 'xlinkHref':
      {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'boolean') {
          return;
        }

        const sanitizedValue = sanitizeURL('' + value);
        target.push(attributeSeparator, stringToChunk('xlink:href'), attributeAssign, stringToChunk(escapeTextForBrowser(sanitizedValue)), attributeEnd);
        return;
      }

    case 'contentEditable':
    case 'spellCheck':
    case 'draggable':
    case 'value':
    case 'autoReverse':
    case 'externalResourcesRequired':
    case 'focusable':
    case 'preserveAlpha':
      {
        // Booleanish String
        // These are "enumerated" attributes that accept "true" and "false".
        // In React, we let users pass `true` and `false` even though technically
        // these aren't boolean attributes (they are coerced to strings).
        if (typeof value !== 'function' && typeof value !== 'symbol') {
          target.push(attributeSeparator, stringToChunk(name), attributeAssign, stringToChunk(escapeTextForBrowser(value)), attributeEnd);
        }

        return;
      }

    case 'allowFullScreen':
    case 'async':
    case 'autoPlay':
    case 'controls':
    case 'default':
    case 'defer':
    case 'disabled':
    case 'disablePictureInPicture':
    case 'disableRemotePlayback':
    case 'formNoValidate':
    case 'hidden':
    case 'loop':
    case 'noModule':
    case 'noValidate':
    case 'open':
    case 'playsInline':
    case 'readOnly':
    case 'required':
    case 'reversed':
    case 'scoped':
    case 'seamless':
    case 'itemScope':
      {
        // Boolean
        if (value && typeof value !== 'function' && typeof value !== 'symbol') {
          target.push(attributeSeparator, stringToChunk(name), attributeEmptyString);
        }

        return;
      }

    case 'capture':
    case 'download':
      {
        // Overloaded Boolean
        if (value === true) {
          target.push(attributeSeparator, stringToChunk(name), attributeEmptyString);
        } else if (value === false) ; else if (typeof value !== 'function' && typeof value !== 'symbol') {
          target.push(attributeSeparator, stringToChunk(name), attributeAssign, stringToChunk(escapeTextForBrowser(value)), attributeEnd);
        }

        return;
      }

    case 'cols':
    case 'rows':
    case 'size':
    case 'span':
      {
        // These are HTML attributes that must be positive numbers.
        if (typeof value !== 'function' && typeof value !== 'symbol' && !isNaN(value) && value >= 1) {
          target.push(attributeSeparator, stringToChunk(name), attributeAssign, stringToChunk(escapeTextForBrowser(value)), attributeEnd);
        }

        return;
      }

    case 'rowSpan':
    case 'start':
      {
        // These are HTML attributes that must be numbers.
        if (typeof value !== 'function' && typeof value !== 'symbol' && !isNaN(value)) {
          target.push(attributeSeparator, stringToChunk(name), attributeAssign, stringToChunk(escapeTextForBrowser(value)), attributeEnd);
        }

        return;
      }

    case 'xlinkActuate':
      pushStringAttribute(target, 'xlink:actuate', value);
      return;

    case 'xlinkArcrole':
      pushStringAttribute(target, 'xlink:arcrole', value);
      return;

    case 'xlinkRole':
      pushStringAttribute(target, 'xlink:role', value);
      return;

    case 'xlinkShow':
      pushStringAttribute(target, 'xlink:show', value);
      return;

    case 'xlinkTitle':
      pushStringAttribute(target, 'xlink:title', value);
      return;

    case 'xlinkType':
      pushStringAttribute(target, 'xlink:type', value);
      return;

    case 'xmlBase':
      pushStringAttribute(target, 'xml:base', value);
      return;

    case 'xmlLang':
      pushStringAttribute(target, 'xml:lang', value);
      return;

    case 'xmlSpace':
      pushStringAttribute(target, 'xml:space', value);
      return;

    default:
      if ( // shouldIgnoreAttribute
      // We have already filtered out null/undefined and reserved words.
      name.length > 2 && (name[0] === 'o' || name[0] === 'O') && (name[1] === 'n' || name[1] === 'N')) {
        return;
      }

      const attributeName = getAttributeAlias(name);

      if (isAttributeNameSafe(attributeName)) {
        // shouldRemoveAttribute
        switch (typeof value) {
          case 'function':
          case 'symbol':
            // eslint-disable-line
            return;

          case 'boolean':
            {
              const prefix = attributeName.toLowerCase().slice(0, 5);

              if (prefix !== 'data-' && prefix !== 'aria-') {
                return;
              }
            }
        }

        target.push(attributeSeparator, stringToChunk(attributeName), attributeAssign, stringToChunk(escapeTextForBrowser(value)), attributeEnd);
      }

  }
}

const endOfStartTag = stringToPrecomputedChunk('>');
const endOfStartTagSelfClosing = stringToPrecomputedChunk('/>');

function pushInnerHTML(target, innerHTML, children) {
  if (innerHTML != null) {
    if (children != null) {
      throw Error(formatProdErrorMessage(60));
    }

    if (typeof innerHTML !== 'object' || !('__html' in innerHTML)) {
      throw Error(formatProdErrorMessage(61));
    }

    const html = innerHTML.__html;

    if (html !== null && html !== undefined) {

      target.push(stringToChunk('' + html));
    }
  }
} // TODO: Move these to RenderState so that we warn for every request.

function pushStartSelect(target, props) {

  target.push(startChunkForTag('select'));
  let children = null;
  let innerHTML = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
          children = propValue;
          break;

        case 'dangerouslySetInnerHTML':
          // TODO: This doesn't really make sense for select since it can't use the controlled
          // value in the innerHTML.
          innerHTML = propValue;
          break;

        case 'defaultValue':
        case 'value':
          // These are set on the Context instead and applied to the nested options.
          break;

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  target.push(endOfStartTag);
  pushInnerHTML(target, innerHTML, children);
  return children;
}

function flattenOptionChildren(children) {
  let content = ''; // Flatten children and warn if they aren't strings or numbers;
  // invalid types are ignored.

  React.Children.forEach(children, function (child) {
    if (child == null) {
      return;
    }

    content += child;
  });
  return content;
}

const selectedMarkerAttribute = stringToPrecomputedChunk(' selected=""');

function pushStartOption(target, props, formatContext) {
  const selectedValue = formatContext.selectedValue;
  target.push(startChunkForTag('option'));
  let children = null;
  let value = null;
  let selected = null;
  let innerHTML = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
          children = propValue;
          break;

        case 'selected':
          // ignore
          selected = propValue;

          break;

        case 'dangerouslySetInnerHTML':
          innerHTML = propValue;
          break;

        case 'value':
          value = propValue;
        // We intentionally fallthrough to also set the attribute on the node.

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  if (selectedValue != null) {
    let stringValue;

    if (value !== null) {

      stringValue = '' + value;
    } else {

      stringValue = flattenOptionChildren(children);
    }

    if (isArray(selectedValue)) {
      // multiple
      for (let i = 0; i < selectedValue.length; i++) {

        const v = '' + selectedValue[i];

        if (v === stringValue) {
          target.push(selectedMarkerAttribute);
          break;
        }
      }
    } else {

      if ('' + selectedValue === stringValue) {
        target.push(selectedMarkerAttribute);
      }
    }
  } else if (selected) {
    target.push(selectedMarkerAttribute);
  }

  target.push(endOfStartTag);
  pushInnerHTML(target, innerHTML, children);
  return children;
}

const formReplayingRuntimeScript = stringToPrecomputedChunk(formReplaying);

function injectFormReplayingRuntime(resumableState, renderState) {
  // If we haven't sent it yet, inject the runtime that tracks submitted JS actions
  // for later replaying by Fiber. If we use an external runtime, we don't need
  // to emit anything. It's always used.
  if ((resumableState.instructions & SentFormReplayingRuntime) === NothingSent && (!renderState.externalRuntimeScript)) {
    resumableState.instructions |= SentFormReplayingRuntime;
    renderState.bootstrapChunks.unshift(renderState.startInlineScript, formReplayingRuntimeScript, endInlineScript);
  }
}

const formStateMarkerIsMatching = stringToPrecomputedChunk('<!--F!-->');
const formStateMarkerIsNotMatching = stringToPrecomputedChunk('<!--F-->');
function pushFormStateMarkerIsMatching(target) {
  target.push(formStateMarkerIsMatching);
}
function pushFormStateMarkerIsNotMatching(target) {
  target.push(formStateMarkerIsNotMatching);
}

function pushStartForm(target, props, resumableState, renderState) {
  target.push(startChunkForTag('form'));
  let children = null;
  let innerHTML = null;
  let formAction = null;
  let formEncType = null;
  let formMethod = null;
  let formTarget = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
          children = propValue;
          break;

        case 'dangerouslySetInnerHTML':
          innerHTML = propValue;
          break;

        case 'action':
          formAction = propValue;
          break;

        case 'encType':
          formEncType = propValue;
          break;

        case 'method':
          formMethod = propValue;
          break;

        case 'target':
          formTarget = propValue;
          break;

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  let formData = null;
  let formActionName = null;

  if (typeof formAction === 'function') {

    const customAction = formAction.$$FORM_ACTION;

    if (typeof customAction === 'function') {
      // This action has a custom progressive enhancement form that can submit the form
      // back to the server if it's invoked before hydration. Such as a Server Action.
      const prefix = makeFormFieldPrefix(resumableState);
      const customFields = formAction.$$FORM_ACTION(prefix);
      formAction = customFields.action || '';
      formEncType = customFields.encType;
      formMethod = customFields.method;
      formTarget = customFields.target;
      formData = customFields.data;
      formActionName = customFields.name;
    } else {
      // Set a javascript URL that doesn't do anything. We don't expect this to be invoked
      // because we'll preventDefault in the Fizz runtime, but it can happen if a form is
      // manually submitted or if someone calls stopPropagation before React gets the event.
      // If CSP is used to block javascript: URLs that's fine too. It just won't show this
      // error message but the URL will be logged.
      target.push(attributeSeparator, stringToChunk('action'), attributeAssign, actionJavaScriptURL, attributeEnd);
      formAction = null;
      formEncType = null;
      formMethod = null;
      formTarget = null;
      injectFormReplayingRuntime(resumableState, renderState);
    }
  }

  if (formAction != null) {
    pushAttribute(target, 'action', formAction);
  }

  if (formEncType != null) {
    pushAttribute(target, 'encType', formEncType);
  }

  if (formMethod != null) {
    pushAttribute(target, 'method', formMethod);
  }

  if (formTarget != null) {
    pushAttribute(target, 'target', formTarget);
  }

  target.push(endOfStartTag);

  if (formActionName !== null) {
    target.push(startHiddenInputChunk);
    pushStringAttribute(target, 'name', formActionName);
    target.push(endOfStartTagSelfClosing);
    pushAdditionalFormFields(target, formData);
  }

  pushInnerHTML(target, innerHTML, children);

  if (typeof children === 'string') {
    // Special case children as a string to avoid the unnecessary comment.
    // TODO: Remove this special case after the general optimization is in place.
    target.push(stringToChunk(encodeHTMLTextNode(children)));
    return null;
  }

  return children;
}

function pushInput(target, props, resumableState, renderState) {

  target.push(startChunkForTag('input'));
  let name = null;
  let formAction = null;
  let formEncType = null;
  let formMethod = null;
  let formTarget = null;
  let value = null;
  let defaultValue = null;
  let checked = null;
  let defaultChecked = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
        case 'dangerouslySetInnerHTML':
          throw Error(formatProdErrorMessage(399, 'input'));

        case 'name':
          name = propValue;
          break;

        case 'formAction':
          formAction = propValue;
          break;

        case 'formEncType':
          formEncType = propValue;
          break;

        case 'formMethod':
          formMethod = propValue;
          break;

        case 'formTarget':
          formTarget = propValue;
          break;

        case 'defaultChecked':
          defaultChecked = propValue;
          break;

        case 'defaultValue':
          defaultValue = propValue;
          break;

        case 'checked':
          checked = propValue;
          break;

        case 'value':
          value = propValue;
          break;

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  const formData = pushFormActionAttribute(target, resumableState, renderState, formAction, formEncType, formMethod, formTarget, name);

  if (checked !== null) {
    pushBooleanAttribute(target, 'checked', checked);
  } else if (defaultChecked !== null) {
    pushBooleanAttribute(target, 'checked', defaultChecked);
  }

  if (value !== null) {
    pushAttribute(target, 'value', value);
  } else if (defaultValue !== null) {
    pushAttribute(target, 'value', defaultValue);
  }

  target.push(endOfStartTagSelfClosing); // We place any additional hidden form fields after the input.

  pushAdditionalFormFields(target, formData);
  return null;
}

function pushStartButton(target, props, resumableState, renderState) {
  target.push(startChunkForTag('button'));
  let children = null;
  let innerHTML = null;
  let name = null;
  let formAction = null;
  let formEncType = null;
  let formMethod = null;
  let formTarget = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
          children = propValue;
          break;

        case 'dangerouslySetInnerHTML':
          innerHTML = propValue;
          break;

        case 'name':
          name = propValue;
          break;

        case 'formAction':
          formAction = propValue;
          break;

        case 'formEncType':
          formEncType = propValue;
          break;

        case 'formMethod':
          formMethod = propValue;
          break;

        case 'formTarget':
          formTarget = propValue;
          break;

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  const formData = pushFormActionAttribute(target, resumableState, renderState, formAction, formEncType, formMethod, formTarget, name);
  target.push(endOfStartTag); // We place any additional hidden form fields we need to include inside the button itself.

  pushAdditionalFormFields(target, formData);
  pushInnerHTML(target, innerHTML, children);

  if (typeof children === 'string') {
    // Special case children as a string to avoid the unnecessary comment.
    // TODO: Remove this special case after the general optimization is in place.
    target.push(stringToChunk(encodeHTMLTextNode(children)));
    return null;
  }

  return children;
}

function pushStartTextArea(target, props) {

  target.push(startChunkForTag('textarea'));
  let value = null;
  let defaultValue = null;
  let children = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
          children = propValue;
          break;

        case 'value':
          value = propValue;
          break;

        case 'defaultValue':
          defaultValue = propValue;
          break;

        case 'dangerouslySetInnerHTML':
          throw Error(formatProdErrorMessage(91));

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  if (value === null && defaultValue !== null) {
    value = defaultValue;
  }

  target.push(endOfStartTag); // TODO (yungsters): Remove support for children content in <textarea>.

  if (children != null) {

    if (value != null) {
      throw Error(formatProdErrorMessage(92));
    }

    if (isArray(children)) {
      if (children.length > 1) {
        throw Error(formatProdErrorMessage(93));
      } // TODO: remove the coercion and the DEV check below because it will

      value = '' + children[0];
    }

    value = '' + children;
  }

  if (typeof value === 'string' && value[0] === '\n') {
    // text/html ignores the first character in these tags if it's a newline
    // Prefer to break application/xml over text/html (for now) by adding
    // a newline specifically to get eaten by the parser. (Alternately for
    // textareas, replacing "^\n" with "\r\n" doesn't get eaten, and the first
    // \r is normalized out by HTMLTextAreaElement#value.)
    // See: <http://www.w3.org/TR/html-polyglot/#newlines-in-textarea-and-pre>
    // See: <http://www.w3.org/TR/html5/syntax.html#element-restrictions>
    // See: <http://www.w3.org/TR/html5/syntax.html#newlines>
    // See: Parsing of "textarea" "listing" and "pre" elements
    //  from <http://www.w3.org/TR/html5/syntax.html#parsing-main-inbody>
    target.push(leadingNewline);
  } // ToString and push directly instead of recurse over children.
  // We don't really support complex children in the value anyway.
  // This also currently avoids a trailing comment node which breaks textarea.


  if (value !== null) {

    target.push(stringToChunk(encodeHTMLTextNode('' + value)));
  }

  return null;
}

function pushMeta(target, props, renderState, textEmbedded, insertionMode, noscriptTagInScope, isFallback) {
  {
    if (insertionMode === SVG_MODE || noscriptTagInScope || props.itemProp != null) {
      return pushSelfClosing(target, props, 'meta');
    } else {
      if (textEmbedded) {
        // This link follows text but we aren't writing a tag. while not as efficient as possible we need
        // to be safe and assume text will follow by inserting a textSeparator
        target.push(textSeparator);
      }

      if (isFallback) {
        // Hoistable Elements for fallbacks are simply omitted. we don't want to emit them early
        // because they are likely superceded by primary content and we want to avoid needing to clean
        // them up when the primary content is ready. They are never hydrated on the client anyway because
        // boundaries in fallback are awaited or client render, in either case there is never hydration
        return null;
      } else if (typeof props.charSet === 'string') {
        // "charset" Should really be config and not picked up from tags however since this is
        // the only way to embed the tag today we flush it on a special queue on the Request so it
        // can go before everything else. Like viewport this means that the tag will escape it's
        // parent container.
        return pushSelfClosing(renderState.charsetChunks, props, 'meta');
      } else if (props.name === 'viewport') {
        // "viewport" is flushed on the Request so it can go earlier that Float resources that
        // might be affected by it. This means it can escape the boundary it is rendered within.
        // This is a pragmatic solution to viewport being incredibly sensitive to document order
        // without requiring all hoistables to be flushed too early.
        return pushSelfClosing(renderState.viewportChunks, props, 'meta');
      } else {
        return pushSelfClosing(renderState.hoistableChunks, props, 'meta');
      }
    }
  }
}

function pushLink(target, props, resumableState, renderState, hoistableState, textEmbedded, insertionMode, noscriptTagInScope, isFallback) {
  {
    const rel = props.rel;
    const href = props.href;
    const precedence = props.precedence;

    if (insertionMode === SVG_MODE || noscriptTagInScope || props.itemProp != null || typeof rel !== 'string' || typeof href !== 'string' || href === '') {

      pushLinkImpl(target, props);
      return null;
    }

    if (props.rel === 'stylesheet') {
      // This <link> may hoistable as a Stylesheet Resource, otherwise it will emit in place
      const key = getResourceKey(href);

      if (typeof precedence !== 'string' || props.disabled != null || props.onLoad || props.onError) {

        return pushLinkImpl(target, props);
      } else {
        // This stylesheet refers to a Resource and we create a new one if necessary
        let styleQueue = renderState.styles.get(precedence);
        const hasKey = resumableState.styleResources.hasOwnProperty(key);
        const resourceState = hasKey ? resumableState.styleResources[key] : undefined;

        if (resourceState !== EXISTS) {
          // We are going to create this resource now so it is marked as Exists
          resumableState.styleResources[key] = EXISTS; // If this is the first time we've encountered this precedence we need
          // to create a StyleQueue

          if (!styleQueue) {
            styleQueue = {
              precedence: stringToChunk(escapeTextForBrowser(precedence)),
              rules: [],
              hrefs: [],
              sheets: new Map()
            };
            renderState.styles.set(precedence, styleQueue);
          }

          const resource = {
            state: PENDING$1,
            props: stylesheetPropsFromRawProps(props)
          };

          if (resourceState) {
            // When resourceState is truty it is a Preload state. We cast it for clarity
            const preloadState = resourceState;

            if (preloadState.length === 2) {
              adoptPreloadCredentials(resource.props, preloadState);
            }

            const preloadResource = renderState.preloads.stylesheets.get(key);

            if (preloadResource && preloadResource.length > 0) {
              // The Preload for this resource was created in this render pass and has not flushed yet so
              // we need to clear it to avoid it flushing.
              preloadResource.length = 0;
            } else {
              // Either the preload resource from this render already flushed in this render pass
              // or the preload flushed in a prior pass (prerender). In either case we need to mark
              // this resource as already having been preloaded.
              resource.state = PRELOADED;
            }
          } // We add the newly created resource to our StyleQueue and if necessary
          // track the resource with the currently rendering boundary


          styleQueue.sheets.set(key, resource);

          if (hoistableState) {
            hoistableState.stylesheets.add(resource);
          }
        } else {
          // We need to track whether this boundary should wait on this resource or not.
          // Typically this resource should always exist since we either had it or just created
          // it. However, it's possible when you resume that the style has already been emitted
          // and then it wouldn't be recreated in the RenderState and there's no need to track
          // it again since we should've hoisted it to the shell already.
          if (styleQueue) {
            const resource = styleQueue.sheets.get(key);

            if (resource) {
              if (hoistableState) {
                hoistableState.stylesheets.add(resource);
              }
            }
          }
        }

        if (textEmbedded) {
          // This link follows text but we aren't writing a tag. while not as efficient as possible we need
          // to be safe and assume text will follow by inserting a textSeparator
          target.push(textSeparator);
        }

        return null;
      }
    } else if (props.onLoad || props.onError) {
      // When using load handlers we cannot hoist and need to emit links in place
      return pushLinkImpl(target, props);
    } else {
      // We can hoist this link so we may need to emit a text separator.
      // @TODO refactor text separators so we don't have to defensively add
      // them when we don't end up emitting a tag as a result of pushStartInstance
      if (textEmbedded) {
        // This link follows text but we aren't writing a tag. while not as efficient as possible we need
        // to be safe and assume text will follow by inserting a textSeparator
        target.push(textSeparator);
      }

      if (isFallback) {
        // Hoistable Elements for fallbacks are simply omitted. we don't want to emit them early
        // because they are likely superceded by primary content and we want to avoid needing to clean
        // them up when the primary content is ready. They are never hydrated on the client anyway because
        // boundaries in fallback are awaited or client render, in either case there is never hydration
        return null;
      } else {
        return pushLinkImpl(renderState.hoistableChunks, props);
      }
    }
  }
}

function pushLinkImpl(target, props) {
  target.push(startChunkForTag('link'));

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
        case 'dangerouslySetInnerHTML':
          throw Error(formatProdErrorMessage(399, 'link'));

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  target.push(endOfStartTagSelfClosing);
  return null;
}

function pushStyle(target, props, resumableState, renderState, hoistableState, textEmbedded, insertionMode, noscriptTagInScope) {

  {
    const precedence = props.precedence;
    const href = props.href;

    if (insertionMode === SVG_MODE || noscriptTagInScope || props.itemProp != null || typeof precedence !== 'string' || typeof href !== 'string' || href === '') {
      // This style tag is not able to be turned into a Style Resource
      return pushStyleImpl(target, props);
    }

    const key = getResourceKey(href);
    let styleQueue = renderState.styles.get(precedence);
    const hasKey = resumableState.styleResources.hasOwnProperty(key);
    const resourceState = hasKey ? resumableState.styleResources[key] : undefined;

    if (resourceState !== EXISTS) {
      // We are going to create this resource now so it is marked as Exists
      resumableState.styleResources[key] = EXISTS;

      if (!styleQueue) {
        // This is the first time we've encountered this precedence we need
        // to create a StyleQueue.
        styleQueue = {
          precedence: stringToChunk(escapeTextForBrowser(precedence)),
          rules: [],
          hrefs: [stringToChunk(escapeTextForBrowser(href))],
          sheets: new Map()
        };
        renderState.styles.set(precedence, styleQueue);
      } else {
        // We have seen this precedence before and need to track this href
        styleQueue.hrefs.push(stringToChunk(escapeTextForBrowser(href)));
      }

      pushStyleContents(styleQueue.rules, props);
    }

    if (styleQueue) {
      // We need to track whether this boundary should wait on this resource or not.
      // Typically this resource should always exist since we either had it or just created
      // it. However, it's possible when you resume that the style has already been emitted
      // and then it wouldn't be recreated in the RenderState and there's no need to track
      // it again since we should've hoisted it to the shell already.
      if (hoistableState) {
        hoistableState.styles.add(styleQueue);
      }
    }

    if (textEmbedded) {
      // This link follows text but we aren't writing a tag. while not as efficient as possible we need
      // to be safe and assume text will follow by inserting a textSeparator
      target.push(textSeparator);
    }
  }
}

function pushStyleImpl(target, props) {
  target.push(startChunkForTag('style'));
  let children = null;
  let innerHTML = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
          children = propValue;
          break;

        case 'dangerouslySetInnerHTML':
          innerHTML = propValue;
          break;

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  target.push(endOfStartTag);
  const child = Array.isArray(children) ? children.length < 2 ? children[0] : null : children;

  if (typeof child !== 'function' && typeof child !== 'symbol' && child !== null && child !== undefined) {
    // eslint-disable-next-line react-internal/safe-string-coercion
    target.push(stringToChunk(escapeTextForBrowser('' + child)));
  }

  pushInnerHTML(target, innerHTML, children);
  target.push(endChunkForTag('style'));
  return null;
}

function pushStyleContents(target, props) {
  let children = null;
  let innerHTML = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
          children = propValue;
          break;

        case 'dangerouslySetInnerHTML':
          innerHTML = propValue;
          break;
      }
    }
  }

  const child = Array.isArray(children) ? children.length < 2 ? children[0] : null : children;

  if (typeof child !== 'function' && typeof child !== 'symbol' && child !== null && child !== undefined) {
    // eslint-disable-next-line react-internal/safe-string-coercion
    target.push(stringToChunk(escapeTextForBrowser('' + child)));
  }

  pushInnerHTML(target, innerHTML, children);
  return;
}

function pushImg(target, props, resumableState, renderState, pictureTagInScope) {
  const src = props.src,
        srcSet = props.srcSet;

  if (props.loading !== 'lazy' && (src || srcSet) && (typeof src === 'string' || src == null) && (typeof srcSet === 'string' || srcSet == null) && props.fetchPriority !== 'low' && pictureTagInScope === false && // We exclude data URIs in src and srcSet since these should not be preloaded
  !(typeof src === 'string' && src[4] === ':' && (src[0] === 'd' || src[0] === 'D') && (src[1] === 'a' || src[1] === 'A') && (src[2] === 't' || src[2] === 'T') && (src[3] === 'a' || src[3] === 'A')) && !(typeof srcSet === 'string' && srcSet[4] === ':' && (srcSet[0] === 'd' || srcSet[0] === 'D') && (srcSet[1] === 'a' || srcSet[1] === 'A') && (srcSet[2] === 't' || srcSet[2] === 'T') && (srcSet[3] === 'a' || srcSet[3] === 'A'))) {
    // We have a suspensey image and ought to preload it to optimize the loading of display blocking
    // resumableState.
    const sizes = typeof props.sizes === 'string' ? props.sizes : undefined;
    const key = getImageResourceKey(src, srcSet, sizes);
    const promotablePreloads = renderState.preloads.images;
    let resource = promotablePreloads.get(key);

    if (resource) {
      // We consider whether this preload can be promoted to higher priority flushing queue.
      // The only time a resource will exist here is if it was created during this render
      // and was not already in the high priority queue.
      if (props.fetchPriority === 'high' || renderState.highImagePreloads.size < 10) {
        // Delete the resource from the map since we are promoting it and don't want to
        // reenter this branch in a second pass for duplicate img hrefs.
        promotablePreloads.delete(key); // $FlowFixMe - Flow should understand that this is a Resource if the condition was true

        renderState.highImagePreloads.add(resource);
      }
    } else if (!resumableState.imageResources.hasOwnProperty(key)) {
      // We must construct a new preload resource
      resumableState.imageResources[key] = PRELOAD_NO_CREDS;
      const crossOrigin = getCrossOriginString(props.crossOrigin);
      const headers = renderState.headers;
      let header;

      if (headers && headers.remainingCapacity > 0 && ( // this is a hueristic similar to capping element preloads to 10 unless explicitly
      // fetchPriority="high". We use length here which means it will fit fewer images when
      // the urls are long and more when short. arguably byte size is a better hueristic because
      // it directly translates to how much we send down before content is actually seen.
      // We could unify the counts and also make it so the total is tracked regardless of
      // flushing output but since the headers are likely to be go earlier than content
      // they don't really conflict so for now I've kept them separate
      props.fetchPriority === 'high' || headers.highImagePreloads.length < 500) && ( // We manually construct the options for the preload only from strings. We don't want to pollute
      // the params list with arbitrary props and if we copied everything over as it we might get
      // coercion errors. We have checks for this in Dev but it seems safer to just only accept values
      // that are strings
      header = getPreloadAsHeader(src, 'image', {
        imageSrcSet: props.srcSet,
        imageSizes: props.sizes,
        crossOrigin,
        integrity: props.integrity,
        nonce: props.nonce,
        type: props.type,
        fetchPriority: props.fetchPriority,
        referrerPolicy: props.refererPolicy
      }), // We always consume the header length since once we find one header that doesn't fit
      // we assume all the rest won't as well. This is to avoid getting into a situation
      // where we have a very small remaining capacity but no headers will ever fit and we end
      // up constantly trying to see if the next resource might make it. In the future we can
      // make this behavior different between render and prerender since in the latter case
      // we are less sensitive to the current requests runtime per and more sensitive to maximizing
      // headers.
      (headers.remainingCapacity -= header.length) >= 2)) {
        // If we postpone in the shell we will still emit this preload so we track
        // it to make sure we don't reset it.
        renderState.resets.image[key] = PRELOAD_NO_CREDS;

        if (headers.highImagePreloads) {
          headers.highImagePreloads += ', ';
        } // $FlowFixMe[unsafe-addition]: we assign header during the if condition


        headers.highImagePreloads += header;
      } else {
        resource = [];
        pushLinkImpl(resource, {
          rel: 'preload',
          as: 'image',
          // There is a bug in Safari where imageSrcSet is not respected on preload links
          // so we omit the href here if we have imageSrcSet b/c safari will load the wrong image.
          // This harms older browers that do not support imageSrcSet by making their preloads not work
          // but this population is shrinking fast and is already small so we accept this tradeoff.
          href: srcSet ? undefined : src,
          imageSrcSet: srcSet,
          imageSizes: sizes,
          crossOrigin: crossOrigin,
          integrity: props.integrity,
          type: props.type,
          fetchPriority: props.fetchPriority,
          referrerPolicy: props.referrerPolicy
        });

        if (props.fetchPriority === 'high' || renderState.highImagePreloads.size < 10) {
          renderState.highImagePreloads.add(resource);
        } else {
          renderState.bulkPreloads.add(resource); // We can bump the priority up if the same img is rendered later
          // with fetchPriority="high"

          promotablePreloads.set(key, resource);
        }
      }
    }
  }

  return pushSelfClosing(target, props, 'img');
}

function pushSelfClosing(target, props, tag) {
  target.push(startChunkForTag(tag));

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
        case 'dangerouslySetInnerHTML':
          throw Error(formatProdErrorMessage(399, tag));

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  target.push(endOfStartTagSelfClosing);
  return null;
}

function pushStartMenuItem(target, props) {
  target.push(startChunkForTag('menuitem'));

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
        case 'dangerouslySetInnerHTML':
          throw Error(formatProdErrorMessage(400));

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  target.push(endOfStartTag);
  return null;
}

function pushTitle(target, props, renderState, insertionMode, noscriptTagInScope, isFallback) {

  {
    if (insertionMode !== SVG_MODE && !noscriptTagInScope && props.itemProp == null) {
      if (isFallback) {
        // Hoistable Elements for fallbacks are simply omitted. we don't want to emit them early
        // because they are likely superceded by primary content and we want to avoid needing to clean
        // them up when the primary content is ready. They are never hydrated on the client anyway because
        // boundaries in fallback are awaited or client render, in either case there is never hydration
        return null;
      } else {
        pushTitleImpl(renderState.hoistableChunks, props);
      }
    } else {
      return pushTitleImpl(target, props);
    }
  }
}

function pushTitleImpl(target, props) {
  target.push(startChunkForTag('title'));
  let children = null;
  let innerHTML = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
          children = propValue;
          break;

        case 'dangerouslySetInnerHTML':
          innerHTML = propValue;
          break;

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  target.push(endOfStartTag);
  const child = Array.isArray(children) ? children.length < 2 ? children[0] : null : children;

  if (typeof child !== 'function' && typeof child !== 'symbol' && child !== null && child !== undefined) {
    // eslint-disable-next-line react-internal/safe-string-coercion
    target.push(stringToChunk(escapeTextForBrowser('' + child)));
  }

  pushInnerHTML(target, innerHTML, children);
  target.push(endChunkForTag('title'));
  return null;
}

function pushStartHead(target, props, renderState, insertionMode) {
  {
    if (insertionMode < HTML_MODE && renderState.headChunks === null) {
      // This <head> is the Document.head and should be part of the preamble
      renderState.headChunks = [];
      return pushStartGenericElement(renderState.headChunks, props, 'head');
    } else {
      // This <head> is deep and is likely just an error. we emit it inline though.
      // Validation should warn that this tag is the the wrong spot.
      return pushStartGenericElement(target, props, 'head');
    }
  }
}

function pushStartHtml(target, props, renderState, insertionMode) {
  {
    if (insertionMode === ROOT_HTML_MODE && renderState.htmlChunks === null) {
      // This <html> is the Document.documentElement and should be part of the preamble
      renderState.htmlChunks = [doctypeChunk];
      return pushStartGenericElement(renderState.htmlChunks, props, 'html');
    } else {
      // This <html> is deep and is likely just an error. we emit it inline though.
      // Validation should warn that this tag is the the wrong spot.
      return pushStartGenericElement(target, props, 'html');
    }
  }
}

function pushScript(target, props, resumableState, renderState, textEmbedded, insertionMode, noscriptTagInScope) {
  {
    const asyncProp = props.async;

    if (typeof props.src !== 'string' || !props.src || !(asyncProp && typeof asyncProp !== 'function' && typeof asyncProp !== 'symbol') || props.onLoad || props.onError || insertionMode === SVG_MODE || noscriptTagInScope || props.itemProp != null) {
      // This script will not be a resource, we bailout early and emit it in place.
      return pushScriptImpl(target, props);
    }

    const src = props.src;
    const key = getResourceKey(src); // We can make this <script> into a ScriptResource

    let resources, preloads;

    if (props.type === 'module') {
      resources = resumableState.moduleScriptResources;
      preloads = renderState.preloads.moduleScripts;
    } else {
      resources = resumableState.scriptResources;
      preloads = renderState.preloads.scripts;
    }

    const hasKey = resources.hasOwnProperty(key);
    const resourceState = hasKey ? resources[key] : undefined;

    if (resourceState !== EXISTS) {
      // We are going to create this resource now so it is marked as Exists
      resources[key] = EXISTS;
      let scriptProps = props;

      if (resourceState) {
        // When resourceState is truty it is a Preload state. We cast it for clarity
        const preloadState = resourceState;

        if (preloadState.length === 2) {
          scriptProps = assign({}, props);
          adoptPreloadCredentials(scriptProps, preloadState);
        }

        const preloadResource = preloads.get(key);

        if (preloadResource) {
          // the preload resource exists was created in this render. Now that we have
          // a script resource which will emit earlier than a preload would if it
          // hasn't already flushed we prevent it from flushing by zeroing the length
          preloadResource.length = 0;
        }
      }

      const resource = []; // Add to the script flushing queue

      renderState.scripts.add(resource); // encode the tag as Chunks

      pushScriptImpl(resource, scriptProps);
    }

    if (textEmbedded) {
      // This script follows text but we aren't writing a tag. while not as efficient as possible we need
      // to be safe and assume text will follow by inserting a textSeparator
      target.push(textSeparator);
    }

    return null;
  }
}

function pushScriptImpl(target, props) {
  target.push(startChunkForTag('script'));
  let children = null;
  let innerHTML = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
          children = propValue;
          break;

        case 'dangerouslySetInnerHTML':
          innerHTML = propValue;
          break;

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  target.push(endOfStartTag);

  pushInnerHTML(target, innerHTML, children);

  if (typeof children === 'string') {
    target.push(stringToChunk(encodeHTMLTextNode(children)));
  }

  target.push(endChunkForTag('script'));
  return null;
}

function pushStartGenericElement(target, props, tag) {
  target.push(startChunkForTag(tag));
  let children = null;
  let innerHTML = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
          children = propValue;
          break;

        case 'dangerouslySetInnerHTML':
          innerHTML = propValue;
          break;

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  target.push(endOfStartTag);
  pushInnerHTML(target, innerHTML, children);

  if (typeof children === 'string') {
    // Special case children as a string to avoid the unnecessary comment.
    // TODO: Remove this special case after the general optimization is in place.
    target.push(stringToChunk(encodeHTMLTextNode(children)));
    return null;
  }

  return children;
}

function pushStartCustomElement(target, props, tag) {
  target.push(startChunkForTag(tag));
  let children = null;
  let innerHTML = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      let propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      let attributeName = propKey;

      switch (propKey) {
        case 'children':
          children = propValue;
          break;

        case 'dangerouslySetInnerHTML':
          innerHTML = propValue;
          break;

        case 'style':
          pushStyleAttribute(target, propValue);
          break;

        case 'suppressContentEditableWarning':
        case 'suppressHydrationWarning':
        case 'ref':
          // Ignored. These are built-in to React on the client.
          break;

        case 'className':

        // intentional fallthrough

        default:
          if (isAttributeNameSafe(propKey) && typeof propValue !== 'function' && typeof propValue !== 'symbol') {

            target.push(attributeSeparator, stringToChunk(attributeName), attributeAssign, stringToChunk(escapeTextForBrowser(propValue)), attributeEnd);
          }

          break;
      }
    }
  }

  target.push(endOfStartTag);
  pushInnerHTML(target, innerHTML, children);
  return children;
}

const leadingNewline = stringToPrecomputedChunk('\n');

function pushStartPreformattedElement(target, props, tag) {
  target.push(startChunkForTag(tag));
  let children = null;
  let innerHTML = null;

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'children':
          children = propValue;
          break;

        case 'dangerouslySetInnerHTML':
          innerHTML = propValue;
          break;

        default:
          pushAttribute(target, propKey, propValue);
          break;
      }
    }
  }

  target.push(endOfStartTag); // text/html ignores the first character in these tags if it's a newline
  // Prefer to break application/xml over text/html (for now) by adding
  // a newline specifically to get eaten by the parser. (Alternately for
  // textareas, replacing "^\n" with "\r\n" doesn't get eaten, and the first
  // \r is normalized out by HTMLTextAreaElement#value.)
  // See: <http://www.w3.org/TR/html-polyglot/#newlines-in-textarea-and-pre>
  // See: <http://www.w3.org/TR/html5/syntax.html#element-restrictions>
  // See: <http://www.w3.org/TR/html5/syntax.html#newlines>
  // See: Parsing of "textarea" "listing" and "pre" elements
  //  from <http://www.w3.org/TR/html5/syntax.html#parsing-main-inbody>
  // TODO: This doesn't deal with the case where the child is an array
  // or component that returns a string.

  if (innerHTML != null) {
    if (children != null) {
      throw Error(formatProdErrorMessage(60));
    }

    if (typeof innerHTML !== 'object' || !('__html' in innerHTML)) {
      throw Error(formatProdErrorMessage(61));
    }

    const html = innerHTML.__html;

    if (html !== null && html !== undefined) {
      if (typeof html === 'string' && html.length > 0 && html[0] === '\n') {
        target.push(leadingNewline, stringToChunk(html));
      } else {

        target.push(stringToChunk('' + html));
      }
    }
  }

  if (typeof children === 'string' && children[0] === '\n') {
    target.push(leadingNewline);
  }

  return children;
} // We accept any tag to be rendered but since this gets injected into arbitrary
// HTML, we want to make sure that it's a safe tag.
// http://www.w3.org/TR/REC-xml/#NT-Name


const VALID_TAG_REGEX = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/; // Simplified subset

const validatedTagCache = new Map();

function startChunkForTag(tag) {
  let tagStartChunk = validatedTagCache.get(tag);

  if (tagStartChunk === undefined) {
    if (!VALID_TAG_REGEX.test(tag)) {
      throw Error(formatProdErrorMessage(65, tag));
    }

    tagStartChunk = stringToPrecomputedChunk('<' + tag);
    validatedTagCache.set(tag, tagStartChunk);
  }

  return tagStartChunk;
}
function pushStartInstance(target, type, props, resumableState, renderState, hoistableState, formatContext, textEmbedded, isFallback) {

  switch (type) {
    case 'div':
    case 'span':
    case 'svg':
    case 'path':
      // Fast track very common tags
      break;

    case 'a':
      {
        break;
      }

    case 'g':
    case 'p':
    case 'li':
      // Fast track very common tags
      break;
    // Special tags

    case 'select':
      return pushStartSelect(target, props);

    case 'option':
      return pushStartOption(target, props, formatContext);

    case 'textarea':
      return pushStartTextArea(target, props);

    case 'input':
      return pushInput(target, props, resumableState, renderState);

    case 'button':
      return pushStartButton(target, props, resumableState, renderState);

    case 'form':
      return pushStartForm(target, props, resumableState, renderState);

    case 'menuitem':
      return pushStartMenuItem(target, props);

    case 'title':
      return pushTitle(target, props, renderState, formatContext.insertionMode, !!(formatContext.tagScope & NOSCRIPT_SCOPE), isFallback) ;

    case 'link':
      return pushLink(target, props, resumableState, renderState, hoistableState, textEmbedded, formatContext.insertionMode, !!(formatContext.tagScope & NOSCRIPT_SCOPE), isFallback);

    case 'script':
      return pushScript(target, props, resumableState, renderState, textEmbedded, formatContext.insertionMode, !!(formatContext.tagScope & NOSCRIPT_SCOPE)) ;

    case 'style':
      return pushStyle(target, props, resumableState, renderState, hoistableState, textEmbedded, formatContext.insertionMode, !!(formatContext.tagScope & NOSCRIPT_SCOPE));

    case 'meta':
      return pushMeta(target, props, renderState, textEmbedded, formatContext.insertionMode, !!(formatContext.tagScope & NOSCRIPT_SCOPE), isFallback);
    // Newline eating tags

    case 'listing':
    case 'pre':
      {
        return pushStartPreformattedElement(target, props, type);
      }

    case 'img':
      {
        return pushImg(target, props, resumableState, renderState, !!(formatContext.tagScope & PICTURE_SCOPE)) ;
      }
    // Omitted close tags

    case 'base':
    case 'area':
    case 'br':
    case 'col':
    case 'embed':
    case 'hr':
    case 'keygen':
    case 'param':
    case 'source':
    case 'track':
    case 'wbr':
      {
        return pushSelfClosing(target, props, type);
      }
    // These are reserved SVG and MathML elements, that are never custom elements.
    // https://w3c.github.io/webcomponents/spec/custom/#custom-elements-core-concepts

    case 'annotation-xml':
    case 'color-profile':
    case 'font-face':
    case 'font-face-src':
    case 'font-face-uri':
    case 'font-face-format':
    case 'font-face-name':
    case 'missing-glyph':
      {
        break;
      }
    // Preamble start tags

    case 'head':
      return pushStartHead(target, props, renderState, formatContext.insertionMode);

    case 'html':
      {
        return pushStartHtml(target, props, renderState, formatContext.insertionMode);
      }

    default:
      {
        if (type.indexOf('-') !== -1) {
          // Custom element
          return pushStartCustomElement(target, props, type);
        }
      }
  } // Generic element


  return pushStartGenericElement(target, props, type);
}
const endTagCache = new Map();

function endChunkForTag(tag) {
  let chunk = endTagCache.get(tag);

  if (chunk === undefined) {
    chunk = stringToPrecomputedChunk('</' + tag + '>');
    endTagCache.set(tag, chunk);
  }

  return chunk;
}

function pushEndInstance(target, type, props, resumableState, formatContext) {
  switch (type) {
    // When float is on we expect title and script tags to always be pushed in
    // a unit and never return children. when we end up pushing the end tag we
    // want to ensure there is no extra closing tag pushed
    case 'title':
    case 'style':
    case 'script':
    // Omitted close tags
    // TODO: Instead of repeating this switch we could try to pass a flag from above.
    // That would require returning a tuple. Which might be ok if it gets inlined.

    case 'area':
    case 'base':
    case 'br':
    case 'col':
    case 'embed':
    case 'hr':
    case 'img':
    case 'input':
    case 'keygen':
    case 'link':
    case 'meta':
    case 'param':
    case 'source':
    case 'track':
    case 'wbr':
      {
        // No close tag needed.
        return;
      }
    // Postamble end tags
    // When float is enabled we omit the end tags for body and html when
    // they represent the Document.body and Document.documentElement Nodes.
    // This is so we can withhold them until the postamble when we know
    // we won't emit any more tags

    case 'body':
      {
        if (formatContext.insertionMode <= HTML_HTML_MODE) {
          resumableState.hasBody = true;
          return;
        }

        break;
      }

    case 'html':
      if (formatContext.insertionMode === ROOT_HTML_MODE) {
        resumableState.hasHtml = true;
        return;
      }

      break;
  }

  target.push(endChunkForTag(type));
}

function writeBootstrap(destination, renderState) {
  const bootstrapChunks = renderState.bootstrapChunks;
  let i = 0;

  for (; i < bootstrapChunks.length - 1; i++) {
    writeChunk(destination, bootstrapChunks[i]);
  }

  if (i < bootstrapChunks.length) {
    const lastChunk = bootstrapChunks[i];
    bootstrapChunks.length = 0;
    return writeChunkAndReturn(destination, lastChunk);
  }

  return true;
}

function writeCompletedRoot(destination, renderState) {
  return writeBootstrap(destination, renderState);
} // Structural Nodes
// A placeholder is a node inside a hidden partial tree that can be filled in later, but before
// display. It's never visible to users. We use the template tag because it can be used in every
// type of parent. <script> tags also work in every other tag except <colgroup>.

const placeholder1 = stringToPrecomputedChunk('<template id="');
const placeholder2 = stringToPrecomputedChunk('"></template>');
function writePlaceholder(destination, renderState, id) {
  writeChunk(destination, placeholder1);
  writeChunk(destination, renderState.placeholderPrefix);
  const formattedID = stringToChunk(id.toString(16));
  writeChunk(destination, formattedID);
  return writeChunkAndReturn(destination, placeholder2);
} // Suspense boundaries are encoded as comments.

const startCompletedSuspenseBoundary = stringToPrecomputedChunk('<!--$-->');
const startPendingSuspenseBoundary1 = stringToPrecomputedChunk('<!--$?--><template id="');
const startPendingSuspenseBoundary2 = stringToPrecomputedChunk('"></template>');
const startClientRenderedSuspenseBoundary = stringToPrecomputedChunk('<!--$!-->');
const endSuspenseBoundary = stringToPrecomputedChunk('<!--/$-->');
const clientRenderedSuspenseBoundaryError1 = stringToPrecomputedChunk('<template');
const clientRenderedSuspenseBoundaryErrorAttrInterstitial = stringToPrecomputedChunk('"');
const clientRenderedSuspenseBoundaryError1A = stringToPrecomputedChunk(' data-dgst="');
const clientRenderedSuspenseBoundaryError2 = stringToPrecomputedChunk('></template>');
function writeStartCompletedSuspenseBoundary$1(destination, renderState) {
  return writeChunkAndReturn(destination, startCompletedSuspenseBoundary);
}
function writeStartPendingSuspenseBoundary(destination, renderState, id) {
  writeChunk(destination, startPendingSuspenseBoundary1);

  if (id === null) {
    throw Error(formatProdErrorMessage(395));
  }

  writeChunk(destination, renderState.boundaryPrefix);
  writeChunk(destination, stringToChunk(id.toString(16)));
  return writeChunkAndReturn(destination, startPendingSuspenseBoundary2);
}
function writeStartClientRenderedSuspenseBoundary$1(destination, renderState, errorDigest, errorMesssage, errorComponentStack) {
  let result;
  result = writeChunkAndReturn(destination, startClientRenderedSuspenseBoundary);
  writeChunk(destination, clientRenderedSuspenseBoundaryError1);

  if (errorDigest) {
    writeChunk(destination, clientRenderedSuspenseBoundaryError1A);
    writeChunk(destination, stringToChunk(escapeTextForBrowser(errorDigest)));
    writeChunk(destination, clientRenderedSuspenseBoundaryErrorAttrInterstitial);
  }

  result = writeChunkAndReturn(destination, clientRenderedSuspenseBoundaryError2);
  return result;
}
function writeEndCompletedSuspenseBoundary$1(destination, renderState) {
  return writeChunkAndReturn(destination, endSuspenseBoundary);
}
function writeEndPendingSuspenseBoundary(destination, renderState) {
  return writeChunkAndReturn(destination, endSuspenseBoundary);
}
function writeEndClientRenderedSuspenseBoundary$1(destination, renderState) {
  return writeChunkAndReturn(destination, endSuspenseBoundary);
}
const startSegmentHTML = stringToPrecomputedChunk('<div hidden id="');
const startSegmentHTML2 = stringToPrecomputedChunk('">');
const endSegmentHTML = stringToPrecomputedChunk('</div>');
const startSegmentSVG = stringToPrecomputedChunk('<svg aria-hidden="true" style="display:none" id="');
const startSegmentSVG2 = stringToPrecomputedChunk('">');
const endSegmentSVG = stringToPrecomputedChunk('</svg>');
const startSegmentMathML = stringToPrecomputedChunk('<math aria-hidden="true" style="display:none" id="');
const startSegmentMathML2 = stringToPrecomputedChunk('">');
const endSegmentMathML = stringToPrecomputedChunk('</math>');
const startSegmentTable = stringToPrecomputedChunk('<table hidden id="');
const startSegmentTable2 = stringToPrecomputedChunk('">');
const endSegmentTable = stringToPrecomputedChunk('</table>');
const startSegmentTableBody = stringToPrecomputedChunk('<table hidden><tbody id="');
const startSegmentTableBody2 = stringToPrecomputedChunk('">');
const endSegmentTableBody = stringToPrecomputedChunk('</tbody></table>');
const startSegmentTableRow = stringToPrecomputedChunk('<table hidden><tr id="');
const startSegmentTableRow2 = stringToPrecomputedChunk('">');
const endSegmentTableRow = stringToPrecomputedChunk('</tr></table>');
const startSegmentColGroup = stringToPrecomputedChunk('<table hidden><colgroup id="');
const startSegmentColGroup2 = stringToPrecomputedChunk('">');
const endSegmentColGroup = stringToPrecomputedChunk('</colgroup></table>');
function writeStartSegment(destination, renderState, formatContext, id) {
  switch (formatContext.insertionMode) {
    case ROOT_HTML_MODE:
    case HTML_HTML_MODE:
    case HTML_MODE:
      {
        writeChunk(destination, startSegmentHTML);
        writeChunk(destination, renderState.segmentPrefix);
        writeChunk(destination, stringToChunk(id.toString(16)));
        return writeChunkAndReturn(destination, startSegmentHTML2);
      }

    case SVG_MODE:
      {
        writeChunk(destination, startSegmentSVG);
        writeChunk(destination, renderState.segmentPrefix);
        writeChunk(destination, stringToChunk(id.toString(16)));
        return writeChunkAndReturn(destination, startSegmentSVG2);
      }

    case MATHML_MODE:
      {
        writeChunk(destination, startSegmentMathML);
        writeChunk(destination, renderState.segmentPrefix);
        writeChunk(destination, stringToChunk(id.toString(16)));
        return writeChunkAndReturn(destination, startSegmentMathML2);
      }

    case HTML_TABLE_MODE:
      {
        writeChunk(destination, startSegmentTable);
        writeChunk(destination, renderState.segmentPrefix);
        writeChunk(destination, stringToChunk(id.toString(16)));
        return writeChunkAndReturn(destination, startSegmentTable2);
      }
    // TODO: For the rest of these, there will be extra wrapper nodes that never
    // get deleted from the document. We need to delete the table too as part
    // of the injected scripts. They are invisible though so it's not too terrible
    // and it's kind of an edge case to suspend in a table. Totally supported though.

    case HTML_TABLE_BODY_MODE:
      {
        writeChunk(destination, startSegmentTableBody);
        writeChunk(destination, renderState.segmentPrefix);
        writeChunk(destination, stringToChunk(id.toString(16)));
        return writeChunkAndReturn(destination, startSegmentTableBody2);
      }

    case HTML_TABLE_ROW_MODE:
      {
        writeChunk(destination, startSegmentTableRow);
        writeChunk(destination, renderState.segmentPrefix);
        writeChunk(destination, stringToChunk(id.toString(16)));
        return writeChunkAndReturn(destination, startSegmentTableRow2);
      }

    case HTML_COLGROUP_MODE:
      {
        writeChunk(destination, startSegmentColGroup);
        writeChunk(destination, renderState.segmentPrefix);
        writeChunk(destination, stringToChunk(id.toString(16)));
        return writeChunkAndReturn(destination, startSegmentColGroup2);
      }

    default:
      {
        throw Error(formatProdErrorMessage(397));
      }
  }
}
function writeEndSegment(destination, formatContext) {
  switch (formatContext.insertionMode) {
    case ROOT_HTML_MODE:
    case HTML_HTML_MODE:
    case HTML_MODE:
      {
        return writeChunkAndReturn(destination, endSegmentHTML);
      }

    case SVG_MODE:
      {
        return writeChunkAndReturn(destination, endSegmentSVG);
      }

    case MATHML_MODE:
      {
        return writeChunkAndReturn(destination, endSegmentMathML);
      }

    case HTML_TABLE_MODE:
      {
        return writeChunkAndReturn(destination, endSegmentTable);
      }

    case HTML_TABLE_BODY_MODE:
      {
        return writeChunkAndReturn(destination, endSegmentTableBody);
      }

    case HTML_TABLE_ROW_MODE:
      {
        return writeChunkAndReturn(destination, endSegmentTableRow);
      }

    case HTML_COLGROUP_MODE:
      {
        return writeChunkAndReturn(destination, endSegmentColGroup);
      }

    default:
      {
        throw Error(formatProdErrorMessage(397));
      }
  }
}
const completeSegmentScript1Full = stringToPrecomputedChunk(completeSegment + '$RS("');
const completeSegmentScript1Partial = stringToPrecomputedChunk('$RS("');
const completeSegmentScript2 = stringToPrecomputedChunk('","');
const completeSegmentScriptEnd = stringToPrecomputedChunk('")</script>');
const completeSegmentData1 = stringToPrecomputedChunk('<template data-rsi="" data-sid="');
const completeSegmentData2 = stringToPrecomputedChunk('" data-pid="');
const completeSegmentDataEnd = dataElementQuotedEnd;
function writeCompletedSegmentInstruction(destination, resumableState, renderState, contentSegmentID) {
  const scriptFormat = resumableState.streamingFormat === ScriptStreamingFormat;

  if (scriptFormat) {
    writeChunk(destination, renderState.startInlineScript);

    if ((resumableState.instructions & SentCompleteSegmentFunction) === NothingSent) {
      // The first time we write this, we'll need to include the full implementation.
      resumableState.instructions |= SentCompleteSegmentFunction;
      writeChunk(destination, completeSegmentScript1Full);
    } else {
      // Future calls can just reuse the same function.
      writeChunk(destination, completeSegmentScript1Partial);
    }
  } else {
    writeChunk(destination, completeSegmentData1);
  } // Write function arguments, which are string literals


  writeChunk(destination, renderState.segmentPrefix);
  const formattedID = stringToChunk(contentSegmentID.toString(16));
  writeChunk(destination, formattedID);

  if (scriptFormat) {
    writeChunk(destination, completeSegmentScript2);
  } else {
    writeChunk(destination, completeSegmentData2);
  }

  writeChunk(destination, renderState.placeholderPrefix);
  writeChunk(destination, formattedID);

  if (scriptFormat) {
    return writeChunkAndReturn(destination, completeSegmentScriptEnd);
  } else {
    return writeChunkAndReturn(destination, completeSegmentDataEnd);
  }
}
const completeBoundaryScript1Full = stringToPrecomputedChunk(completeBoundary + '$RC("');
const completeBoundaryScript1Partial = stringToPrecomputedChunk('$RC("');
const completeBoundaryWithStylesScript1FullBoth = stringToPrecomputedChunk(completeBoundary + completeBoundaryWithStyles + '$RR("');
const completeBoundaryWithStylesScript1FullPartial = stringToPrecomputedChunk(completeBoundaryWithStyles + '$RR("');
const completeBoundaryWithStylesScript1Partial = stringToPrecomputedChunk('$RR("');
const completeBoundaryScript2 = stringToPrecomputedChunk('","');
const completeBoundaryScript3a = stringToPrecomputedChunk('",');
const completeBoundaryScript3b = stringToPrecomputedChunk('"');
const completeBoundaryScriptEnd = stringToPrecomputedChunk(')</script>');
const completeBoundaryData1 = stringToPrecomputedChunk('<template data-rci="" data-bid="');
const completeBoundaryWithStylesData1 = stringToPrecomputedChunk('<template data-rri="" data-bid="');
const completeBoundaryData2 = stringToPrecomputedChunk('" data-sid="');
const completeBoundaryData3a = stringToPrecomputedChunk('" data-sty="');
const completeBoundaryDataEnd = dataElementQuotedEnd;
function writeCompletedBoundaryInstruction(destination, resumableState, renderState, id, hoistableState) {
  let requiresStyleInsertion;

  {
    requiresStyleInsertion = renderState.stylesToHoist; // If necessary stylesheets will be flushed with this instruction.
    // Any style tags not yet hoisted in the Document will also be hoisted.
    // We reset this state since after this instruction executes all styles
    // up to this point will have been hoisted

    renderState.stylesToHoist = false;
  }

  const scriptFormat = resumableState.streamingFormat === ScriptStreamingFormat;

  if (scriptFormat) {
    writeChunk(destination, renderState.startInlineScript);

    if (requiresStyleInsertion) {
      if ((resumableState.instructions & SentCompleteBoundaryFunction) === NothingSent) {
        resumableState.instructions |= SentStyleInsertionFunction | SentCompleteBoundaryFunction;
        writeChunk(destination, completeBoundaryWithStylesScript1FullBoth);
      } else if ((resumableState.instructions & SentStyleInsertionFunction) === NothingSent) {
        resumableState.instructions |= SentStyleInsertionFunction;
        writeChunk(destination, completeBoundaryWithStylesScript1FullPartial);
      } else {
        writeChunk(destination, completeBoundaryWithStylesScript1Partial);
      }
    } else {
      if ((resumableState.instructions & SentCompleteBoundaryFunction) === NothingSent) {
        resumableState.instructions |= SentCompleteBoundaryFunction;
        writeChunk(destination, completeBoundaryScript1Full);
      } else {
        writeChunk(destination, completeBoundaryScript1Partial);
      }
    }
  } else {
    if (requiresStyleInsertion) {
      writeChunk(destination, completeBoundaryWithStylesData1);
    } else {
      writeChunk(destination, completeBoundaryData1);
    }
  }

  const idChunk = stringToChunk(id.toString(16));
  writeChunk(destination, renderState.boundaryPrefix);
  writeChunk(destination, idChunk); // Write function arguments, which are string and array literals

  if (scriptFormat) {
    writeChunk(destination, completeBoundaryScript2);
  } else {
    writeChunk(destination, completeBoundaryData2);
  }

  writeChunk(destination, renderState.segmentPrefix);
  writeChunk(destination, idChunk);

  if (requiresStyleInsertion) {
    // Script and data writers must format this differently:
    //  - script writer emits an array literal, whose string elements are
    //    escaped for javascript  e.g. ["A", "B"]
    //  - data writer emits a string literal, which is escaped as html
    //    e.g. [&#34;A&#34;, &#34;B&#34;]
    if (scriptFormat) {
      writeChunk(destination, completeBoundaryScript3a); // hoistableState encodes an array literal

      writeStyleResourceDependenciesInJS(destination, hoistableState);
    } else {
      writeChunk(destination, completeBoundaryData3a);
      writeStyleResourceDependenciesInAttr(destination, hoistableState);
    }
  } else {
    if (scriptFormat) {
      writeChunk(destination, completeBoundaryScript3b);
    }
  }

  let writeMore;

  if (scriptFormat) {
    writeMore = writeChunkAndReturn(destination, completeBoundaryScriptEnd);
  } else {
    writeMore = writeChunkAndReturn(destination, completeBoundaryDataEnd);
  }

  return writeBootstrap(destination, renderState) && writeMore;
}
const clientRenderScript1Full = stringToPrecomputedChunk(clientRenderBoundary + ';$RX("');
const clientRenderScript1Partial = stringToPrecomputedChunk('$RX("');
const clientRenderScript1A = stringToPrecomputedChunk('"');
const clientRenderErrorScriptArgInterstitial = stringToPrecomputedChunk(',');
const clientRenderScriptEnd = stringToPrecomputedChunk(')</script>');
const clientRenderData1 = stringToPrecomputedChunk('<template data-rxi="" data-bid="');
const clientRenderData2 = stringToPrecomputedChunk('" data-dgst="');
const clientRenderData3 = stringToPrecomputedChunk('" data-msg="');
const clientRenderData4 = stringToPrecomputedChunk('" data-stck="');
const clientRenderDataEnd = dataElementQuotedEnd;
function writeClientRenderBoundaryInstruction(destination, resumableState, renderState, id, errorDigest, errorMessage, errorComponentStack) {
  const scriptFormat = resumableState.streamingFormat === ScriptStreamingFormat;

  if (scriptFormat) {
    writeChunk(destination, renderState.startInlineScript);

    if ((resumableState.instructions & SentClientRenderFunction) === NothingSent) {
      // The first time we write this, we'll need to include the full implementation.
      resumableState.instructions |= SentClientRenderFunction;
      writeChunk(destination, clientRenderScript1Full);
    } else {
      // Future calls can just reuse the same function.
      writeChunk(destination, clientRenderScript1Partial);
    }
  } else {
    // <template data-rxi="" data-bid="
    writeChunk(destination, clientRenderData1);
  }

  writeChunk(destination, renderState.boundaryPrefix);
  writeChunk(destination, stringToChunk(id.toString(16)));

  if (scriptFormat) {
    // " needs to be inserted for scripts, since ArgInterstitual does not contain
    // leading or trailing quotes
    writeChunk(destination, clientRenderScript1A);
  }

  if (errorDigest || errorMessage || errorComponentStack) {
    if (scriptFormat) {
      // ,"JSONString"
      writeChunk(destination, clientRenderErrorScriptArgInterstitial);
      writeChunk(destination, stringToChunk(escapeJSStringsForInstructionScripts(errorDigest || '')));
    } else {
      // " data-dgst="HTMLString
      writeChunk(destination, clientRenderData2);
      writeChunk(destination, stringToChunk(escapeTextForBrowser(errorDigest || '')));
    }
  }

  if (errorMessage || errorComponentStack) {
    if (scriptFormat) {
      // ,"JSONString"
      writeChunk(destination, clientRenderErrorScriptArgInterstitial);
      writeChunk(destination, stringToChunk(escapeJSStringsForInstructionScripts(errorMessage || '')));
    } else {
      // " data-msg="HTMLString
      writeChunk(destination, clientRenderData3);
      writeChunk(destination, stringToChunk(escapeTextForBrowser(errorMessage || '')));
    }
  }

  if (errorComponentStack) {
    // ,"JSONString"
    if (scriptFormat) {
      writeChunk(destination, clientRenderErrorScriptArgInterstitial);
      writeChunk(destination, stringToChunk(escapeJSStringsForInstructionScripts(errorComponentStack)));
    } else {
      // " data-stck="HTMLString
      writeChunk(destination, clientRenderData4);
      writeChunk(destination, stringToChunk(escapeTextForBrowser(errorComponentStack)));
    }
  }

  if (scriptFormat) {
    // ></script>
    return writeChunkAndReturn(destination, clientRenderScriptEnd);
  } else {
    // "></template>
    return writeChunkAndReturn(destination, clientRenderDataEnd);
  }
}
const regexForJSStringsInInstructionScripts = /[<\u2028\u2029]/g;

function escapeJSStringsForInstructionScripts(input) {
  const escaped = JSON.stringify(input);
  return escaped.replace(regexForJSStringsInInstructionScripts, match => {
    switch (match) {
      // santizing breaking out of strings and script tags
      case '<':
        return '\\u003c';

      case '\u2028':
        return '\\u2028';

      case '\u2029':
        return '\\u2029';

      default:
        {
          // eslint-disable-next-line react-internal/prod-error-codes
          throw new Error('escapeJSStringsForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React');
        }
    }
  });
}

const regexForJSStringsInScripts = /[&><\u2028\u2029]/g;

function escapeJSObjectForInstructionScripts(input) {
  const escaped = JSON.stringify(input);
  return escaped.replace(regexForJSStringsInScripts, match => {
    switch (match) {
      // santizing breaking out of strings and script tags
      case '&':
        return '\\u0026';

      case '>':
        return '\\u003e';

      case '<':
        return '\\u003c';

      case '\u2028':
        return '\\u2028';

      case '\u2029':
        return '\\u2029';

      default:
        {
          // eslint-disable-next-line react-internal/prod-error-codes
          throw new Error('escapeJSObjectForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React');
        }
    }
  });
}

const lateStyleTagResourceOpen1 = stringToPrecomputedChunk('<style media="not all" data-precedence="');
const lateStyleTagResourceOpen2 = stringToPrecomputedChunk('" data-href="');
const lateStyleTagResourceOpen3 = stringToPrecomputedChunk('">');
const lateStyleTagTemplateClose = stringToPrecomputedChunk('</style>'); // Tracks whether the boundary currently flushing is flushign style tags or has any
// stylesheet dependencies not flushed in the Preamble.

let currentlyRenderingBoundaryHasStylesToHoist = false; // Acts as a return value for the forEach execution of style tag flushing.

let destinationHasCapacity = true;

function flushStyleTagsLateForBoundary(styleQueue) {
  const rules = styleQueue.rules;
  const hrefs = styleQueue.hrefs;

  let i = 0;

  if (hrefs.length) {
    writeChunk(this, lateStyleTagResourceOpen1);
    writeChunk(this, styleQueue.precedence);
    writeChunk(this, lateStyleTagResourceOpen2);

    for (; i < hrefs.length - 1; i++) {
      writeChunk(this, hrefs[i]);
      writeChunk(this, spaceSeparator);
    }

    writeChunk(this, hrefs[i]);
    writeChunk(this, lateStyleTagResourceOpen3);

    for (i = 0; i < rules.length; i++) {
      writeChunk(this, rules[i]);
    }

    destinationHasCapacity = writeChunkAndReturn(this, lateStyleTagTemplateClose); // We wrote style tags for this boundary and we may need to emit a script
    // to hoist them.

    currentlyRenderingBoundaryHasStylesToHoist = true; // style resources can flush continuously since more rules may be written into
    // them with new hrefs. Instead of marking it flushed, we simply reset the chunks
    // and hrefs

    rules.length = 0;
    hrefs.length = 0;
  }
}

function hasStylesToHoist(stylesheet) {
  // We need to reveal boundaries with styles whenever a stylesheet it depends on is either
  // not flushed or flushed after the preamble (shell).
  if (stylesheet.state !== PREAMBLE) {
    currentlyRenderingBoundaryHasStylesToHoist = true;
    return true;
  }

  return false;
}

function writeHoistablesForBoundary(destination, hoistableState, renderState) {
  // Reset these on each invocation, they are only safe to read in this function
  currentlyRenderingBoundaryHasStylesToHoist = false;
  destinationHasCapacity = true; // Flush style tags for each precedence this boundary depends on

  hoistableState.styles.forEach(flushStyleTagsLateForBoundary, destination); // Determine if this boundary has stylesheets that need to be awaited upon completion

  hoistableState.stylesheets.forEach(hasStylesToHoist); // We don't actually want to flush any hoistables until the boundary is complete so we omit
  // any further writing here. This is becuase unlike Resources, Hoistable Elements act more like
  // regular elements, each rendered element has a unique representation in the DOM. We don't want
  // these elements to appear in the DOM early, before the boundary has actually completed

  if (currentlyRenderingBoundaryHasStylesToHoist) {
    renderState.stylesToHoist = true;
  }

  return destinationHasCapacity;
}

function flushResource(resource) {
  for (let i = 0; i < resource.length; i++) {
    writeChunk(this, resource[i]);
  }

  resource.length = 0;
}

const stylesheetFlushingQueue = [];

function flushStyleInPreamble(stylesheet, key, map) {
  // We still need to encode stylesheet chunks
  // because unlike most Hoistables and Resources we do not eagerly encode
  // them during render. This is because if we flush late we have to send a
  // different encoding and we don't want to encode multiple times
  pushLinkImpl(stylesheetFlushingQueue, stylesheet.props);

  for (let i = 0; i < stylesheetFlushingQueue.length; i++) {
    writeChunk(this, stylesheetFlushingQueue[i]);
  }

  stylesheetFlushingQueue.length = 0;
  stylesheet.state = PREAMBLE;
}

const styleTagResourceOpen1 = stringToPrecomputedChunk('<style data-precedence="');
const styleTagResourceOpen2 = stringToPrecomputedChunk('" data-href="');
const spaceSeparator = stringToPrecomputedChunk(' ');
const styleTagResourceOpen3 = stringToPrecomputedChunk('">');
const styleTagResourceClose = stringToPrecomputedChunk('</style>');

function flushStylesInPreamble(styleQueue, precedence) {
  const hasStylesheets = styleQueue.sheets.size > 0;
  styleQueue.sheets.forEach(flushStyleInPreamble, this);
  styleQueue.sheets.clear();
  const rules = styleQueue.rules;
  const hrefs = styleQueue.hrefs; // If we don't emit any stylesheets at this precedence we still need to maintain the precedence
  // order so even if there are no rules for style tags at this precedence we emit an empty style
  // tag with the data-precedence attribute

  if (!hasStylesheets || hrefs.length) {
    writeChunk(this, styleTagResourceOpen1);
    writeChunk(this, styleQueue.precedence);
    let i = 0;

    if (hrefs.length) {
      writeChunk(this, styleTagResourceOpen2);

      for (; i < hrefs.length - 1; i++) {
        writeChunk(this, hrefs[i]);
        writeChunk(this, spaceSeparator);
      }

      writeChunk(this, hrefs[i]);
    }

    writeChunk(this, styleTagResourceOpen3);

    for (i = 0; i < rules.length; i++) {
      writeChunk(this, rules[i]);
    }

    writeChunk(this, styleTagResourceClose); // style resources can flush continuously since more rules may be written into
    // them with new hrefs. Instead of marking it flushed, we simply reset the chunks
    // and hrefs

    rules.length = 0;
    hrefs.length = 0;
  }
}

function preloadLateStyle(stylesheet) {
  if (stylesheet.state === PENDING$1) {
    stylesheet.state = PRELOADED;
    const preloadProps = preloadAsStylePropsFromProps(stylesheet.props.href, stylesheet.props);
    pushLinkImpl(stylesheetFlushingQueue, preloadProps);

    for (let i = 0; i < stylesheetFlushingQueue.length; i++) {
      writeChunk(this, stylesheetFlushingQueue[i]);
    }

    stylesheetFlushingQueue.length = 0;
  }
}

function preloadLateStyles(styleQueue) {
  styleQueue.sheets.forEach(preloadLateStyle, this);
  styleQueue.sheets.clear();
} // We don't bother reporting backpressure at the moment because we expect to
// flush the entire preamble in a single pass. This probably should be modified
// in the future to be backpressure sensitive but that requires a larger refactor
// of the flushing code in Fizz.


function writePreamble(destination, resumableState, renderState, willFlushAllSegments) {
  // This function must be called exactly once on every request
  if (!willFlushAllSegments && renderState.externalRuntimeScript) {
    // If the root segment is incomplete due to suspended tasks
    // (e.g. willFlushAllSegments = false) and we are using data
    // streaming format, ensure the external runtime is sent.
    // (User code could choose to send this even earlier by calling
    //  preinit(...), if they know they will suspend).
    const _renderState$external = renderState.externalRuntimeScript,
          src = _renderState$external.src,
          chunks = _renderState$external.chunks;
    internalPreinitScript(resumableState, renderState, src, chunks);
  }

  const htmlChunks = renderState.htmlChunks;
  const headChunks = renderState.headChunks;
  let i = 0; // Emit open tags before Hoistables and Resources

  if (htmlChunks) {
    // We have an <html> to emit as part of the preamble
    for (i = 0; i < htmlChunks.length; i++) {
      writeChunk(destination, htmlChunks[i]);
    }

    if (headChunks) {
      for (i = 0; i < headChunks.length; i++) {
        writeChunk(destination, headChunks[i]);
      }
    } else {
      // We did not render a head but we emitted an <html> so we emit one now
      writeChunk(destination, startChunkForTag('head'));
      writeChunk(destination, endOfStartTag);
    }
  } else if (headChunks) {
    // We do not have an <html> but we do have a <head>
    for (i = 0; i < headChunks.length; i++) {
      writeChunk(destination, headChunks[i]);
    }
  } // Emit high priority Hoistables


  const charsetChunks = renderState.charsetChunks;

  for (i = 0; i < charsetChunks.length; i++) {
    writeChunk(destination, charsetChunks[i]);
  }

  charsetChunks.length = 0; // emit preconnect resources

  renderState.preconnects.forEach(flushResource, destination);
  renderState.preconnects.clear();
  const viewportChunks = renderState.viewportChunks;

  for (i = 0; i < viewportChunks.length; i++) {
    writeChunk(destination, viewportChunks[i]);
  }

  viewportChunks.length = 0;
  renderState.fontPreloads.forEach(flushResource, destination);
  renderState.fontPreloads.clear();
  renderState.highImagePreloads.forEach(flushResource, destination);
  renderState.highImagePreloads.clear(); // Flush unblocked stylesheets by precedence

  renderState.styles.forEach(flushStylesInPreamble, destination);
  const importMapChunks = renderState.importMapChunks;

  for (i = 0; i < importMapChunks.length; i++) {
    writeChunk(destination, importMapChunks[i]);
  }

  importMapChunks.length = 0;
  renderState.bootstrapScripts.forEach(flushResource, destination);
  renderState.scripts.forEach(flushResource, destination);
  renderState.scripts.clear();
  renderState.bulkPreloads.forEach(flushResource, destination);
  renderState.bulkPreloads.clear(); // Write embedding hoistableChunks

  const hoistableChunks = renderState.hoistableChunks;

  for (i = 0; i < hoistableChunks.length; i++) {
    writeChunk(destination, hoistableChunks[i]);
  }

  hoistableChunks.length = 0;

  if (htmlChunks && headChunks === null) {
    // we have an <html> but we inserted an implicit <head> tag. We need
    // to close it since the main content won't have it
    writeChunk(destination, endChunkForTag('head'));
  }
} // We don't bother reporting backpressure at the moment because we expect to
// flush the entire preamble in a single pass. This probably should be modified
// in the future to be backpressure sensitive but that requires a larger refactor
// of the flushing code in Fizz.

function writeHoistables(destination, resumableState, renderState) {
  let i = 0; // Emit high priority Hoistables
  // We omit charsetChunks because we have already sent the shell and if it wasn't
  // already sent it is too late now.

  const viewportChunks = renderState.viewportChunks;

  for (i = 0; i < viewportChunks.length; i++) {
    writeChunk(destination, viewportChunks[i]);
  }

  viewportChunks.length = 0;
  renderState.preconnects.forEach(flushResource, destination);
  renderState.preconnects.clear();
  renderState.fontPreloads.forEach(flushResource, destination);
  renderState.fontPreloads.clear();
  renderState.highImagePreloads.forEach(flushResource, destination);
  renderState.highImagePreloads.clear(); // Preload any stylesheets. these will emit in a render instruction that follows this
  // but we want to kick off preloading as soon as possible

  renderState.styles.forEach(preloadLateStyles, destination); // We only hoist importmaps that are configured through createResponse and that will
  // always flush in the preamble. Generally we don't expect people to render them as
  // tags when using React but if you do they are going to be treated like regular inline
  // scripts and flush after other hoistables which is problematic
  // bootstrap scripts should flush above script priority but these can only flush in the preamble
  // so we elide the code here for performance

  renderState.scripts.forEach(flushResource, destination);
  renderState.scripts.clear();
  renderState.bulkPreloads.forEach(flushResource, destination);
  renderState.bulkPreloads.clear(); // Write embedding hoistableChunks

  const hoistableChunks = renderState.hoistableChunks;

  for (i = 0; i < hoistableChunks.length; i++) {
    writeChunk(destination, hoistableChunks[i]);
  }

  hoistableChunks.length = 0;
}
function writePostamble(destination, resumableState) {
  if (resumableState.hasBody) {
    writeChunk(destination, endChunkForTag('body'));
  }

  if (resumableState.hasHtml) {
    writeChunk(destination, endChunkForTag('html'));
  }
}
const arrayFirstOpenBracket = stringToPrecomputedChunk('[');
const arraySubsequentOpenBracket = stringToPrecomputedChunk(',[');
const arrayInterstitial = stringToPrecomputedChunk(',');
const arrayCloseBracket = stringToPrecomputedChunk(']'); // This function writes a 2D array of strings to be embedded in javascript.
// E.g.
//  [["JS_escaped_string1", "JS_escaped_string2"]]

function writeStyleResourceDependenciesInJS(destination, hoistableState) {
  writeChunk(destination, arrayFirstOpenBracket);
  let nextArrayOpenBrackChunk = arrayFirstOpenBracket;
  hoistableState.stylesheets.forEach(resource => {
    if (resource.state === PREAMBLE) ; else if (resource.state === LATE) {
      // We only need to emit the href because this resource flushed in an earlier
      // boundary already which encoded the attributes necessary to construct
      // the resource instance on the client.
      writeChunk(destination, nextArrayOpenBrackChunk);
      writeStyleResourceDependencyHrefOnlyInJS(destination, resource.props.href);
      writeChunk(destination, arrayCloseBracket);
      nextArrayOpenBrackChunk = arraySubsequentOpenBracket;
    } else {
      // We need to emit the whole resource for insertion on the client
      writeChunk(destination, nextArrayOpenBrackChunk);
      writeStyleResourceDependencyInJS(destination, resource.props.href, resource.props['data-precedence'], resource.props);
      writeChunk(destination, arrayCloseBracket);
      nextArrayOpenBrackChunk = arraySubsequentOpenBracket;
      resource.state = LATE;
    }
  });
  writeChunk(destination, arrayCloseBracket);
}
/* Helper functions */


function writeStyleResourceDependencyHrefOnlyInJS(destination, href) {

  const coercedHref = '' + href;
  writeChunk(destination, stringToChunk(escapeJSObjectForInstructionScripts(coercedHref)));
}

function writeStyleResourceDependencyInJS(destination, href, precedence, props) {
  // eslint-disable-next-line react-internal/safe-string-coercion
  const coercedHref = sanitizeURL('' + href);
  writeChunk(destination, stringToChunk(escapeJSObjectForInstructionScripts(coercedHref)));

  const coercedPrecedence = '' + precedence;
  writeChunk(destination, arrayInterstitial);
  writeChunk(destination, stringToChunk(escapeJSObjectForInstructionScripts(coercedPrecedence)));

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'href':
        case 'rel':
        case 'precedence':
        case 'data-precedence':
          {
            break;
          }

        case 'children':
        case 'dangerouslySetInnerHTML':
          throw Error(formatProdErrorMessage(399, 'link'));

        default:
          writeStyleResourceAttributeInJS(destination, propKey, propValue);
          break;
      }
    }
  }

  return null;
}

function writeStyleResourceAttributeInJS(destination, name, value) // not null or undefined
{
  let attributeName = name.toLowerCase();
  let attributeValue;

  switch (typeof value) {
    case 'function':
    case 'symbol':
      return;
  }

  switch (name) {
    // Reserved names
    case 'innerHTML':
    case 'dangerouslySetInnerHTML':
    case 'suppressContentEditableWarning':
    case 'suppressHydrationWarning':
    case 'style':
    case 'ref':
      // Ignored
      return;
    // Attribute renames

    case 'className':
      {
        attributeName = 'class';

        attributeValue = '' + value;
        break;
      }
    // Booleans

    case 'hidden':
      {
        if (value === false) {
          return;
        }

        attributeValue = '';
        break;
      }
    // Santized URLs

    case 'src':
    case 'href':
      {
        value = sanitizeURL(value);

        attributeValue = '' + value;
        break;
      }

    default:
      {
        if ( // unrecognized event handlers are not SSR'd and we (apparently)
        // use on* as hueristic for these handler props
        name.length > 2 && (name[0] === 'o' || name[0] === 'O') && (name[1] === 'n' || name[1] === 'N')) {
          return;
        }

        if (!isAttributeNameSafe(name)) {
          return;
        }

        attributeValue = '' + value;
      }
  }

  writeChunk(destination, arrayInterstitial);
  writeChunk(destination, stringToChunk(escapeJSObjectForInstructionScripts(attributeName)));
  writeChunk(destination, arrayInterstitial);
  writeChunk(destination, stringToChunk(escapeJSObjectForInstructionScripts(attributeValue)));
} // This function writes a 2D array of strings to be embedded in an attribute
// value and read with JSON.parse in ReactDOMServerExternalRuntime.js
// E.g.
//  [[&quot;JSON_escaped_string1&quot;, &quot;JSON_escaped_string2&quot;]]


function writeStyleResourceDependenciesInAttr(destination, hoistableState) {
  writeChunk(destination, arrayFirstOpenBracket);
  let nextArrayOpenBrackChunk = arrayFirstOpenBracket;
  hoistableState.stylesheets.forEach(resource => {
    if (resource.state === PREAMBLE) ; else if (resource.state === LATE) {
      // We only need to emit the href because this resource flushed in an earlier
      // boundary already which encoded the attributes necessary to construct
      // the resource instance on the client.
      writeChunk(destination, nextArrayOpenBrackChunk);
      writeStyleResourceDependencyHrefOnlyInAttr(destination, resource.props.href);
      writeChunk(destination, arrayCloseBracket);
      nextArrayOpenBrackChunk = arraySubsequentOpenBracket;
    } else {
      // We need to emit the whole resource for insertion on the client
      writeChunk(destination, nextArrayOpenBrackChunk);
      writeStyleResourceDependencyInAttr(destination, resource.props.href, resource.props['data-precedence'], resource.props);
      writeChunk(destination, arrayCloseBracket);
      nextArrayOpenBrackChunk = arraySubsequentOpenBracket;
      resource.state = LATE;
    }
  });
  writeChunk(destination, arrayCloseBracket);
}
/* Helper functions */


function writeStyleResourceDependencyHrefOnlyInAttr(destination, href) {

  const coercedHref = '' + href;
  writeChunk(destination, stringToChunk(escapeTextForBrowser(JSON.stringify(coercedHref))));
}

function writeStyleResourceDependencyInAttr(destination, href, precedence, props) {
  // eslint-disable-next-line react-internal/safe-string-coercion
  const coercedHref = sanitizeURL('' + href);
  writeChunk(destination, stringToChunk(escapeTextForBrowser(JSON.stringify(coercedHref))));

  const coercedPrecedence = '' + precedence;
  writeChunk(destination, arrayInterstitial);
  writeChunk(destination, stringToChunk(escapeTextForBrowser(JSON.stringify(coercedPrecedence))));

  for (const propKey in props) {
    if (hasOwnProperty.call(props, propKey)) {
      const propValue = props[propKey];

      if (propValue == null) {
        continue;
      }

      switch (propKey) {
        case 'href':
        case 'rel':
        case 'precedence':
        case 'data-precedence':
          {
            break;
          }

        case 'children':
        case 'dangerouslySetInnerHTML':
          throw Error(formatProdErrorMessage(399, 'link'));

        default:
          writeStyleResourceAttributeInAttr(destination, propKey, propValue);
          break;
      }
    }
  }

  return null;
}

function writeStyleResourceAttributeInAttr(destination, name, value) // not null or undefined
{
  let attributeName = name.toLowerCase();
  let attributeValue;

  switch (typeof value) {
    case 'function':
    case 'symbol':
      return;
  }

  switch (name) {
    // Reserved names
    case 'innerHTML':
    case 'dangerouslySetInnerHTML':
    case 'suppressContentEditableWarning':
    case 'suppressHydrationWarning':
    case 'style':
    case 'ref':
      // Ignored
      return;
    // Attribute renames

    case 'className':
      {
        attributeName = 'class';

        attributeValue = '' + value;
        break;
      }
    // Booleans

    case 'hidden':
      {
        if (value === false) {
          return;
        }

        attributeValue = '';
        break;
      }
    // Santized URLs

    case 'src':
    case 'href':
      {
        value = sanitizeURL(value);

        attributeValue = '' + value;
        break;
      }

    default:
      {
        if ( // unrecognized event handlers are not SSR'd and we (apparently)
        // use on* as hueristic for these handler props
        name.length > 2 && (name[0] === 'o' || name[0] === 'O') && (name[1] === 'n' || name[1] === 'N')) {
          return;
        }

        if (!isAttributeNameSafe(name)) {
          return;
        }

        attributeValue = '' + value;
      }
  }

  writeChunk(destination, arrayInterstitial);
  writeChunk(destination, stringToChunk(escapeTextForBrowser(JSON.stringify(attributeName))));
  writeChunk(destination, arrayInterstitial);
  writeChunk(destination, stringToChunk(escapeTextForBrowser(JSON.stringify(attributeValue))));
}
/**
 * Resources
 */


const PENDING$1 = 0;
const PRELOADED = 1;
const PREAMBLE = 2;
const LATE = 3;
function createHoistableState() {
  return {
    styles: new Set(),
    stylesheets: new Set()
  };
}

function getResourceKey(href) {
  return href;
}

function getImageResourceKey(href, imageSrcSet, imageSizes) {
  if (imageSrcSet) {
    return imageSrcSet + '\n' + (imageSizes || '');
  }

  return href;
}

function prefetchDNS(href) {

  const request = resolveRequest();

  if (!request) {
    // In async contexts we can sometimes resolve resources from AsyncLocalStorage. If we can't we can also
    // possibly get them from the stack if we are not in an async context. Since we were not able to resolve
    // the resources for this call in either case we opt to do nothing. We can consider making this a warning
    // but there may be times where calling a function outside of render is intentional (i.e. to warm up data
    // fetching) and we don't want to warn in those cases.
    return;
  }

  const resumableState = getResumableState(request);
  const renderState = getRenderState(request);

  if (typeof href === 'string' && href) {
    const key = getResourceKey(href);

    if (!resumableState.dnsResources.hasOwnProperty(key)) {
      resumableState.dnsResources[key] = EXISTS;
      const headers = renderState.headers;
      let header;

      if (headers && headers.remainingCapacity > 0 && ( // Compute the header since we might be able to fit it in the max length
      header = getPrefetchDNSAsHeader(href), // We always consume the header length since once we find one header that doesn't fit
      // we assume all the rest won't as well. This is to avoid getting into a situation
      // where we have a very small remaining capacity but no headers will ever fit and we end
      // up constantly trying to see if the next resource might make it. In the future we can
      // make this behavior different between render and prerender since in the latter case
      // we are less sensitive to the current requests runtime per and more sensitive to maximizing
      // headers.
      (headers.remainingCapacity -= header.length) >= 2)) {
        // Store this as resettable in case we are prerendering and postpone in the Shell
        renderState.resets.dns[key] = EXISTS;

        if (headers.preconnects) {
          headers.preconnects += ', ';
        } // $FlowFixMe[unsafe-addition]: we assign header during the if condition


        headers.preconnects += header;
      } else {
        // Encode as element
        const resource = [];
        pushLinkImpl(resource, {
          href,
          rel: 'dns-prefetch'
        });
        renderState.preconnects.add(resource);
      }
    }

    flushResources(request);
  }
}

function preconnect(href, crossOrigin) {

  const request = resolveRequest();

  if (!request) {
    // In async contexts we can sometimes resolve resources from AsyncLocalStorage. If we can't we can also
    // possibly get them from the stack if we are not in an async context. Since we were not able to resolve
    // the resources for this call in either case we opt to do nothing. We can consider making this a warning
    // but there may be times where calling a function outside of render is intentional (i.e. to warm up data
    // fetching) and we don't want to warn in those cases.
    return;
  }

  const resumableState = getResumableState(request);
  const renderState = getRenderState(request);

  if (typeof href === 'string' && href) {
    const bucket = crossOrigin === 'use-credentials' ? 'credentials' : typeof crossOrigin === 'string' ? 'anonymous' : 'default';
    const key = getResourceKey(href);

    if (!resumableState.connectResources[bucket].hasOwnProperty(key)) {
      resumableState.connectResources[bucket][key] = EXISTS;
      const headers = renderState.headers;
      let header;

      if (headers && headers.remainingCapacity > 0 && ( // Compute the header since we might be able to fit it in the max length
      header = getPreconnectAsHeader(href, crossOrigin), // We always consume the header length since once we find one header that doesn't fit
      // we assume all the rest won't as well. This is to avoid getting into a situation
      // where we have a very small remaining capacity but no headers will ever fit and we end
      // up constantly trying to see if the next resource might make it. In the future we can
      // make this behavior different between render and prerender since in the latter case
      // we are less sensitive to the current requests runtime per and more sensitive to maximizing
      // headers.
      (headers.remainingCapacity -= header.length) >= 2)) {
        // Store this in resettableState in case we are prerending and postpone in the Shell
        renderState.resets.connect[bucket][key] = EXISTS;

        if (headers.preconnects) {
          headers.preconnects += ', ';
        } // $FlowFixMe[unsafe-addition]: we assign header during the if condition


        headers.preconnects += header;
      } else {
        const resource = [];
        pushLinkImpl(resource, {
          rel: 'preconnect',
          href,
          crossOrigin
        });
        renderState.preconnects.add(resource);
      }
    }

    flushResources(request);
  }
}

function preload(href, as, options) {

  const request = resolveRequest();

  if (!request) {
    // In async contexts we can sometimes resolve resources from AsyncLocalStorage. If we can't we can also
    // possibly get them from the stack if we are not in an async context. Since we were not able to resolve
    // the resources for this call in either case we opt to do nothing. We can consider making this a warning
    // but there may be times where calling a function outside of render is intentional (i.e. to warm up data
    // fetching) and we don't want to warn in those cases.
    return;
  }

  const resumableState = getResumableState(request);
  const renderState = getRenderState(request);

  if (as && href) {
    switch (as) {
      case 'image':
        {
          let imageSrcSet, imageSizes, fetchPriority;

          if (options) {
            imageSrcSet = options.imageSrcSet;
            imageSizes = options.imageSizes;
            fetchPriority = options.fetchPriority;
          }

          const key = getImageResourceKey(href, imageSrcSet, imageSizes);

          if (resumableState.imageResources.hasOwnProperty(key)) {
            // we can return if we already have this resource
            return;
          }

          resumableState.imageResources[key] = PRELOAD_NO_CREDS;
          const headers = renderState.headers;
          let header;

          if (headers && headers.remainingCapacity > 0 && fetchPriority === 'high' && ( // Compute the header since we might be able to fit it in the max length
          header = getPreloadAsHeader(href, as, options), // We always consume the header length since once we find one header that doesn't fit
          // we assume all the rest won't as well. This is to avoid getting into a situation
          // where we have a very small remaining capacity but no headers will ever fit and we end
          // up constantly trying to see if the next resource might make it. In the future we can
          // make this behavior different between render and prerender since in the latter case
          // we are less sensitive to the current requests runtime per and more sensitive to maximizing
          // headers.
          (headers.remainingCapacity -= header.length) >= 2)) {
            // If we postpone in the shell we will still emit a preload as a header so we
            // track this to make sure we don't reset it.
            renderState.resets.image[key] = PRELOAD_NO_CREDS;

            if (headers.highImagePreloads) {
              headers.highImagePreloads += ', ';
            } // $FlowFixMe[unsafe-addition]: we assign header during the if condition


            headers.highImagePreloads += header;
          } else {
            // If we don't have headers to write to we have to encode as elements to flush in the head
            // When we have imageSrcSet the browser probably cannot load the right version from headers
            // (this should be verified by testing). For now we assume these need to go in the head
            // as elements even if headers are available.
            const resource = [];
            pushLinkImpl(resource, assign({
              rel: 'preload',
              // There is a bug in Safari where imageSrcSet is not respected on preload links
              // so we omit the href here if we have imageSrcSet b/c safari will load the wrong image.
              // This harms older browers that do not support imageSrcSet by making their preloads not work
              // but this population is shrinking fast and is already small so we accept this tradeoff.
              href: imageSrcSet ? undefined : href,
              as
            }, options));

            if (fetchPriority === 'high') {
              renderState.highImagePreloads.add(resource);
            } else {
              renderState.bulkPreloads.add(resource); // Stash the resource in case we need to promote it to higher priority
              // when an img tag is rendered

              renderState.preloads.images.set(key, resource);
            }
          }

          break;
        }

      case 'style':
        {
          const key = getResourceKey(href);

          if (resumableState.styleResources.hasOwnProperty(key)) {
            // we can return if we already have this resource
            return;
          }

          const resource = [];
          pushLinkImpl(resource, assign({
            rel: 'preload',
            href,
            as
          }, options));
          resumableState.styleResources[key] = options && (typeof options.crossOrigin === 'string' || typeof options.integrity === 'string') ? [options.crossOrigin, options.integrity] : PRELOAD_NO_CREDS;
          renderState.preloads.stylesheets.set(key, resource);
          renderState.bulkPreloads.add(resource);
          break;
        }

      case 'script':
        {
          const key = getResourceKey(href);

          if (resumableState.scriptResources.hasOwnProperty(key)) {
            // we can return if we already have this resource
            return;
          }

          const resource = [];
          renderState.preloads.scripts.set(key, resource);
          renderState.bulkPreloads.add(resource);
          pushLinkImpl(resource, assign({
            rel: 'preload',
            href,
            as
          }, options));
          resumableState.scriptResources[key] = options && (typeof options.crossOrigin === 'string' || typeof options.integrity === 'string') ? [options.crossOrigin, options.integrity] : PRELOAD_NO_CREDS;
          break;
        }

      default:
        {
          const key = getResourceKey(href);
          const hasAsType = resumableState.unknownResources.hasOwnProperty(as);
          let resources;

          if (hasAsType) {
            resources = resumableState.unknownResources[as];

            if (resources.hasOwnProperty(key)) {
              // we can return if we already have this resource
              return;
            }
          } else {
            resources = {};
            resumableState.unknownResources[as] = resources;
          }

          resources[key] = PRELOAD_NO_CREDS;
          const headers = renderState.headers;
          let header;

          if (headers && headers.remainingCapacity > 0 && as === 'font' && ( // We compute the header here because we might be able to fit it in the max length
          header = getPreloadAsHeader(href, as, options), // We always consume the header length since once we find one header that doesn't fit
          // we assume all the rest won't as well. This is to avoid getting into a situation
          // where we have a very small remaining capacity but no headers will ever fit and we end
          // up constantly trying to see if the next resource might make it. In the future we can
          // make this behavior different between render and prerender since in the latter case
          // we are less sensitive to the current requests runtime per and more sensitive to maximizing
          // headers.
          (headers.remainingCapacity -= header.length) >= 2)) {
            // If we postpone in the shell we will still emit this preload so we
            // track it here to prevent it from being reset.
            renderState.resets.font[key] = PRELOAD_NO_CREDS;

            if (headers.fontPreloads) {
              headers.fontPreloads += ', ';
            } // $FlowFixMe[unsafe-addition]: we assign header during the if condition


            headers.fontPreloads += header;
          } else {
            // We either don't have headers or we are preloading something that does
            // not warrant elevated priority so we encode as an element.
            const resource = [];

            const props = assign({
              rel: 'preload',
              href,
              as
            }, options);

            pushLinkImpl(resource, props);

            switch (as) {
              case 'font':
                renderState.fontPreloads.add(resource);
                break;
              // intentional fall through

              default:
                renderState.bulkPreloads.add(resource);
            }
          }
        }
    } // If we got this far we created a new resource


    flushResources(request);
  }
}

function preloadModule(href, options) {

  const request = resolveRequest();

  if (!request) {
    // In async contexts we can sometimes resolve resources from AsyncLocalStorage. If we can't we can also
    // possibly get them from the stack if we are not in an async context. Since we were not able to resolve
    // the resources for this call in either case we opt to do nothing. We can consider making this a warning
    // but there may be times where calling a function outside of render is intentional (i.e. to warm up data
    // fetching) and we don't want to warn in those cases.
    return;
  }

  const resumableState = getResumableState(request);
  const renderState = getRenderState(request);

  if (href) {
    const key = getResourceKey(href);
    const as = options && typeof options.as === 'string' ? options.as : 'script';
    let resource;

    switch (as) {
      case 'script':
        {
          if (resumableState.moduleScriptResources.hasOwnProperty(key)) {
            // we can return if we already have this resource
            return;
          }

          resource = [];
          resumableState.moduleScriptResources[key] = options && (typeof options.crossOrigin === 'string' || typeof options.integrity === 'string') ? [options.crossOrigin, options.integrity] : PRELOAD_NO_CREDS;
          renderState.preloads.moduleScripts.set(key, resource);
          break;
        }

      default:
        {
          const hasAsType = resumableState.moduleUnknownResources.hasOwnProperty(as);
          let resources;

          if (hasAsType) {
            resources = resumableState.unknownResources[as];

            if (resources.hasOwnProperty(key)) {
              // we can return if we already have this resource
              return;
            }
          } else {
            resources = {};
            resumableState.moduleUnknownResources[as] = resources;
          }

          resource = [];
          resources[key] = PRELOAD_NO_CREDS;
        }
    }

    pushLinkImpl(resource, assign({
      rel: 'modulepreload',
      href
    }, options));
    renderState.bulkPreloads.add(resource); // If we got this far we created a new resource

    flushResources(request);
  }
}

function preinitStyle(href, precedence, options) {

  const request = resolveRequest();

  if (!request) {
    // In async contexts we can sometimes resolve resources from AsyncLocalStorage. If we can't we can also
    // possibly get them from the stack if we are not in an async context. Since we were not able to resolve
    // the resources for this call in either case we opt to do nothing. We can consider making this a warning
    // but there may be times where calling a function outside of render is intentional (i.e. to warm up data
    // fetching) and we don't want to warn in those cases.
    return;
  }

  const resumableState = getResumableState(request);
  const renderState = getRenderState(request);

  if (href) {
    precedence = precedence || 'default';
    const key = getResourceKey(href);
    let styleQueue = renderState.styles.get(precedence);
    const hasKey = resumableState.styleResources.hasOwnProperty(key);
    const resourceState = hasKey ? resumableState.styleResources[key] : undefined;

    if (resourceState !== EXISTS) {
      // We are going to create this resource now so it is marked as Exists
      resumableState.styleResources[key] = EXISTS; // If this is the first time we've encountered this precedence we need
      // to create a StyleQueue

      if (!styleQueue) {
        styleQueue = {
          precedence: stringToChunk(escapeTextForBrowser(precedence)),
          rules: [],
          hrefs: [],
          sheets: new Map()
        };
        renderState.styles.set(precedence, styleQueue);
      }

      const resource = {
        state: PENDING$1,
        props: assign({
          rel: 'stylesheet',
          href,
          'data-precedence': precedence
        }, options)
      };

      if (resourceState) {
        // When resourceState is truty it is a Preload state. We cast it for clarity
        const preloadState = resourceState;

        if (preloadState.length === 2) {
          adoptPreloadCredentials(resource.props, preloadState);
        }

        const preloadResource = renderState.preloads.stylesheets.get(key);

        if (preloadResource && preloadResource.length > 0) {
          // The Preload for this resource was created in this render pass and has not flushed yet so
          // we need to clear it to avoid it flushing.
          preloadResource.length = 0;
        } else {
          // Either the preload resource from this render already flushed in this render pass
          // or the preload flushed in a prior pass (prerender). In either case we need to mark
          // this resource as already having been preloaded.
          resource.state = PRELOADED;
        }
      } // We add the newly created resource to our StyleQueue and if necessary
      // track the resource with the currently rendering boundary


      styleQueue.sheets.set(key, resource); // Notify the request that there are resources to flush even if no work is currently happening

      flushResources(request);
    }
  }
}

function preinitScript(src, options) {

  const request = resolveRequest();

  if (!request) {
    // In async contexts we can sometimes resolve resources from AsyncLocalStorage. If we can't we can also
    // possibly get them from the stack if we are not in an async context. Since we were not able to resolve
    // the resources for this call in either case we opt to do nothing. We can consider making this a warning
    // but there may be times where calling a function outside of render is intentional (i.e. to warm up data
    // fetching) and we don't want to warn in those cases.
    return;
  }

  const resumableState = getResumableState(request);
  const renderState = getRenderState(request);

  if (src) {
    const key = getResourceKey(src);
    const hasKey = resumableState.scriptResources.hasOwnProperty(key);
    const resourceState = hasKey ? resumableState.scriptResources[key] : undefined;

    if (resourceState !== EXISTS) {
      // We are going to create this resource now so it is marked as Exists
      resumableState.scriptResources[key] = EXISTS;

      const props = assign({
        src,
        async: true
      }, options);

      if (resourceState) {
        // When resourceState is truty it is a Preload state. We cast it for clarity
        const preloadState = resourceState;

        if (preloadState.length === 2) {
          adoptPreloadCredentials(props, preloadState);
        }

        const preloadResource = renderState.preloads.scripts.get(key);

        if (preloadResource) {
          // the preload resource exists was created in this render. Now that we have
          // a script resource which will emit earlier than a preload would if it
          // hasn't already flushed we prevent it from flushing by zeroing the length
          preloadResource.length = 0;
        }
      }

      const resource = []; // Add to the script flushing queue

      renderState.scripts.add(resource); // encode the tag as Chunks

      pushScriptImpl(resource, props); // Notify the request that there are resources to flush even if no work is currently happening

      flushResources(request);
    }

    return;
  }
}

function preinitModuleScript(src, options) {

  const request = resolveRequest();

  if (!request) {
    // In async contexts we can sometimes resolve resources from AsyncLocalStorage. If we can't we can also
    // possibly get them from the stack if we are not in an async context. Since we were not able to resolve
    // the resources for this call in either case we opt to do nothing. We can consider making this a warning
    // but there may be times where calling a function outside of render is intentional (i.e. to warm up data
    // fetching) and we don't want to warn in those cases.
    return;
  }

  const resumableState = getResumableState(request);
  const renderState = getRenderState(request);

  if (src) {
    const key = getResourceKey(src);
    const hasKey = resumableState.moduleScriptResources.hasOwnProperty(key);
    const resourceState = hasKey ? resumableState.moduleScriptResources[key] : undefined;

    if (resourceState !== EXISTS) {
      // We are going to create this resource now so it is marked as Exists
      resumableState.moduleScriptResources[key] = EXISTS;

      const props = assign({
        src,
        type: 'module',
        async: true
      }, options);

      if (resourceState) {
        // When resourceState is truty it is a Preload state. We cast it for clarity
        const preloadState = resourceState;

        if (preloadState.length === 2) {
          adoptPreloadCredentials(props, preloadState);
        }

        const preloadResource = renderState.preloads.moduleScripts.get(key);

        if (preloadResource) {
          // the preload resource exists was created in this render. Now that we have
          // a script resource which will emit earlier than a preload would if it
          // hasn't already flushed we prevent it from flushing by zeroing the length
          preloadResource.length = 0;
        }
      }

      const resource = []; // Add to the script flushing queue

      renderState.scripts.add(resource); // encode the tag as Chunks

      pushScriptImpl(resource, props); // Notify the request that there are resources to flush even if no work is currently happening

      flushResources(request);
    }

    return;
  }
} // This function is only safe to call at Request start time since it assumes
// that each module has not already been preloaded. If we find a need to preload
// scripts at any other point in time we will need to check whether the preload
// already exists and not assume it


function preloadBootstrapScriptOrModule(resumableState, renderState, href, props) {

  const key = getResourceKey(href);
  // used to preinit the resource. If a script can be preinited then it shouldn't
  // be a bootstrap script/module and if it is a bootstrap script/module then it
  // must not be safe to emit early. To avoid possibly allowing for preinits of
  // bootstrap scripts/modules we occlude these keys.


  resumableState.scriptResources[key] = EXISTS;
  resumableState.moduleScriptResources[key] = EXISTS;
  const resource = [];
  pushLinkImpl(resource, props);
  renderState.bootstrapScripts.add(resource);
}

function internalPreinitScript(resumableState, renderState, src, chunks) {
  const key = getResourceKey(src);

  if (!resumableState.scriptResources.hasOwnProperty(key)) {
    const resource = chunks;
    resumableState.scriptResources[key] = EXISTS;
    renderState.scripts.add(resource);
  }

  return;
}

function preloadAsStylePropsFromProps(href, props) {
  return {
    rel: 'preload',
    as: 'style',
    href: href,
    crossOrigin: props.crossOrigin,
    fetchPriority: props.fetchPriority,
    integrity: props.integrity,
    media: props.media,
    hrefLang: props.hrefLang,
    referrerPolicy: props.referrerPolicy
  };
}

function stylesheetPropsFromRawProps(rawProps) {
  return assign({}, rawProps, {
    'data-precedence': rawProps.precedence,
    precedence: null
  });
}

function adoptPreloadCredentials(target, preloadState) {
  if (target.crossOrigin == null) target.crossOrigin = preloadState[0];
  if (target.integrity == null) target.integrity = preloadState[1];
}

function getPrefetchDNSAsHeader(href) {
  const escapedHref = escapeHrefForLinkHeaderURLContext(href);
  return "<" + escapedHref + ">; rel=dns-prefetch";
}

function getPreconnectAsHeader(href, crossOrigin) {
  const escapedHref = escapeHrefForLinkHeaderURLContext(href);
  let value = "<" + escapedHref + ">; rel=preconnect";

  if (typeof crossOrigin === 'string') {
    const escapedCrossOrigin = escapeStringForLinkHeaderQuotedParamValueContext(crossOrigin);
    value += "; crossorigin=\"" + escapedCrossOrigin + "\"";
  }

  return value;
}

function getPreloadAsHeader(href, as, params) {
  const escapedHref = escapeHrefForLinkHeaderURLContext(href);
  const escapedAs = escapeStringForLinkHeaderQuotedParamValueContext(as);
  let value = "<" + escapedHref + ">; rel=preload; as=\"" + escapedAs + "\"";

  for (const paramName in params) {
    if (hasOwnProperty.call(params, paramName)) {
      const paramValue = params[paramName];

      if (typeof paramValue === 'string') {
        value += "; " + paramName.toLowerCase() + "=\"" + escapeStringForLinkHeaderQuotedParamValueContext(paramValue) + "\"";
      }
    }
  }

  return value;
}

function getStylesheetPreloadAsHeader(stylesheet) {
  const props = stylesheet.props;
  const preloadOptions = {
    crossOrigin: props.crossOrigin,
    integrity: props.integrity,
    nonce: props.nonce,
    type: props.type,
    fetchPriority: props.fetchPriority,
    referrerPolicy: props.referrerPolicy,
    media: props.media
  };
  return getPreloadAsHeader(props.href, 'style', preloadOptions);
} // This escaping function is only safe to use for href values being written into
// a "Link" header in between `<` and `>` characters. The primary concern with the href is
// to escape the bounding characters as well as new lines. This is unsafe to use in any other
// context


const regexForHrefInLinkHeaderURLContext = /[<>\r\n]/g;

function escapeHrefForLinkHeaderURLContext(hrefInput) {

  const coercedHref = '' + hrefInput;
  return coercedHref.replace(regexForHrefInLinkHeaderURLContext, escapeHrefForLinkHeaderURLContextReplacer);
}

function escapeHrefForLinkHeaderURLContextReplacer(match) {
  switch (match) {
    case '<':
      return '%3C';

    case '>':
      return '%3E';

    case '\n':
      return '%0A';

    case '\r':
      return '%0D';

    default:
      {
        // eslint-disable-next-line react-internal/prod-error-codes
        throw new Error('escapeLinkHrefForHeaderContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React');
      }
  }
} // This escaping function is only safe to use for quoted param values in an HTTP header.
// It is unsafe to use for any value not inside quote marks in parater value position.


const regexForLinkHeaderQuotedParamValueContext = /["';,\r\n]/g;

function escapeStringForLinkHeaderQuotedParamValueContext(value, name) {

  const coerced = '' + value;
  return coerced.replace(regexForLinkHeaderQuotedParamValueContext, escapeStringForLinkHeaderQuotedParamValueContextReplacer);
}

function escapeStringForLinkHeaderQuotedParamValueContextReplacer(match) {
  switch (match) {
    case '"':
      return '%22';

    case "'":
      return '%27';

    case ';':
      return '%3B';

    case ',':
      return '%2C';

    case '\n':
      return '%0A';

    case '\r':
      return '%0D';

    default:
      {
        // eslint-disable-next-line react-internal/prod-error-codes
        throw new Error('escapeStringForLinkHeaderQuotedParamValueContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React');
      }
  }
}

function hoistStyleQueueDependency(styleQueue) {
  this.styles.add(styleQueue);
}

function hoistStylesheetDependency(stylesheet) {
  this.stylesheets.add(stylesheet);
}

function hoistHoistables(parentState, childState) {
  childState.styles.forEach(hoistStyleQueueDependency, parentState);
  childState.stylesheets.forEach(hoistStylesheetDependency, parentState);
} // This function is called at various times depending on whether we are rendering
// or prerendering. In this implementation we only actually emit headers once and
// subsequent calls are ignored. We track whether the request has a completed shell
// to determine whether we will follow headers with a flush including stylesheets.
// In the context of prerrender we don't have a completed shell when the request finishes
// with a postpone in the shell. In the context of a render we don't have a completed shell
// if this is called before the shell finishes rendering which usually will happen anytime
// anything suspends in the shell.

function emitEarlyPreloads(renderState, resumableState, shellComplete) {
  const onHeaders = renderState.onHeaders;

  if (onHeaders) {
    const headers = renderState.headers;

    if (headers) {
      // Even if onHeaders throws we don't want to call this again so
      // we drop the headers state from this point onwards.
      renderState.headers = null;
      let linkHeader = headers.preconnects;

      if (headers.fontPreloads) {
        if (linkHeader) {
          linkHeader += ', ';
        }

        linkHeader += headers.fontPreloads;
      }

      if (headers.highImagePreloads) {
        if (linkHeader) {
          linkHeader += ', ';
        }

        linkHeader += headers.highImagePreloads;
      }

      if (!shellComplete) {
        // We use raw iterators because we want to be able to halt iteration
        // We could refactor renderState to store these dually in arrays to
        // make this more efficient at the cost of additional memory and
        // write overhead. However this code only runs once per request so
        // for now I consider this sufficient.
        const queueIter = renderState.styles.values();

        outer: for (let queueStep = queueIter.next(); headers.remainingCapacity > 0 && !queueStep.done; queueStep = queueIter.next()) {
          const sheets = queueStep.value.sheets;
          const sheetIter = sheets.values();

          for (let sheetStep = sheetIter.next(); headers.remainingCapacity > 0 && !sheetStep.done; sheetStep = sheetIter.next()) {
            const sheet = sheetStep.value;
            const props = sheet.props;
            const key = getResourceKey(props.href);
            const header = getStylesheetPreloadAsHeader(sheet); // We mutate the capacity b/c we don't want to keep checking if later headers will fit.
            // This means that a particularly long header might close out the header queue where later
            // headers could still fit. We could in the future alter the behavior here based on prerender vs render
            // since during prerender we aren't as concerned with pure runtime performance.

            if ((headers.remainingCapacity -= header.length) >= 2) {
              renderState.resets.style[key] = PRELOAD_NO_CREDS;

              if (linkHeader) {
                linkHeader += ', ';
              }

              linkHeader += header; // We already track that the resource exists in resumableState however
              // if the resumableState resets because we postponed in the shell
              // which is what is happening in this branch if we are prerendering
              // then we will end up resetting the resumableState. When it resets we
              // want to record the fact that this stylesheet was already preloaded

              renderState.resets.style[key] = typeof props.crossOrigin === 'string' || typeof props.integrity === 'string' ? [props.crossOrigin, props.integrity] : PRELOAD_NO_CREDS;
            } else {
              break outer;
            }
          }
        }
      }

      if (linkHeader) {
        onHeaders({
          Link: linkHeader
        });
      } else {
        // We still call this with no headers because a user may be using it as a signal that
        // it React will not provide any headers
        onHeaders({});
      }

      return;
    }
  }
}

function createRenderState(resumableState, generateStaticMarkup) {
  const renderState = createRenderState$1(resumableState, undefined, undefined, undefined, undefined, undefined);
  return {
    // Keep this in sync with ReactFizzConfigDOM
    placeholderPrefix: renderState.placeholderPrefix,
    segmentPrefix: renderState.segmentPrefix,
    boundaryPrefix: renderState.boundaryPrefix,
    startInlineScript: renderState.startInlineScript,
    htmlChunks: renderState.htmlChunks,
    headChunks: renderState.headChunks,
    externalRuntimeScript: renderState.externalRuntimeScript,
    bootstrapChunks: renderState.bootstrapChunks,
    importMapChunks: renderState.importMapChunks,
    onHeaders: renderState.onHeaders,
    headers: renderState.headers,
    resets: renderState.resets,
    charsetChunks: renderState.charsetChunks,
    viewportChunks: renderState.viewportChunks,
    hoistableChunks: renderState.hoistableChunks,
    preconnects: renderState.preconnects,
    fontPreloads: renderState.fontPreloads,
    highImagePreloads: renderState.highImagePreloads,
    // usedImagePreloads: renderState.usedImagePreloads,
    styles: renderState.styles,
    bootstrapScripts: renderState.bootstrapScripts,
    scripts: renderState.scripts,
    bulkPreloads: renderState.bulkPreloads,
    preloads: renderState.preloads,
    stylesToHoist: renderState.stylesToHoist,
    // This is an extra field for the legacy renderer
    generateStaticMarkup
  };
}

const doctypeChunk = stringToPrecomputedChunk('');
function pushTextInstance(target, text, renderState, textEmbedded) {
  if (renderState.generateStaticMarkup) {
    target.push(stringToChunk(escapeTextForBrowser(text)));
    return false;
  } else {
    return pushTextInstance$1(target, text, renderState, textEmbedded);
  }
}
function pushSegmentFinale(target, renderState, lastPushedText, textEmbedded) {
  if (renderState.generateStaticMarkup) {
    return;
  } else {
    return pushSegmentFinale$1(target, renderState, lastPushedText, textEmbedded);
  }
}
function writeStartCompletedSuspenseBoundary(destination, renderState) {
  if (renderState.generateStaticMarkup) {
    // A completed boundary is done and doesn't need a representation in the HTML
    // if we're not going to be hydrating it.
    return true;
  }

  return writeStartCompletedSuspenseBoundary$1(destination);
}
function writeStartClientRenderedSuspenseBoundary(destination, renderState, // flushing these error arguments are not currently supported in this legacy streaming format.
errorDigest, errorMessage, errorComponentStack) {
  if (renderState.generateStaticMarkup) {
    // A client rendered boundary is done and doesn't need a representation in the HTML
    // since we'll never hydrate it. This is arguably an error in static generation.
    return true;
  }

  return writeStartClientRenderedSuspenseBoundary$1(destination, renderState, errorDigest);
}
function writeEndCompletedSuspenseBoundary(destination, renderState) {
  if (renderState.generateStaticMarkup) {
    return true;
  }

  return writeEndCompletedSuspenseBoundary$1(destination);
}
function writeEndClientRenderedSuspenseBoundary(destination, renderState) {
  if (renderState.generateStaticMarkup) {
    return true;
  }

  return writeEndClientRenderedSuspenseBoundary$1(destination);
}
const NotPendingTransition = NotPending;

function getWrappedName(outerType, innerType, wrapperName) {
  const displayName = outerType.displayName;

  if (displayName) {
    return displayName;
  }

  const functionName = innerType.displayName || innerType.name || '';
  return functionName !== '' ? wrapperName + "(" + functionName + ")" : wrapperName;
} // Keep in sync with react-reconciler/getComponentNameFromFiber


function getContextName(type) {
  return type.displayName || 'Context';
}

const REACT_CLIENT_REFERENCE = Symbol.for('react.client.reference'); // Note that the reconciler package should generally prefer to use getComponentNameFromFiber() instead.

function getComponentNameFromType(type) {
  if (type == null) {
    // Host root, text node or just invalid type.
    return null;
  }

  if (typeof type === 'function') {
    if (type.$$typeof === REACT_CLIENT_REFERENCE) {
      // TODO: Create a convention for naming client references with debug info.
      return null;
    }

    return type.displayName || type.name || null;
  }

  if (typeof type === 'string') {
    return type;
  }

  switch (type) {
    case REACT_FRAGMENT_TYPE:
      return 'Fragment';

    case REACT_PORTAL_TYPE:
      return 'Portal';

    case REACT_PROFILER_TYPE:
      return 'Profiler';

    case REACT_STRICT_MODE_TYPE:
      return 'StrictMode';

    case REACT_SUSPENSE_TYPE:
      return 'Suspense';

    case REACT_SUSPENSE_LIST_TYPE:
      return 'SuspenseList';

    case REACT_CACHE_TYPE:
      {
        return 'Cache';
      }

  }

  if (typeof type === 'object') {

    switch (type.$$typeof) {
      case REACT_PROVIDER_TYPE:
        {
          const provider = type;
          return getContextName(provider._context) + '.Provider';
        }

      case REACT_CONTEXT_TYPE:
        const context = type;

        {
          return getContextName(context) + '.Consumer';
        }

      case REACT_CONSUMER_TYPE:
        {
          return null;
        }

      case REACT_FORWARD_REF_TYPE:
        return getWrappedName(type, type.render, 'ForwardRef');

      case REACT_MEMO_TYPE:
        const outerName = type.displayName || null;

        if (outerName !== null) {
          return outerName;
        }

        return getComponentNameFromType(type.type) || 'Memo';

      case REACT_LAZY_TYPE:
        {
          const lazyComponent = type;
          const payload = lazyComponent._payload;
          const init = lazyComponent._init;

          try {
            return getComponentNameFromType(init(payload));
          } catch (x) {
            return null;
          }
        }
    }
  }

  return null;
}

const emptyContextObject = {};

function getMaskedContext(type, unmaskedContext) {
  {
    const contextTypes = type.contextTypes;

    if (!contextTypes) {
      return emptyContextObject;
    }

    const context = {};

    for (const key in contextTypes) {
      context[key] = unmaskedContext[key];
    }

    return context;
  }
}
function processChildContext(instance, type, parentContext, childContextTypes) {
  {
    // TODO (bvaughn) Replace this behavior with an invariant() in the future.
    // It has only been added in Fiber to match the (unintentional) behavior in Stack.
    if (typeof instance.getChildContext !== 'function') {

      return parentContext;
    }

    const childContext = instance.getChildContext();

    for (const contextKey in childContext) {
      if (!(contextKey in childContextTypes)) {
        throw Error(formatProdErrorMessage(108, getComponentNameFromType(type) || 'Unknown', contextKey));
      }
    }

    return assign({}, parentContext, childContext);
  }
}

// Forming a reverse tree.
// The structure of a context snapshot is an implementation of this file.
// Currently, it's implemented as tracking the current active node.


const rootContextSnapshot = null; // We assume that this runtime owns the "current" field on all ReactContext instances.
// This global (actually thread local) state represents what state all those "current",
// fields are currently in.

let currentActiveSnapshot = null;

function popNode(prev) {
  {
    prev.context._currentValue2 = prev.parentValue;
  }
}

function pushNode(next) {
  {
    next.context._currentValue2 = next.value;
  }
}

function popToNearestCommonAncestor(prev, next) {
  if (prev === next) ; else {
    popNode(prev);
    const parentPrev = prev.parent;
    const parentNext = next.parent;

    if (parentPrev === null) {
      if (parentNext !== null) {
        throw Error(formatProdErrorMessage(401));
      }
    } else {
      if (parentNext === null) {
        throw Error(formatProdErrorMessage(401));
      }

      popToNearestCommonAncestor(parentPrev, parentNext);
    } // On the way back, we push the new ones that weren't common.


    pushNode(next);
  }
}

function popAllPrevious(prev) {
  popNode(prev);
  const parentPrev = prev.parent;

  if (parentPrev !== null) {
    popAllPrevious(parentPrev);
  }
}

function pushAllNext(next) {
  const parentNext = next.parent;

  if (parentNext !== null) {
    pushAllNext(parentNext);
  }

  pushNode(next);
}

function popPreviousToCommonLevel(prev, next) {
  popNode(prev);
  const parentPrev = prev.parent;

  if (parentPrev === null) {
    throw Error(formatProdErrorMessage(402));
  }

  if (parentPrev.depth === next.depth) {
    // We found the same level. Now we just need to find a shared ancestor.
    popToNearestCommonAncestor(parentPrev, next);
  } else {
    // We must still be deeper.
    popPreviousToCommonLevel(parentPrev, next);
  }
}

function popNextToCommonLevel(prev, next) {
  const parentNext = next.parent;

  if (parentNext === null) {
    throw Error(formatProdErrorMessage(402));
  }

  if (prev.depth === parentNext.depth) {
    // We found the same level. Now we just need to find a shared ancestor.
    popToNearestCommonAncestor(prev, parentNext);
  } else {
    // We must still be deeper.
    popNextToCommonLevel(prev, parentNext);
  }

  pushNode(next);
} // Perform context switching to the new snapshot.
// To make it cheap to read many contexts, while not suspending, we make the switch eagerly by
// updating all the context's current values. That way reads, always just read the current value.
// At the cost of updating contexts even if they're never read by this subtree.


function switchContext(newSnapshot) {
  // The basic algorithm we need to do is to pop back any contexts that are no longer on the stack.
  // We also need to update any new contexts that are now on the stack with the deepest value.
  // The easiest way to update new contexts is to just reapply them in reverse order from the
  // perspective of the backpointers. To avoid allocating a lot when switching, we use the stack
  // for that. Therefore this algorithm is recursive.
  // 1) First we pop which ever snapshot tree was deepest. Popping old contexts as we go.
  // 2) Then we find the nearest common ancestor from there. Popping old contexts as we go.
  // 3) Then we reapply new contexts on the way back up the stack.
  const prev = currentActiveSnapshot;
  const next = newSnapshot;

  if (prev !== next) {
    if (prev === null) {
      // $FlowFixMe[incompatible-call]: This has to be non-null since it's not equal to prev.
      pushAllNext(next);
    } else if (next === null) {
      popAllPrevious(prev);
    } else if (prev.depth === next.depth) {
      popToNearestCommonAncestor(prev, next);
    } else if (prev.depth > next.depth) {
      popPreviousToCommonLevel(prev, next);
    } else {
      popNextToCommonLevel(prev, next);
    }

    currentActiveSnapshot = next;
  }
}
function pushProvider(context, nextValue) {
  let prevValue;

  {
    prevValue = context._currentValue2;
    context._currentValue2 = nextValue;
  }

  const prevNode = currentActiveSnapshot;
  const newNode = {
    parent: prevNode,
    depth: prevNode === null ? 0 : prevNode.depth + 1,
    context: context,
    parentValue: prevValue,
    value: nextValue
  };
  currentActiveSnapshot = newNode;
  return newNode;
}
function popProvider(context) {
  const prevSnapshot = currentActiveSnapshot;

  if (prevSnapshot === null) {
    throw Error(formatProdErrorMessage(403));
  }

  {
    const value = prevSnapshot.parentValue;
    prevSnapshot.context._currentValue2 = value;
  }

  return currentActiveSnapshot = prevSnapshot.parent;
}
function getActiveContext() {
  return currentActiveSnapshot;
}
function readContext$1(context) {
  const value = context._currentValue2;
  return value;
}

/**
 * `ReactInstanceMap` maintains a mapping from a public facing stateful
 * instance (key) and the internal representation (value). This allows public
 * methods to accept the user facing instance as an argument and map them back
 * to internal methods.
 *
 * Note that this module is currently shared and assumed to be stateless.
 * If this becomes an actual Map, that will break.
 */
function get(key) {
  return key._reactInternals;
}
function set(key, value) {
  key._reactInternals = value;
}

const classComponentUpdater = {
  isMounted(inst) {
    return false;
  },

  // $FlowFixMe[missing-local-annot]
  enqueueSetState(inst, payload, callback) {
    const internals = get(inst);

    if (internals.queue === null) ; else {
      internals.queue.push(payload);
    }
  },

  enqueueReplaceState(inst, payload, callback) {
    const internals = get(inst);
    internals.replace = true;
    internals.queue = [payload];
  },

  // $FlowFixMe[missing-local-annot]
  enqueueForceUpdate(inst, callback) {
  }

};

function applyDerivedStateFromProps(instance, ctor, getDerivedStateFromProps, prevState, nextProps) {
  const partialState = getDerivedStateFromProps(nextProps, prevState);


  const newState = partialState === null || partialState === undefined ? prevState : assign({}, prevState, partialState);
  return newState;
}

function constructClassInstance(ctor, props, maskedLegacyContext) {
  let context = emptyContextObject;
  const contextType = ctor.contextType;

  if (typeof contextType === 'object' && contextType !== null) {
    context = readContext$1(contextType);
  } else {
    context = maskedLegacyContext;
  }

  const instance = new ctor(props, context);

  return instance;
}

function callComponentWillMount(type, instance) {
  const oldState = instance.state;

  if (typeof instance.componentWillMount === 'function') {

    instance.componentWillMount();
  }

  if (typeof instance.UNSAFE_componentWillMount === 'function') {
    instance.UNSAFE_componentWillMount();
  }

  if (oldState !== instance.state) {

    classComponentUpdater.enqueueReplaceState(instance, instance.state, null);
  }
}

function processUpdateQueue(internalInstance, inst, props, maskedLegacyContext) {
  if (internalInstance.queue !== null && internalInstance.queue.length > 0) {
    const oldQueue = internalInstance.queue;
    const oldReplace = internalInstance.replace;
    internalInstance.queue = null;
    internalInstance.replace = false;

    if (oldReplace && oldQueue.length === 1) {
      inst.state = oldQueue[0];
    } else {
      let nextState = oldReplace ? oldQueue[0] : inst.state;
      let dontMutate = true;

      for (let i = oldReplace ? 1 : 0; i < oldQueue.length; i++) {
        const partial = oldQueue[i];
        const partialState = typeof partial === 'function' ? partial.call(inst, nextState, props, maskedLegacyContext) : partial;

        if (partialState != null) {
          if (dontMutate) {
            dontMutate = false;
            nextState = assign({}, nextState, partialState);
          } else {
            assign(nextState, partialState);
          }
        }
      }

      inst.state = nextState;
    }
  } else {
    internalInstance.queue = null;
  }
} // Invokes the mount life-cycles on a previously never rendered instance.


function mountClassInstance(instance, ctor, newProps, maskedLegacyContext) {

  const initialState = instance.state !== undefined ? instance.state : null;
  instance.updater = classComponentUpdater;
  instance.props = newProps;
  instance.state = initialState; // We don't bother initializing the refs object on the server, since we're not going to resolve them anyway.
  // The internal instance will be used to manage updates that happen during this mount.

  const internalInstance = {
    queue: [],
    replace: false
  };
  set(instance, internalInstance);
  const contextType = ctor.contextType;

  if (typeof contextType === 'object' && contextType !== null) {
    instance.context = readContext$1(contextType);
  } else {
    instance.context = maskedLegacyContext;
  }

  const getDerivedStateFromProps = ctor.getDerivedStateFromProps;

  if (typeof getDerivedStateFromProps === 'function') {
    instance.state = applyDerivedStateFromProps(instance, ctor, getDerivedStateFromProps, initialState, newProps);
  } // In order to support react-lifecycles-compat polyfilled components,
  // Unsafe lifecycles should not be invoked for components using the new APIs.


  if (typeof ctor.getDerivedStateFromProps !== 'function' && typeof instance.getSnapshotBeforeUpdate !== 'function' && (typeof instance.UNSAFE_componentWillMount === 'function' || typeof instance.componentWillMount === 'function')) {
    callComponentWillMount(ctor, instance); // If we had additional state updates during this life-cycle, let's
    // process them now.

    processUpdateQueue(internalInstance, instance, newProps, maskedLegacyContext);
  }
}

// Ids are base 32 strings whose binary representation corresponds to the
// position of a node in a tree.
// Every time the tree forks into multiple children, we add additional bits to
// the left of the sequence that represent the position of the child within the
// current level of children.
//
//      00101       00010001011010101
//      ╰─┬─╯       ╰───────┬───────╯
//   Fork 5 of 20       Parent id
//
// The leading 0s are important. In the above example, you only need 3 bits to
// represent slot 5. However, you need 5 bits to represent all the forks at
// the current level, so we must account for the empty bits at the end.
//
// For this same reason, slots are 1-indexed instead of 0-indexed. Otherwise,
// the zeroth id at a level would be indistinguishable from its parent.
//
// If a node has only one child, and does not materialize an id (i.e. does not
// contain a useId hook), then we don't need to allocate any space in the
// sequence. It's treated as a transparent indirection. For example, these two
// trees produce the same ids:
//
// <>                          <>
//   <Indirection>               <A />
//     <A />                     <B />
//   </Indirection>            </>
//   <B />
// </>
//
// However, we cannot skip any node that materializes an id. Otherwise, a parent
// id that does not fork would be indistinguishable from its child id. For
// example, this tree does not fork, but the parent and child must have
// different ids.
//
// <Parent>
//   <Child />
// </Parent>
//
// To handle this scenario, every time we materialize an id, we allocate a
// new level with a single slot. You can think of this as a fork with only one
// prong, or an array of children with length 1.
//
// It's possible for the size of the sequence to exceed 32 bits, the max
// size for bitwise operations. When this happens, we make more room by
// converting the right part of the id to a string and storing it in an overflow
// variable. We use a base 32 string representation, because 32 is the largest
// power of 2 that is supported by toString(). We want the base to be large so
// that the resulting ids are compact, and we want the base to be a power of 2
// because every log2(base) bits corresponds to a single character, i.e. every
// log2(32) = 5 bits. That means we can lop bits off the end 5 at a time without
// affecting the final result.
const emptyTreeContext = {
  id: 1,
  overflow: ''
};
function getTreeId(context) {
  const overflow = context.overflow;
  const idWithLeadingBit = context.id;
  const id = idWithLeadingBit & ~getLeadingBit(idWithLeadingBit);
  return id.toString(32) + overflow;
}
function pushTreeContext(baseContext, totalChildren, index) {
  const baseIdWithLeadingBit = baseContext.id;
  const baseOverflow = baseContext.overflow; // The leftmost 1 marks the end of the sequence, non-inclusive. It's not part
  // of the id; we use it to account for leading 0s.

  const baseLength = getBitLength(baseIdWithLeadingBit) - 1;
  const baseId = baseIdWithLeadingBit & ~(1 << baseLength);
  const slot = index + 1;
  const length = getBitLength(totalChildren) + baseLength; // 30 is the max length we can store without overflowing, taking into
  // consideration the leading 1 we use to mark the end of the sequence.

  if (length > 30) {
    // We overflowed the bitwise-safe range. Fall back to slower algorithm.
    // This branch assumes the length of the base id is greater than 5; it won't
    // work for smaller ids, because you need 5 bits per character.
    //
    // We encode the id in multiple steps: first the base id, then the
    // remaining digits.
    //
    // Each 5 bit sequence corresponds to a single base 32 character. So for
    // example, if the current id is 23 bits long, we can convert 20 of those
    // bits into a string of 4 characters, with 3 bits left over.
    //
    // First calculate how many bits in the base id represent a complete
    // sequence of characters.
    const numberOfOverflowBits = baseLength - baseLength % 5; // Then create a bitmask that selects only those bits.

    const newOverflowBits = (1 << numberOfOverflowBits) - 1; // Select the bits, and convert them to a base 32 string.

    const newOverflow = (baseId & newOverflowBits).toString(32); // Now we can remove those bits from the base id.

    const restOfBaseId = baseId >> numberOfOverflowBits;
    const restOfBaseLength = baseLength - numberOfOverflowBits; // Finally, encode the rest of the bits using the normal algorithm. Because
    // we made more room, this time it won't overflow.

    const restOfLength = getBitLength(totalChildren) + restOfBaseLength;
    const restOfNewBits = slot << restOfBaseLength;
    const id = restOfNewBits | restOfBaseId;
    const overflow = newOverflow + baseOverflow;
    return {
      id: 1 << restOfLength | id,
      overflow
    };
  } else {
    // Normal path
    const newBits = slot << baseLength;
    const id = newBits | baseId;
    const overflow = baseOverflow;
    return {
      id: 1 << length | id,
      overflow
    };
  }
}

function getBitLength(number) {
  return 32 - clz32(number);
}

function getLeadingBit(id) {
  return 1 << getBitLength(id) - 1;
} // TODO: Math.clz32 is supported in Node 12+. Maybe we can drop the fallback.


const clz32 = Math.clz32 ? Math.clz32 : clz32Fallback; // Count leading zeros.
// Based on:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32

const log = Math.log;
const LN2 = Math.LN2;

function clz32Fallback(x) {
  const asUint = x >>> 0;

  if (asUint === 0) {
    return 32;
  }

  return 31 - (log(asUint) / LN2 | 0) | 0;
}

// Corresponds to ReactFiberWakeable and ReactFlightWakeable modules. Generally,
// changes to one module should be reflected in the others.
// TODO: Rename this module and the corresponding Fiber one to "Thenable"
// instead of "Wakeable". Or some other more appropriate name.
// An error that is thrown (e.g. by `use`) to trigger Suspense. If we
// detect this is caught by userspace, we'll log a warning in development.
const SuspenseException = Error(formatProdErrorMessage(460));
function createThenableState() {
  // The ThenableState is created the first time a component suspends. If it
  // suspends again, we'll reuse the same state.
  return [];
}

function noop$2() {}

function trackUsedThenable(thenableState, thenable, index) {
  const previous = thenableState[index];

  if (previous === undefined) {
    thenableState.push(thenable);
  } else {
    if (previous !== thenable) {
      // Reuse the previous thenable, and drop the new one. We can assume
      // they represent the same value, because components are idempotent.
      // Avoid an unhandled rejection errors for the Promises that we'll
      // intentionally ignore.
      thenable.then(noop$2, noop$2);
      thenable = previous;
    }
  } // We use an expando to track the status and result of a thenable so that we
  // can synchronously unwrap the value. Think of this as an extension of the
  // Promise API, or a custom interface that is a superset of Thenable.
  //
  // If the thenable doesn't have a status, set it to "pending" and attach
  // a listener that will update its status and result when it resolves.


  switch (thenable.status) {
    case 'fulfilled':
      {
        const fulfilledValue = thenable.value;
        return fulfilledValue;
      }

    case 'rejected':
      {
        const rejectedError = thenable.reason;
        throw rejectedError;
      }

    default:
      {
        if (typeof thenable.status === 'string') ; else {
          const pendingThenable = thenable;
          pendingThenable.status = 'pending';
          pendingThenable.then(fulfilledValue => {
            if (thenable.status === 'pending') {
              const fulfilledThenable = thenable;
              fulfilledThenable.status = 'fulfilled';
              fulfilledThenable.value = fulfilledValue;
            }
          }, error => {
            if (thenable.status === 'pending') {
              const rejectedThenable = thenable;
              rejectedThenable.status = 'rejected';
              rejectedThenable.reason = error;
            }
          }); // Check one more time in case the thenable resolved synchronously

          switch (thenable.status) {
            case 'fulfilled':
              {
                const fulfilledThenable = thenable;
                return fulfilledThenable.value;
              }

            case 'rejected':
              {
                const rejectedThenable = thenable;
                throw rejectedThenable.reason;
              }
          }
        } // Suspend.
        //
        // Throwing here is an implementation detail that allows us to unwind the
        // call stack. But we shouldn't allow it to leak into userspace. Throw an
        // opaque placeholder value instead of the actual thenable. If it doesn't
        // get captured by the work loop, log a warning, because that means
        // something in userspace must have caught it.


        suspendedThenable = thenable;
        throw SuspenseException;
      }
  }
} // This is used to track the actual thenable that suspended so it can be
// passed to the rest of the Suspense implementation — which, for historical
// reasons, expects to receive a thenable.

let suspendedThenable = null;
function getSuspendedThenable() {
  // This is called right after `use` suspends by throwing an exception. `use`
  // throws an opaque value instead of the thenable itself so that it can't be
  // caught in userspace. Then the work loop accesses the actual thenable using
  // this function.
  if (suspendedThenable === null) {
    throw Error(formatProdErrorMessage(459));
  }

  const thenable = suspendedThenable;
  suspendedThenable = null;
  return thenable;
}

/**
 * inlined Object.is polyfill to avoid requiring consumers ship their own
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
 */
function is(x, y) {
  return x === y && (x !== 0 || 1 / x === 1 / y) || x !== x && y !== y // eslint-disable-line no-self-compare
  ;
}

const objectIs = // $FlowFixMe[method-unbinding]
typeof Object.is === 'function' ? Object.is : is;

let currentlyRenderingComponent = null;
let currentlyRenderingTask = null;
let currentlyRenderingRequest = null;
let currentlyRenderingKeyPath = null;
let firstWorkInProgressHook = null;
let workInProgressHook = null; // Whether the work-in-progress hook is a re-rendered hook

let isReRender = false; // Whether an update was scheduled during the currently executing render pass.

let didScheduleRenderPhaseUpdate = false; // Counts the number of useId hooks in this component

let localIdCounter = 0; // Chunks that should be pushed to the stream once the component
// finishes rendering.
// Counts the number of useFormState calls in this component

let formStateCounter = 0; // The index of the useFormState hook that matches the one passed in at the
// root during an MPA navigation, if any.

let formStateMatchingIndex = -1; // Counts the number of use(thenable) calls in this component

let thenableIndexCounter = 0;
let thenableState = null; // Lazily created map of render-phase updates

let renderPhaseUpdates = null; // Counter to prevent infinite loops.

let numberOfReRenders = 0;
const RE_RENDER_LIMIT = 25;

function resolveCurrentlyRenderingComponent() {
  if (currentlyRenderingComponent === null) {
    throw Error(formatProdErrorMessage(321));
  }

  return currentlyRenderingComponent;
}

function areHookInputsEqual(nextDeps, prevDeps) {
  if (prevDeps === null) {

    return false;
  }


  for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
    // $FlowFixMe[incompatible-use] found when upgrading Flow
    if (objectIs(nextDeps[i], prevDeps[i])) {
      continue;
    }

    return false;
  }

  return true;
}

function createHook() {
  if (numberOfReRenders > 0) {
    throw Error(formatProdErrorMessage(312));
  }

  return {
    memoizedState: null,
    queue: null,
    next: null
  };
}

function createWorkInProgressHook() {
  if (workInProgressHook === null) {
    // This is the first hook in the list
    if (firstWorkInProgressHook === null) {
      isReRender = false;
      firstWorkInProgressHook = workInProgressHook = createHook();
    } else {
      // There's already a work-in-progress. Reuse it.
      isReRender = true;
      workInProgressHook = firstWorkInProgressHook;
    }
  } else {
    if (workInProgressHook.next === null) {
      isReRender = false; // Append to the end of the list

      workInProgressHook = workInProgressHook.next = createHook();
    } else {
      // There's already a work-in-progress. Reuse it.
      isReRender = true;
      workInProgressHook = workInProgressHook.next;
    }
  }

  return workInProgressHook;
}

function prepareToUseHooks(request, task, keyPath, componentIdentity, prevThenableState) {
  currentlyRenderingComponent = componentIdentity;
  currentlyRenderingTask = task;
  currentlyRenderingRequest = request;
  currentlyRenderingKeyPath = keyPath;
  // didScheduleRenderPhaseUpdate = false;
  // firstWorkInProgressHook = null;
  // numberOfReRenders = 0;
  // renderPhaseUpdates = null;
  // workInProgressHook = null;


  localIdCounter = 0;
  formStateCounter = 0;
  formStateMatchingIndex = -1;
  thenableIndexCounter = 0;
  thenableState = prevThenableState;
}
function finishHooks(Component, props, children, refOrContext) {
  // This must be called after every function component to prevent hooks from
  // being used in classes.
  while (didScheduleRenderPhaseUpdate) {
    // Updates were scheduled during the render phase. They are stored in
    // the `renderPhaseUpdates` map. Call the component again, reusing the
    // work-in-progress hooks and applying the additional updates on top. Keep
    // restarting until no more updates are scheduled.
    didScheduleRenderPhaseUpdate = false;
    localIdCounter = 0;
    formStateCounter = 0;
    formStateMatchingIndex = -1;
    thenableIndexCounter = 0;
    numberOfReRenders += 1; // Start over from the beginning of the list

    workInProgressHook = null;
    children = Component(props, refOrContext);
  }

  resetHooksState();
  return children;
}
function getThenableStateAfterSuspending() {
  const state = thenableState;
  thenableState = null;
  return state;
}
function checkDidRenderIdHook() {
  // This should be called immediately after every finishHooks call.
  // Conceptually, it's part of the return value of finishHooks; it's only a
  // separate function to avoid using an array tuple.
  const didRenderIdHook = localIdCounter !== 0;
  return didRenderIdHook;
}
function getFormStateCount() {
  // This should be called immediately after every finishHooks call.
  // Conceptually, it's part of the return value of finishHooks; it's only a
  // separate function to avoid using an array tuple.
  return formStateCounter;
}
function getFormStateMatchingIndex() {
  // This should be called immediately after every finishHooks call.
  // Conceptually, it's part of the return value of finishHooks; it's only a
  // separate function to avoid using an array tuple.
  return formStateMatchingIndex;
} // Reset the internal hooks state if an error occurs while rendering a component

function resetHooksState() {

  currentlyRenderingComponent = null;
  currentlyRenderingTask = null;
  currentlyRenderingRequest = null;
  currentlyRenderingKeyPath = null;
  didScheduleRenderPhaseUpdate = false;
  firstWorkInProgressHook = null;
  numberOfReRenders = 0;
  renderPhaseUpdates = null;
  workInProgressHook = null;
}

function readContext(context) {

  return readContext$1(context);
}

function useContext(context) {

  resolveCurrentlyRenderingComponent();
  return readContext$1(context);
}

function basicStateReducer(state, action) {
  // $FlowFixMe[incompatible-use]: Flow doesn't like mixed types
  return typeof action === 'function' ? action(state) : action;
}

function useState(initialState) {

  return useReducer(basicStateReducer, // useReducer has a special case to support lazy useState initializers
  initialState);
}
function useReducer(reducer, initialArg, init) {

  currentlyRenderingComponent = resolveCurrentlyRenderingComponent();
  workInProgressHook = createWorkInProgressHook();

  if (isReRender) {
    // This is a re-render. Apply the new render phase updates to the previous
    // current hook.
    const queue = workInProgressHook.queue;
    const dispatch = queue.dispatch;

    if (renderPhaseUpdates !== null) {
      // Render phase updates are stored in a map of queue -> linked list
      const firstRenderPhaseUpdate = renderPhaseUpdates.get(queue);

      if (firstRenderPhaseUpdate !== undefined) {
        // $FlowFixMe[incompatible-use] found when upgrading Flow
        renderPhaseUpdates.delete(queue); // $FlowFixMe[incompatible-use] found when upgrading Flow

        let newState = workInProgressHook.memoizedState;
        let update = firstRenderPhaseUpdate;

        do {
          // Process this render phase update. We don't have to check the
          // priority because it will always be the same as the current
          // render's.
          const action = update.action;

          newState = reducer(newState, action);


          update = update.next;
        } while (update !== null); // $FlowFixMe[incompatible-use] found when upgrading Flow


        workInProgressHook.memoizedState = newState;
        return [newState, dispatch];
      }
    } // $FlowFixMe[incompatible-use] found when upgrading Flow


    return [workInProgressHook.memoizedState, dispatch];
  } else {

    let initialState;

    if (reducer === basicStateReducer) {
      // Special case for `useState`.
      initialState = typeof initialArg === 'function' ? initialArg() : initialArg;
    } else {
      initialState = init !== undefined ? init(initialArg) : initialArg;
    }


    workInProgressHook.memoizedState = initialState; // $FlowFixMe[incompatible-use] found when upgrading Flow

    const queue = workInProgressHook.queue = {
      last: null,
      dispatch: null
    };
    const dispatch = queue.dispatch = dispatchAction.bind(null, currentlyRenderingComponent, queue); // $FlowFixMe[incompatible-use] found when upgrading Flow

    return [workInProgressHook.memoizedState, dispatch];
  }
}

function useMemo(nextCreate, deps) {
  currentlyRenderingComponent = resolveCurrentlyRenderingComponent();
  workInProgressHook = createWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;

  if (workInProgressHook !== null) {
    const prevState = workInProgressHook.memoizedState;

    if (prevState !== null) {
      if (nextDeps !== null) {
        const prevDeps = prevState[1];

        if (areHookInputsEqual(nextDeps, prevDeps)) {
          return prevState[0];
        }
      }
    }
  }

  const nextValue = nextCreate();


  workInProgressHook.memoizedState = [nextValue, nextDeps];
  return nextValue;
}

function useRef(initialValue) {
  currentlyRenderingComponent = resolveCurrentlyRenderingComponent();
  workInProgressHook = createWorkInProgressHook();
  const previousRef = workInProgressHook.memoizedState;

  if (previousRef === null) {
    const ref = {
      current: initialValue
    };


    workInProgressHook.memoizedState = ref;
    return ref;
  } else {
    return previousRef;
  }
}

function dispatchAction(componentIdentity, queue, action) {
  if (numberOfReRenders >= RE_RENDER_LIMIT) {
    throw Error(formatProdErrorMessage(301));
  }

  if (componentIdentity === currentlyRenderingComponent) {
    // This is a render phase update. Stash it in a lazily-created map of
    // queue -> linked list of updates. After this render pass, we'll restart
    // and apply the stashed updates on top of the work-in-progress hook.
    didScheduleRenderPhaseUpdate = true;
    const update = {
      action,
      next: null
    };

    if (renderPhaseUpdates === null) {
      renderPhaseUpdates = new Map();
    }

    const firstRenderPhaseUpdate = renderPhaseUpdates.get(queue);

    if (firstRenderPhaseUpdate === undefined) {
      // $FlowFixMe[incompatible-use] found when upgrading Flow
      renderPhaseUpdates.set(queue, update);
    } else {
      // Append the update to the end of the list.
      let lastRenderPhaseUpdate = firstRenderPhaseUpdate;

      while (lastRenderPhaseUpdate.next !== null) {
        lastRenderPhaseUpdate = lastRenderPhaseUpdate.next;
      }

      lastRenderPhaseUpdate.next = update;
    }
  }
}

function useCallback(callback, deps) {
  return useMemo(() => callback, deps);
}

function useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
  if (getServerSnapshot === undefined) {
    throw Error(formatProdErrorMessage(407));
  }

  return getServerSnapshot();
}

function useDeferredValue(value, initialValue) {
  resolveCurrentlyRenderingComponent();

  {
    return value;
  }
}

function unsupportedStartTransition() {
  throw Error(formatProdErrorMessage(394));
}

function useTransition() {
  resolveCurrentlyRenderingComponent();
  return [false, unsupportedStartTransition];
}

function useHostTransitionStatus() {
  resolveCurrentlyRenderingComponent();
  return NotPendingTransition;
}

function unsupportedSetOptimisticState() {
  throw Error(formatProdErrorMessage(479));
}

function useOptimistic(passthrough, reducer) {
  resolveCurrentlyRenderingComponent();
  return [passthrough, unsupportedSetOptimisticState];
}

function createPostbackFormStateKey(permalink, componentKeyPath, hookIndex) {
  if (permalink !== undefined) {
    // Don't bother to hash a permalink-based key since it's already short.
    return 'p' + permalink;
  } else {
    // Append a node to the key path that represents the form state hook.
    const keyPath = [componentKeyPath, null, hookIndex]; // Key paths are hashed to reduce the size. It does not need to be secure,
    // and it's more important that it's fast than that it's completely
    // collision-free.

    const keyPathHash = createFastHashJS(JSON.stringify(keyPath));
    return 'k' + keyPathHash;
  }
}

function useFormState(action, initialState, permalink) {
  resolveCurrentlyRenderingComponent(); // Count the number of useFormState hooks per component. We also use this to
  // track the position of this useFormState hook relative to the other ones in
  // this component, so we can generate a unique key for each one.

  const formStateHookIndex = formStateCounter++;
  const request = currentlyRenderingRequest; // $FlowIgnore[prop-missing]

  const formAction = action.$$FORM_ACTION;

  if (typeof formAction === 'function') {
    // This is a server action. These have additional features to enable
    // MPA-style form submissions with progressive enhancement.
    // TODO: If the same permalink is passed to multiple useFormStates, and
    // they all have the same action signature, Fizz will pass the postback
    // state to all of them. We should probably only pass it to the first one,
    // and/or warn.
    // The key is lazily generated and deduped so the that the keypath doesn't
    // get JSON.stringify-ed unnecessarily, and at most once.
    let nextPostbackStateKey = null; // Determine the current form state. If we received state during an MPA form
    // submission, then we will reuse that, if the action identity matches.
    // Otherwise we'll use the initial state argument. We will emit a comment
    // marker into the stream that indicates whether the state was reused.

    let state = initialState;
    const componentKeyPath = currentlyRenderingKeyPath;
    const postbackFormState = getFormState(request); // $FlowIgnore[prop-missing]

    const isSignatureEqual = action.$$IS_SIGNATURE_EQUAL;

    if (postbackFormState !== null && typeof isSignatureEqual === 'function') {
      const postbackKey = postbackFormState[1];
      const postbackReferenceId = postbackFormState[2];
      const postbackBoundArity = postbackFormState[3];

      if (isSignatureEqual.call(action, postbackReferenceId, postbackBoundArity)) {
        nextPostbackStateKey = createPostbackFormStateKey(permalink, componentKeyPath, formStateHookIndex);

        if (postbackKey === nextPostbackStateKey) {
          // This was a match
          formStateMatchingIndex = formStateHookIndex; // Reuse the state that was submitted by the form.

          state = postbackFormState[0];
        }
      }
    } // Bind the state to the first argument of the action.


    const boundAction = action.bind(null, state); // Wrap the action so the return value is void.

    const dispatch = payload => {
      boundAction(payload);
    }; // $FlowIgnore[prop-missing]


    if (typeof boundAction.$$FORM_ACTION === 'function') {
      // $FlowIgnore[prop-missing]
      dispatch.$$FORM_ACTION = prefix => {
        const metadata = boundAction.$$FORM_ACTION(prefix); // Override the action URL

        if (permalink !== undefined) {

          permalink += '';
          metadata.action = permalink;
        }

        const formData = metadata.data;

        if (formData) {
          if (nextPostbackStateKey === null) {
            nextPostbackStateKey = createPostbackFormStateKey(permalink, componentKeyPath, formStateHookIndex);
          }

          formData.append('$ACTION_KEY', nextPostbackStateKey);
        }

        return metadata;
      };
    }

    return [state, dispatch];
  } else {
    // This is not a server action, so the implementation is much simpler.
    // Bind the state to the first argument of the action.
    const boundAction = action.bind(null, initialState); // Wrap the action so the return value is void.

    const dispatch = payload => {
      boundAction(payload);
    };

    return [initialState, dispatch];
  }
}

function useId() {
  const task = currentlyRenderingTask;
  const treeId = getTreeId(task.treeContext);
  const resumableState = currentResumableState;

  if (resumableState === null) {
    throw Error(formatProdErrorMessage(404));
  }

  const localId = localIdCounter++;
  return makeId(resumableState, treeId, localId);
}

function use(usable) {
  if (usable !== null && typeof usable === 'object') {
    // $FlowFixMe[method-unbinding]
    if (typeof usable.then === 'function') {
      // This is a thenable.
      const thenable = usable;
      return unwrapThenable(thenable);
    } else if (usable.$$typeof === REACT_CONTEXT_TYPE) {
      const context = usable;
      return readContext(context);
    }
  } // eslint-disable-next-line react-internal/safe-string-coercion


  throw Error(formatProdErrorMessage(438, String(usable)));
}

function unwrapThenable(thenable) {
  const index = thenableIndexCounter;
  thenableIndexCounter += 1;

  if (thenableState === null) {
    thenableState = createThenableState();
  }

  return trackUsedThenable(thenableState, thenable, index);
}

function unsupportedRefresh() {
  throw Error(formatProdErrorMessage(393));
}

function useCacheRefresh() {
  return unsupportedRefresh;
}

function noop$1() {}

const HooksDispatcher = {
  readContext,
  use,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  useInsertionEffect: noop$1,
  useLayoutEffect: noop$1,
  useCallback,
  // useImperativeHandle is not run in the server environment
  useImperativeHandle: noop$1,
  // Effects are not run in the server environment.
  useEffect: noop$1,
  // Debugging effect
  useDebugValue: noop$1,
  useDeferredValue,
  useTransition,
  useId,
  // Subscriptions are not setup in a server environment.
  useSyncExternalStore
};

{
  HooksDispatcher.useCacheRefresh = useCacheRefresh;
}

{
  HooksDispatcher.useHostTransitionStatus = useHostTransitionStatus;
}

{
  HooksDispatcher.useOptimistic = useOptimistic;
  HooksDispatcher.useFormState = useFormState;
}

let currentResumableState = null;
function setCurrentResumableState(resumableState) {
  currentResumableState = resumableState;
}

function getCacheSignal() {
  throw Error(formatProdErrorMessage(248));
}

function getCacheForType(resourceType) {
  throw Error(formatProdErrorMessage(248));
}

const DefaultCacheDispatcher = {
  getCacheSignal,
  getCacheForType
};

let prefix;
function describeBuiltInComponentFrame(name, ownerFn) {
  {
    if (prefix === undefined) {
      // Extract the VM specific prefix used by each line.
      try {
        throw Error();
      } catch (x) {
        const match = x.stack.trim().match(/\n( *(at )?)/);
        prefix = match && match[1] || '';
      }
    } // We use the prefix to ensure our stacks line up with native stack frames.


    return '\n' + prefix + name;
  }
}
let reentry = false;
let componentFrameCache;
/**
 * Leverages native browser/VM stack frames to get proper details (e.g.
 * filename, line + col number) for a single component in a component stack. We
 * do this by:
 *   (1) throwing and catching an error in the function - this will be our
 *       control error.
 *   (2) calling the component which will eventually throw an error that we'll
 *       catch - this will be our sample error.
 *   (3) diffing the control and sample error stacks to find the stack frame
 *       which represents our component.
 */


function describeNativeComponentFrame(fn, construct) {
  // If something asked for a stack inside a fake render, it should get ignored.
  if (!fn || reentry) {
    return '';
  }

  reentry = true;
  const previousPrepareStackTrace = Error.prepareStackTrace; // $FlowFixMe[incompatible-type] It does accept undefined.

  Error.prepareStackTrace = undefined;
  /**
   * Finding a common stack frame between sample and control errors can be
   * tricky given the different types and levels of stack trace truncation from
   * different JS VMs. So instead we'll attempt to control what that common
   * frame should be through this object method:
   * Having both the sample and control errors be in the function under the
   * `DescribeNativeComponentFrameRoot` property, + setting the `name` and
   * `displayName` properties of the function ensures that a stack
   * frame exists that has the method name `DescribeNativeComponentFrameRoot` in
   * it for both control and sample stacks.
   */


  const RunInRootFrame = {
    DetermineComponentFrameRoot() {
      let control;

      try {
        // This should throw.
        if (construct) {
          // Something should be setting the props in the constructor.
          const Fake = function () {
            throw Error();
          }; // $FlowFixMe[prop-missing]


          Object.defineProperty(Fake.prototype, 'props', {
            set: function () {
              // We use a throwing setter instead of frozen or non-writable props
              // because that won't throw in a non-strict mode function.
              throw Error();
            }
          });

          if (typeof Reflect === 'object' && Reflect.construct) {
            // We construct a different control for this case to include any extra
            // frames added by the construct call.
            try {
              Reflect.construct(Fake, []);
            } catch (x) {
              control = x;
            }

            Reflect.construct(fn, [], Fake);
          } else {
            try {
              Fake.call();
            } catch (x) {
              control = x;
            } // $FlowFixMe[prop-missing] found when upgrading Flow


            fn.call(Fake.prototype);
          }
        } else {
          try {
            throw Error();
          } catch (x) {
            control = x;
          } // TODO(luna): This will currently only throw if the function component
          // tries to access React/ReactDOM/props. We should probably make this throw
          // in simple components too


          const maybePromise = fn(); // If the function component returns a promise, it's likely an async
          // component, which we don't yet support. Attach a noop catch handler to
          // silence the error.
          // TODO: Implement component stacks for async client components?

          if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch(() => {});
          }
        }
      } catch (sample) {
        // This is inlined manually because closure doesn't do it for us.
        if (sample && control && typeof sample.stack === 'string') {
          return [sample.stack, control.stack];
        }
      }

      return [null, null];
    }

  }; // $FlowFixMe[prop-missing]

  RunInRootFrame.DetermineComponentFrameRoot.displayName = 'DetermineComponentFrameRoot';
  const namePropDescriptor = Object.getOwnPropertyDescriptor(RunInRootFrame.DetermineComponentFrameRoot, 'name'); // Before ES6, the `name` property was not configurable.

  if (namePropDescriptor && namePropDescriptor.configurable) {
    // V8 utilizes a function's `name` property when generating a stack trace.
    Object.defineProperty(RunInRootFrame.DetermineComponentFrameRoot, // Configurable properties can be updated even if its writable descriptor
    // is set to `false`.
    // $FlowFixMe[cannot-write]
    'name', {
      value: 'DetermineComponentFrameRoot'
    });
  }

  try {
    const _RunInRootFrame$Deter = RunInRootFrame.DetermineComponentFrameRoot(),
          sampleStack = _RunInRootFrame$Deter[0],
          controlStack = _RunInRootFrame$Deter[1];

    if (sampleStack && controlStack) {
      // This extracts the first frame from the sample that isn't also in the control.
      // Skipping one frame that we assume is the frame that calls the two.
      const sampleLines = sampleStack.split('\n');
      const controlLines = controlStack.split('\n');
      let s = 0;
      let c = 0;

      while (s < sampleLines.length && !sampleLines[s].includes('DetermineComponentFrameRoot')) {
        s++;
      }

      while (c < controlLines.length && !controlLines[c].includes('DetermineComponentFrameRoot')) {
        c++;
      } // We couldn't find our intentionally injected common root frame, attempt
      // to find another common root frame by search from the bottom of the
      // control stack...


      if (s === sampleLines.length || c === controlLines.length) {
        s = sampleLines.length - 1;
        c = controlLines.length - 1;

        while (s >= 1 && c >= 0 && sampleLines[s] !== controlLines[c]) {
          // We expect at least one stack frame to be shared.
          // Typically this will be the root most one. However, stack frames may be
          // cut off due to maximum stack limits. In this case, one maybe cut off
          // earlier than the other. We assume that the sample is longer or the same
          // and there for cut off earlier. So we should find the root most frame in
          // the sample somewhere in the control.
          c--;
        }
      }

      for (; s >= 1 && c >= 0; s--, c--) {
        // Next we find the first one that isn't the same which should be the
        // frame that called our sample function and the control.
        if (sampleLines[s] !== controlLines[c]) {
          // In V8, the first line is describing the message but other VMs don't.
          // If we're about to return the first line, and the control is also on the same
          // line, that's a pretty good indicator that our sample threw at same line as
          // the control. I.e. before we entered the sample frame. So we ignore this result.
          // This can happen if you passed a class to function component, or non-function.
          if (s !== 1 || c !== 1) {
            do {
              s--;
              c--; // We may still have similar intermediate frames from the construct call.
              // The next one that isn't the same should be our match though.

              if (c < 0 || sampleLines[s] !== controlLines[c]) {
                // V8 adds a "new" prefix for native classes. Let's remove it to make it prettier.
                let frame = '\n' + sampleLines[s].replace(' at new ', ' at '); // If our component frame is labeled "<anonymous>"
                // but we have a user-provided "displayName"
                // splice it in to make the stack more readable.

                if (fn.displayName && frame.includes('<anonymous>')) {
                  frame = frame.replace('<anonymous>', fn.displayName);
                }

                if (false) ; // Return the line we found.


                return frame;
              }
            } while (s >= 1 && c >= 0);
          }

          break;
        }
      }
    }
  } finally {
    reentry = false;

    Error.prepareStackTrace = previousPrepareStackTrace;
  } // Fallback to just using the name if we couldn't make it throw.


  const name = fn ? fn.displayName || fn.name : '';
  const syntheticFrame = name ? describeBuiltInComponentFrame(name) : '';

  return syntheticFrame;
}

function describeClassComponentFrame(ctor, ownerFn) {
  {
    return describeNativeComponentFrame(ctor, true);
  }
}
function describeFunctionComponentFrame(fn, ownerFn) {
  {
    return describeNativeComponentFrame(fn, false);
  }
}

function getStackByComponentStackNode(componentStack) {
  try {
    let info = '';
    let node = componentStack;

    do {
      switch (node.tag) {
        case 0:
          info += describeBuiltInComponentFrame(node.type, null);
          break;

        case 1:
          info += describeFunctionComponentFrame(node.type, null);
          break;

        case 2:
          info += describeClassComponentFrame(node.type, null);
          break;
      } // $FlowFixMe[incompatible-type] we bail out when we get a null


      node = node.parent;
    } while (node);

    return info;
  } catch (x) {
    return '\nError generating stack: ' + x.message + '\n' + x.stack;
  }
}

const ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher;
const ReactCurrentCache = ReactSharedInternals.ReactCurrentCache;
// The name might be minified but we assume that it's going to be the same generated name. Typically
// because it's just the same compiled output in practice.
// resume with segmentID at the index

const CLIENT_RENDERED = 4; // if it errors or infinitely suspends

const PENDING = 0;
const COMPLETED = 1;
const FLUSHED = 2;
const ABORTED = 3;
const ERRORED = 4;
const POSTPONED = 5;
const OPEN = 0;
const CLOSING = 1;
const CLOSED = 2; // This is a default heuristic for how to split up the HTML content into progressive
// loading. Our goal is to be able to display additional new content about every 500ms.
// Faster than that is unnecessary and should be throttled on the client. It also
// adds unnecessary overhead to do more splits. We don't know if it's a higher or lower
// end device but higher end suffer less from the overhead than lower end does from
// not getting small enough pieces. We error on the side of low end.
// We base this on low end 3G speeds which is about 500kbits per second. We assume
// that there can be a reasonable drop off from max bandwidth which leaves you with
// as little as 80%. We can receive half of that each 500ms - at best. In practice,
// a little bandwidth is lost to processing and contention - e.g. CSS and images that
// are downloaded along with the main content. So we estimate about half of that to be
// the lower end throughput. In other words, we expect that you can at least show
// about 12.5kb of content per 500ms. Not counting starting latency for the first
// paint.
// 500 * 1024 / 8 * .8 * 0.5 / 2

const DEFAULT_PROGRESSIVE_CHUNK_SIZE = 12800;

function defaultErrorHandler(error) {
  console['error'](error); // Don't transform to our wrapper

  return null;
}

function noop() {}

function createRequest(children, resumableState, renderState, rootFormatContext, progressiveChunkSize, onError, onAllReady, onShellReady, onShellError, onFatalError, onPostpone, formState) {
  prepareHostDispatcher();
  const pingedTasks = [];
  const abortSet = new Set();
  const request = {
    destination: null,
    flushScheduled: false,
    resumableState,
    renderState,
    rootFormatContext,
    progressiveChunkSize: progressiveChunkSize === undefined ? DEFAULT_PROGRESSIVE_CHUNK_SIZE : progressiveChunkSize,
    status: OPEN,
    fatalError: null,
    nextSegmentId: 0,
    allPendingTasks: 0,
    pendingRootTasks: 0,
    completedRootSegment: null,
    abortableTasks: abortSet,
    pingedTasks: pingedTasks,
    clientRenderedBoundaries: [],
    completedBoundaries: [],
    partialBoundaries: [],
    trackedPostpones: null,
    onError: onError === undefined ? defaultErrorHandler : onError,
    onPostpone: onPostpone === undefined ? noop : onPostpone,
    onAllReady: onAllReady === undefined ? noop : onAllReady,
    onShellReady: onShellReady === undefined ? noop : onShellReady,
    onShellError: onShellError === undefined ? noop : onShellError,
    onFatalError: onFatalError === undefined ? noop : onFatalError,
    formState: formState === undefined ? null : formState
  }; // This segment represents the root fallback.

  const rootSegment = createPendingSegment(request, 0, null, rootFormatContext, // Root segments are never embedded in Text on either edge
  false, false); // There is no parent so conceptually, we're unblocked to flush this segment.

  rootSegment.parentFlushed = true;
  const rootTask = createRenderTask(request, null, children, -1, null, rootSegment, null, abortSet, null, rootFormatContext, emptyContextObject, rootContextSnapshot, emptyTreeContext, null, false);
  pingedTasks.push(rootTask);
  return request;
}
let currentRequest = null;
function resolveRequest() {
  if (currentRequest) return currentRequest;

  return null;
}

function pingTask(request, task) {
  const pingedTasks = request.pingedTasks;
  pingedTasks.push(task);

  if (request.pingedTasks.length === 1) {
    request.flushScheduled = request.destination !== null;
    scheduleWork(() => performWork(request));
  }
}

function createSuspenseBoundary(request, fallbackAbortableTasks) {
  return {
    status: PENDING,
    rootSegmentID: -1,
    parentFlushed: false,
    pendingTasks: 0,
    completedSegments: [],
    byteSize: 0,
    fallbackAbortableTasks,
    errorDigest: null,
    contentState: createHoistableState(),
    fallbackState: createHoistableState(),
    trackedContentKeyPath: null,
    trackedFallbackNode: null
  };
}

function createRenderTask(request, thenableState, node, childIndex, blockedBoundary, blockedSegment, hoistableState, abortSet, keyPath, formatContext, legacyContext, context, treeContext, componentStack, isFallback) {
  request.allPendingTasks++;

  if (blockedBoundary === null) {
    request.pendingRootTasks++;
  } else {
    blockedBoundary.pendingTasks++;
  }

  const task = {
    replay: null,
    node,
    childIndex,
    ping: () => pingTask(request, task),
    blockedBoundary,
    blockedSegment,
    hoistableState,
    abortSet,
    keyPath,
    formatContext,
    legacyContext,
    context,
    treeContext,
    componentStack,
    thenableState,
    isFallback
  };
  abortSet.add(task);
  return task;
}

function createReplayTask(request, thenableState, replay, node, childIndex, blockedBoundary, hoistableState, abortSet, keyPath, formatContext, legacyContext, context, treeContext, componentStack, isFallback) {
  request.allPendingTasks++;

  if (blockedBoundary === null) {
    request.pendingRootTasks++;
  } else {
    blockedBoundary.pendingTasks++;
  }

  replay.pendingTasks++;
  const task = {
    replay,
    node,
    childIndex,
    ping: () => pingTask(request, task),
    blockedBoundary,
    blockedSegment: null,
    hoistableState,
    abortSet,
    keyPath,
    formatContext,
    legacyContext,
    context,
    treeContext,
    componentStack,
    thenableState,
    isFallback
  };
  abortSet.add(task);
  return task;
}

function createPendingSegment(request, index, boundary, parentFormatContext, lastPushedText, textEmbedded) {
  return {
    status: PENDING,
    id: -1,
    // lazily assigned later
    index,
    parentFlushed: false,
    chunks: [],
    children: [],
    parentFormatContext,
    boundary,
    lastPushedText,
    textEmbedded
  };
} // DEV-only global reference to the currently executing task

function getStackFromNode(stackNode) {
  return getStackByComponentStackNode(stackNode);
}

function createBuiltInComponentStack(task, type) {
  return {
    tag: 0,
    parent: task.componentStack,
    type
  };
}

function createFunctionComponentStack(task, type) {
  return {
    tag: 1,
    parent: task.componentStack,
    type
  };
}

function createClassComponentStack(task, type) {
  return {
    tag: 2,
    parent: task.componentStack,
    type
  };
} // While we track component stacks in prod all the time we only produce a reified stack in dev and
// during prerender in Prod. The reason for this is that the stack is useful for prerender where the timeliness
// of the request is less critical than the observability of the execution. For renders and resumes however we
// prioritize speed of the request.


function getThrownInfo(request, node) {
  if (node && ( // Always produce a stack in dev
  // Produce a stack in prod if we're in a prerender
  request.trackedPostpones !== null)) {
    return {
      componentStack: getStackFromNode(node)
    };
  } else {
    return {};
  }
}

function encodeErrorForBoundary(boundary, digest, error, thrownInfo) {
  boundary.errorDigest = digest;
}

function logRecoverableError(request, error, errorInfo) {
  // If this callback errors, we intentionally let that error bubble up to become a fatal error
  // so that someone fixes the error reporting instead of hiding it.
  const errorDigest = request.onError(error, errorInfo);

  if (errorDigest != null && typeof errorDigest !== 'string') {

    return;
  }

  return errorDigest;
}

function fatalError(request, error) {
  // This is called outside error handling code such as if the root errors outside
  // a suspense boundary or if the root suspense boundary's fallback errors.
  // It's also called if React itself or its host configs errors.
  const onShellError = request.onShellError;
  onShellError(error);
  const onFatalError = request.onFatalError;
  onFatalError(error);

  if (request.destination !== null) {
    request.status = CLOSED;
    closeWithError(request.destination, error);
  } else {
    request.status = CLOSING;
    request.fatalError = error;
  }
}

function renderSuspenseBoundary(request, someTask, keyPath, props) {
  if (someTask.replay !== null) {
    // If we're replaying through this pass, it means we're replaying through
    // an already completed Suspense boundary. It's too late to do anything about it
    // so we can just render through it.
    const prevKeyPath = someTask.keyPath;
    someTask.keyPath = keyPath;
    const content = props.children;

    try {
      renderNode(request, someTask, content, -1);
    } finally {
      someTask.keyPath = prevKeyPath;
    }

    return;
  } // $FlowFixMe: Refined.


  const task = someTask;
  const previousComponentStack = task.componentStack; // If we end up creating the fallback task we need it to have the correct stack which is
  // the stack for the boundary itself. We stash it here so we can use it if needed later

  const suspenseComponentStack = task.componentStack = createBuiltInComponentStack(task, 'Suspense');
  const prevKeyPath = task.keyPath;
  const parentBoundary = task.blockedBoundary;
  const parentHoistableState = task.hoistableState;
  const parentSegment = task.blockedSegment; // Each time we enter a suspense boundary, we split out into a new segment for
  // the fallback so that we can later replace that segment with the content.
  // This also lets us split out the main content even if it doesn't suspend,
  // in case it ends up generating a large subtree of content.

  const fallback = props.fallback;
  const content = props.children;
  const fallbackAbortSet = new Set();
  const newBoundary = createSuspenseBoundary(request, fallbackAbortSet);

  if (request.trackedPostpones !== null) {
    newBoundary.trackedContentKeyPath = keyPath;
  }

  const insertionIndex = parentSegment.chunks.length; // The children of the boundary segment is actually the fallback.

  const boundarySegment = createPendingSegment(request, insertionIndex, newBoundary, task.formatContext, // boundaries never require text embedding at their edges because comment nodes bound them
  false, false);
  parentSegment.children.push(boundarySegment); // The parentSegment has a child Segment at this index so we reset the lastPushedText marker on the parent

  parentSegment.lastPushedText = false; // This segment is the actual child content. We can start rendering that immediately.

  const contentRootSegment = createPendingSegment(request, 0, null, task.formatContext, // boundaries never require text embedding at their edges because comment nodes bound them
  false, false); // We mark the root segment as having its parent flushed. It's not really flushed but there is
  // no parent segment so there's nothing to wait on.

  contentRootSegment.parentFlushed = true; // Currently this is running synchronously. We could instead schedule this to pingedTasks.
  // I suspect that there might be some efficiency benefits from not creating the suspended task
  // and instead just using the stack if possible.
  // TODO: Call this directly instead of messing with saving and restoring contexts.
  // We can reuse the current context and task to render the content immediately without
  // context switching. We just need to temporarily switch which boundary and which segment
  // we're writing to. If something suspends, it'll spawn new suspended task with that context.

  task.blockedBoundary = newBoundary;
  task.hoistableState = newBoundary.contentState;
  task.blockedSegment = contentRootSegment;
  task.keyPath = keyPath;

  try {
    // We use the safe form because we don't handle suspending here. Only error handling.
    renderNode(request, task, content, -1);
    pushSegmentFinale(contentRootSegment.chunks, request.renderState, contentRootSegment.lastPushedText, contentRootSegment.textEmbedded);
    contentRootSegment.status = COMPLETED;
    queueCompletedSegment(newBoundary, contentRootSegment);

    if (newBoundary.pendingTasks === 0 && newBoundary.status === PENDING) {
      // This must have been the last segment we were waiting on. This boundary is now complete.
      // Therefore we won't need the fallback. We early return so that we don't have to create
      // the fallback.
      newBoundary.status = COMPLETED; // We are returning early so we need to restore the

      task.componentStack = previousComponentStack;
      return;
    }
  } catch (error) {
    contentRootSegment.status = ERRORED;
    newBoundary.status = CLIENT_RENDERED;
    const thrownInfo = getThrownInfo(request, task.componentStack);
    let errorDigest;

    {
      errorDigest = logRecoverableError(request, error, thrownInfo);
    }

    encodeErrorForBoundary(newBoundary, errorDigest);
    untrackBoundary(request, newBoundary); // We don't need to decrement any task numbers because we didn't spawn any new task.
    // We don't need to schedule any task because we know the parent has written yet.
    // We do need to fallthrough to create the fallback though.
  } finally {
    task.blockedBoundary = parentBoundary;
    task.hoistableState = parentHoistableState;
    task.blockedSegment = parentSegment;
    task.keyPath = prevKeyPath;
    task.componentStack = previousComponentStack;
  }

  const fallbackKeyPath = [keyPath[0], 'Suspense Fallback', keyPath[2]];
  const trackedPostpones = request.trackedPostpones;

  if (trackedPostpones !== null) {
    // We create a detached replay node to track any postpones inside the fallback.
    const fallbackReplayNode = [fallbackKeyPath[1], fallbackKeyPath[2], [], null];
    trackedPostpones.workingMap.set(fallbackKeyPath, fallbackReplayNode);

    if (newBoundary.status === POSTPONED) {
      // This must exist now.
      const boundaryReplayNode = trackedPostpones.workingMap.get(keyPath);
      boundaryReplayNode[4] = fallbackReplayNode;
    } else {
      // We might not inject it into the postponed tree, unless the content actually
      // postpones too. We need to keep track of it until that happpens.
      newBoundary.trackedFallbackNode = fallbackReplayNode;
    }
  } // We create suspended task for the fallback because we don't want to actually work
  // on it yet in case we finish the main content, so we queue for later.


  const suspendedFallbackTask = createRenderTask(request, null, fallback, -1, parentBoundary, boundarySegment, newBoundary.fallbackState, fallbackAbortSet, fallbackKeyPath, task.formatContext, task.legacyContext, task.context, task.treeContext, // This stack should be the Suspense boundary stack because while the fallback is actually a child segment
  // of the parent boundary from a component standpoint the fallback is a child of the Suspense boundary itself
  suspenseComponentStack, true); // TODO: This should be queued at a separate lower priority queue so that we only work
  // on preparing fallbacks if we don't have any more main content to task on.

  request.pingedTasks.push(suspendedFallbackTask);
}

function replaySuspenseBoundary(request, task, keyPath, props, id, childNodes, childSlots, fallbackNodes, fallbackSlots) {
  const previousComponentStack = task.componentStack; // If we end up creating the fallback task we need it to have the correct stack which is
  // the stack for the boundary itself. We stash it here so we can use it if needed later

  const suspenseComponentStack = task.componentStack = createBuiltInComponentStack(task, 'Suspense');
  const prevKeyPath = task.keyPath;
  const previousReplaySet = task.replay;
  const parentBoundary = task.blockedBoundary;
  const parentHoistableState = task.hoistableState;
  const content = props.children;
  const fallback = props.fallback;
  const fallbackAbortSet = new Set();
  const resumedBoundary = createSuspenseBoundary(request, fallbackAbortSet);
  resumedBoundary.parentFlushed = true; // We restore the same id of this boundary as was used during prerender.

  resumedBoundary.rootSegmentID = id; // We can reuse the current context and task to render the content immediately without
  // context switching. We just need to temporarily switch which boundary and replay node
  // we're writing to. If something suspends, it'll spawn new suspended task with that context.

  task.blockedBoundary = resumedBoundary;
  task.hoistableState = resumedBoundary.contentState;
  task.replay = {
    nodes: childNodes,
    slots: childSlots,
    pendingTasks: 1
  };

  try {
    // We use the safe form because we don't handle suspending here. Only error handling.
    renderNode(request, task, content, -1);

    if (task.replay.pendingTasks === 1 && task.replay.nodes.length > 0) {
      throw Error(formatProdErrorMessage(488));
    }

    task.replay.pendingTasks--;

    if (resumedBoundary.pendingTasks === 0 && resumedBoundary.status === PENDING) {
      // This must have been the last segment we were waiting on. This boundary is now complete.
      // Therefore we won't need the fallback. We early return so that we don't have to create
      // the fallback.
      resumedBoundary.status = COMPLETED;
      request.completedBoundaries.push(resumedBoundary); // We restore the parent componentStack. Semantically this is the same as
      // popComponentStack(task) but we do this instead because it should be slightly
      // faster

      return;
    }
  } catch (error) {
    resumedBoundary.status = CLIENT_RENDERED;
    const thrownInfo = getThrownInfo(request, task.componentStack);
    let errorDigest;

    {
      errorDigest = logRecoverableError(request, error, thrownInfo);
    }

    encodeErrorForBoundary(resumedBoundary, errorDigest);
    task.replay.pendingTasks--; // The parent already flushed in the prerender so we need to schedule this to be emitted.

    request.clientRenderedBoundaries.push(resumedBoundary); // We don't need to decrement any task numbers because we didn't spawn any new task.
    // We don't need to schedule any task because we know the parent has written yet.
    // We do need to fallthrough to create the fallback though.
  } finally {
    task.blockedBoundary = parentBoundary;
    task.hoistableState = parentHoistableState;
    task.replay = previousReplaySet;
    task.keyPath = prevKeyPath;
    task.componentStack = previousComponentStack;
  }

  const fallbackKeyPath = [keyPath[0], 'Suspense Fallback', keyPath[2]]; // We create suspended task for the fallback because we don't want to actually work
  // on it yet in case we finish the main content, so we queue for later.

  const fallbackReplay = {
    nodes: fallbackNodes,
    slots: fallbackSlots,
    pendingTasks: 0
  };
  const suspendedFallbackTask = createReplayTask(request, null, fallbackReplay, fallback, -1, parentBoundary, resumedBoundary.fallbackState, fallbackAbortSet, fallbackKeyPath, task.formatContext, task.legacyContext, task.context, task.treeContext, // This stack should be the Suspense boundary stack because while the fallback is actually a child segment
  // of the parent boundary from a component standpoint the fallback is a child of the Suspense boundary itself
  suspenseComponentStack, true); // TODO: This should be queued at a separate lower priority queue so that we only work
  // on preparing fallbacks if we don't have any more main content to task on.

  request.pingedTasks.push(suspendedFallbackTask);
}

function renderHostElement(request, task, keyPath, type, props) {
  const previousComponentStack = task.componentStack;
  task.componentStack = createBuiltInComponentStack(task, type);
  const segment = task.blockedSegment;

  if (segment === null) {
    // Replay
    const children = props.children; // TODO: Make this a Config for replaying.

    const prevContext = task.formatContext;
    const prevKeyPath = task.keyPath;
    task.formatContext = getChildFormatContext(prevContext, type, props);
    task.keyPath = keyPath; // We use the non-destructive form because if something suspends, we still
    // need to pop back up and finish this subtree of HTML.

    renderNode(request, task, children, -1); // We expect that errors will fatal the whole task and that we don't need
    // the correct context. Therefore this is not in a finally.

    task.formatContext = prevContext;
    task.keyPath = prevKeyPath;
  } else {
    // Render
    const children = pushStartInstance(segment.chunks, type, props, request.resumableState, request.renderState, task.hoistableState, task.formatContext, segment.lastPushedText, task.isFallback);
    segment.lastPushedText = false;
    const prevContext = task.formatContext;
    const prevKeyPath = task.keyPath;
    task.formatContext = getChildFormatContext(prevContext, type, props);
    task.keyPath = keyPath; // We use the non-destructive form because if something suspends, we still
    // need to pop back up and finish this subtree of HTML.

    renderNode(request, task, children, -1); // We expect that errors will fatal the whole task and that we don't need
    // the correct context. Therefore this is not in a finally.

    task.formatContext = prevContext;
    task.keyPath = prevKeyPath;
    pushEndInstance(segment.chunks, type, props, request.resumableState, prevContext);
    segment.lastPushedText = false;
  }

  task.componentStack = previousComponentStack;
}

function shouldConstruct(Component) {
  return Component.prototype && Component.prototype.isReactComponent;
}

function renderWithHooks(request, task, keyPath, Component, props, secondArg) {
  // Reset the task's thenable state before continuing, so that if a later
  // component suspends we can reuse the same task object. If the same
  // component suspends again, the thenable state will be restored.
  const prevThenableState = task.thenableState;
  task.thenableState = null;
  const componentIdentity = {};
  prepareToUseHooks(request, task, keyPath, componentIdentity, prevThenableState);
  const result = Component(props, secondArg);
  return finishHooks(Component, props, result, secondArg);
}

function finishClassComponent(request, task, keyPath, instance, Component, props) {
  const nextChildren = instance.render();

  {
    const childContextTypes = Component.childContextTypes;

    if (childContextTypes !== null && childContextTypes !== undefined) {
      const previousContext = task.legacyContext;
      const mergedContext = processChildContext(instance, Component, previousContext, childContextTypes);
      task.legacyContext = mergedContext;
      renderNodeDestructive(request, task, nextChildren, -1);
      task.legacyContext = previousContext;
      return;
    }
  }

  const prevKeyPath = task.keyPath;
  task.keyPath = keyPath;
  renderNodeDestructive(request, task, nextChildren, -1);
  task.keyPath = prevKeyPath;
}

function renderClassComponent(request, task, keyPath, Component, props) {
  const previousComponentStack = task.componentStack;
  task.componentStack = createClassComponentStack(task, Component);
  const maskedContext = getMaskedContext(Component, task.legacyContext) ;
  const instance = constructClassInstance(Component, props, maskedContext);
  mountClassInstance(instance, Component, props, maskedContext);
  finishClassComponent(request, task, keyPath, instance, Component);
  task.componentStack = previousComponentStack;
}
// components for some reason.

function renderIndeterminateComponent(request, task, keyPath, Component, props) {
  let legacyContext;

  {
    legacyContext = getMaskedContext(Component, task.legacyContext);
  }

  const previousComponentStack = task.componentStack;
  task.componentStack = createFunctionComponentStack(task, Component);

  const value = renderWithHooks(request, task, keyPath, Component, props, legacyContext);
  const hasId = checkDidRenderIdHook();
  const formStateCount = getFormStateCount();
  const formStateMatchingIndex = getFormStateMatchingIndex();

  if ( // Run these checks in production only if the flag is off.
  // Eventually we'll delete this branch altogether.
  typeof value === 'object' && value !== null && typeof value.render === 'function' && value.$$typeof === undefined) {

    mountClassInstance(value, Component, props, legacyContext);
    finishClassComponent(request, task, keyPath, value, Component);
  } else {

    finishFunctionComponent(request, task, keyPath, value, hasId, formStateCount, formStateMatchingIndex);
  }

  task.componentStack = previousComponentStack;
}

function finishFunctionComponent(request, task, keyPath, children, hasId, formStateCount, formStateMatchingIndex) {
  let didEmitFormStateMarkers = false;

  if (formStateCount !== 0 && request.formState !== null) {
    // For each useFormState hook, emit a marker that indicates whether we
    // rendered using the form state passed at the root. We only emit these
    // markers if form state is passed at the root.
    const segment = task.blockedSegment;

    if (segment === null) ; else {
      didEmitFormStateMarkers = true;
      const target = segment.chunks;

      for (let i = 0; i < formStateCount; i++) {
        if (i === formStateMatchingIndex) {
          pushFormStateMarkerIsMatching(target);
        } else {
          pushFormStateMarkerIsNotMatching(target);
        }
      }
    }
  }

  const prevKeyPath = task.keyPath;
  task.keyPath = keyPath;

  if (hasId) {
    // This component materialized an id. We treat this as its own level, with
    // a single "child" slot.
    const prevTreeContext = task.treeContext;
    const totalChildren = 1;
    const index = 0; // Modify the id context. Because we'll need to reset this if something
    // suspends or errors, we'll use the non-destructive render path.

    task.treeContext = pushTreeContext(prevTreeContext, totalChildren, index);
    renderNode(request, task, children, -1); // Like the other contexts, this does not need to be in a finally block
    // because renderNode takes care of unwinding the stack.

    task.treeContext = prevTreeContext;
  } else if (didEmitFormStateMarkers) {
    // If there were formState hooks, we must use the non-destructive path
    // because this component is not a pure indirection; we emitted markers
    // to the stream.
    renderNode(request, task, children, -1);
  } else {
    // We're now successfully past this task, and we haven't modified the
    // context stack. We don't have to pop back to the previous task every
    // again, so we can use the destructive recursive form.
    renderNodeDestructive(request, task, children, -1);
  }

  task.keyPath = prevKeyPath;
}

function resolveDefaultProps(Component, baseProps) {
  if (Component && Component.defaultProps) {
    // Resolve default props. Taken from ReactElement
    const props = assign({}, baseProps);
    const defaultProps = Component.defaultProps;

    for (const propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }

    return props;
  }

  return baseProps;
}

function renderForwardRef(request, task, keyPath, type, props, ref) {
  const previousComponentStack = task.componentStack;
  task.componentStack = createFunctionComponentStack(task, type.render);
  let propsWithoutRef;

  {
    propsWithoutRef = props;
  }

  const children = renderWithHooks(request, task, keyPath, type.render, propsWithoutRef, ref);
  const hasId = checkDidRenderIdHook();
  const formStateCount = getFormStateCount();
  const formStateMatchingIndex = getFormStateMatchingIndex();
  finishFunctionComponent(request, task, keyPath, children, hasId, formStateCount, formStateMatchingIndex);
  task.componentStack = previousComponentStack;
}

function renderMemo(request, task, keyPath, type, props, ref) {
  const innerType = type.type;
  const resolvedProps = resolveDefaultProps(innerType, props);
  renderElement(request, task, keyPath, innerType, resolvedProps, ref);
}

function renderContextConsumer(request, task, keyPath, context, props) {
  const render = props.children;

  const newValue = readContext$1(context);
  const newChildren = render(newValue);
  const prevKeyPath = task.keyPath;
  task.keyPath = keyPath;
  renderNodeDestructive(request, task, newChildren, -1);
  task.keyPath = prevKeyPath;
}

function renderContextProvider(request, task, keyPath, context, props) {
  const value = props.value;
  const children = props.children;

  const prevKeyPath = task.keyPath;
  task.context = pushProvider(context, value);
  task.keyPath = keyPath;
  renderNodeDestructive(request, task, children, -1);
  task.context = popProvider();
  task.keyPath = prevKeyPath;
}

function renderLazyComponent(request, task, keyPath, lazyComponent, props, ref) {
  const previousComponentStack = task.componentStack;
  task.componentStack = createBuiltInComponentStack(task, 'Lazy');
  const payload = lazyComponent._payload;
  const init = lazyComponent._init;
  const Component = init(payload);
  const resolvedProps = resolveDefaultProps(Component, props);
  renderElement(request, task, keyPath, Component, resolvedProps, ref);
  task.componentStack = previousComponentStack;
}

function renderOffscreen(request, task, keyPath, props) {
  const mode = props.mode;

  if (mode === 'hidden') ; else {
    // A visible Offscreen boundary is treated exactly like a fragment: a
    // pure indirection.
    const prevKeyPath = task.keyPath;
    task.keyPath = keyPath;
    renderNodeDestructive(request, task, props.children, -1);
    task.keyPath = prevKeyPath;
  }
}

function renderElement(request, task, keyPath, type, props, ref) {
  if (typeof type === 'function') {
    if (shouldConstruct(type)) {
      renderClassComponent(request, task, keyPath, type, props);
      return;
    } else {
      renderIndeterminateComponent(request, task, keyPath, type, props);
      return;
    }
  }

  if (typeof type === 'string') {
    renderHostElement(request, task, keyPath, type, props);
    return;
  }

  switch (type) {
    // LegacyHidden acts the same as a fragment. This only works because we
    // currently assume that every instance of LegacyHidden is accompanied by a
    // host component wrapper. In the hidden mode, the host component is given a
    // `hidden` attribute, which ensures that the initial HTML is not visible.
    // To support the use of LegacyHidden as a true fragment, without an extra
    // DOM node, we would have to hide the initial HTML in some other way.
    // TODO: Delete in LegacyHidden. It's an unstable API only used in the
    // www build. As a migration step, we could add a special prop to Offscreen
    // that simulates the old behavior (no hiding, no change to effects).
    case REACT_LEGACY_HIDDEN_TYPE:
    case REACT_DEBUG_TRACING_MODE_TYPE:
    case REACT_STRICT_MODE_TYPE:
    case REACT_PROFILER_TYPE:
    case REACT_FRAGMENT_TYPE:
      {
        const prevKeyPath = task.keyPath;
        task.keyPath = keyPath;
        renderNodeDestructive(request, task, props.children, -1);
        task.keyPath = prevKeyPath;
        return;
      }

    case REACT_OFFSCREEN_TYPE:
      {
        renderOffscreen(request, task, keyPath, props);
        return;
      }

    case REACT_SUSPENSE_LIST_TYPE:
      {
        const preiousComponentStack = task.componentStack;
        task.componentStack = createBuiltInComponentStack(task, 'SuspenseList'); // TODO: SuspenseList should control the boundaries.

        const prevKeyPath = task.keyPath;
        task.keyPath = keyPath;
        renderNodeDestructive(request, task, props.children, -1);
        task.keyPath = prevKeyPath;
        task.componentStack = preiousComponentStack;
        return;
      }

    case REACT_SCOPE_TYPE:
      {

        throw Error(formatProdErrorMessage(343));
      }

    case REACT_SUSPENSE_TYPE:
      {
        {
          renderSuspenseBoundary(request, task, keyPath, props);
        }

        return;
      }
  }

  if (typeof type === 'object' && type !== null) {
    switch (type.$$typeof) {
      case REACT_FORWARD_REF_TYPE:
        {
          renderForwardRef(request, task, keyPath, type, props, ref);
          return;
        }

      case REACT_MEMO_TYPE:
        {
          renderMemo(request, task, keyPath, type, props, ref);
          return;
        }

      case REACT_PROVIDER_TYPE:
        {
          {
            const context = type._context;
            renderContextProvider(request, task, keyPath, context, props);
            return;
          } // Fall through

        }

      case REACT_CONTEXT_TYPE:
        {
          {
            let context = type;

            renderContextConsumer(request, task, keyPath, context, props);
            return;
          }
        }

      case REACT_CONSUMER_TYPE:

      case REACT_LAZY_TYPE:
        {
          renderLazyComponent(request, task, keyPath, type, props);
          return;
        }
    }
  }

  let info = '';

  throw Error(formatProdErrorMessage(130, type == null ? type : typeof type, info));
}

function resumeNode(request, task, segmentId, node, childIndex) {
  const prevReplay = task.replay;
  const blockedBoundary = task.blockedBoundary;
  const resumedSegment = createPendingSegment(request, 0, null, task.formatContext, false, false);
  resumedSegment.id = segmentId;
  resumedSegment.parentFlushed = true;

  try {
    // Convert the current ReplayTask to a RenderTask.
    const renderTask = task;
    renderTask.replay = null;
    renderTask.blockedSegment = resumedSegment;
    renderNode(request, task, node, childIndex);
    resumedSegment.status = COMPLETED;

    if (blockedBoundary === null) {
      request.completedRootSegment = resumedSegment;
    } else {
      queueCompletedSegment(blockedBoundary, resumedSegment);

      if (blockedBoundary.parentFlushed) {
        request.partialBoundaries.push(blockedBoundary);
      }
    }
  } finally {
    // Restore to a ReplayTask.
    task.replay = prevReplay;
    task.blockedSegment = null;
  }
}

function replayElement(request, task, keyPath, name, keyOrIndex, childIndex, type, props, ref, replay) {
  // We're replaying. Find the path to follow.
  const replayNodes = replay.nodes;

  for (let i = 0; i < replayNodes.length; i++) {
    // Flow doesn't support refinement on tuples so we do it manually here.
    const node = replayNodes[i];

    if (keyOrIndex !== node[1]) {
      continue;
    }

    if (node.length === 4) {
      // Matched a replayable path.
      // Let's double check that the component name matches as a precaution.
      if (name !== null && name !== node[0]) {
        throw Error(formatProdErrorMessage(490, node[0], name));
      }

      const childNodes = node[2];
      const childSlots = node[3];
      const currentNode = task.node;
      task.replay = {
        nodes: childNodes,
        slots: childSlots,
        pendingTasks: 1
      };

      try {
        renderElement(request, task, keyPath, type, props, ref);

        if (task.replay.pendingTasks === 1 && task.replay.nodes.length > 0 // TODO check remaining slots
        ) {
            throw Error(formatProdErrorMessage(488));
          }

        task.replay.pendingTasks--;
      } catch (x) {
        if (typeof x === 'object' && x !== null && (x === SuspenseException || typeof x.then === 'function')) {
          // Suspend
          if (task.node === currentNode) {
            // This same element suspended so we need to pop the replay we just added.
            task.replay = replay;
          }

          throw x;
        }

        task.replay.pendingTasks--; // Unlike regular render, we don't terminate the siblings if we error
        // during a replay. That's because this component didn't actually error
        // in the original prerender. What's unable to complete is the child
        // replay nodes which might be Suspense boundaries which are able to
        // absorb the error and we can still continue with siblings.

        const thrownInfo = getThrownInfo(request, task.componentStack);
        erroredReplay(request, task.blockedBoundary, x, thrownInfo, childNodes, childSlots);
      }

      task.replay = replay;
    } else {
      // Let's double check that the component type matches.
      if (type !== REACT_SUSPENSE_TYPE) {
        const expectedType = 'Suspense';
        throw Error(formatProdErrorMessage(490, expectedType, getComponentNameFromType(type) || 'Unknown'));
      } // Matched a replayable path.


      replaySuspenseBoundary(request, task, keyPath, props, node[5], node[2], node[3], node[4] === null ? [] : node[4][2], node[4] === null ? null : node[4][3]);
    } // We finished rendering this node, so now we can consume this
    // slot. This must happen after in case we rerender this task.


    replayNodes.splice(i, 1);
    return;
  } // We didn't find any matching nodes. We assume that this element was already
  // rendered in the prelude and skip it.

} // $FlowFixMe[missing-local-annot]
// to update the current execution state.


function renderNodeDestructive(request, task, node, childIndex) {
  if (task.replay !== null && typeof task.replay.slots === 'number') {
    // TODO: Figure out a cheaper place than this hot path to do this check.
    const resumeSegmentID = task.replay.slots;
    resumeNode(request, task, resumeSegmentID, node, childIndex);
    return;
  } // Stash the node we're working on. We'll pick up from this task in case
  // something suspends.


  task.node = node;
  task.childIndex = childIndex;

  if (node === null) {
    return;
  } // Handle object types


  if (typeof node === 'object') {
    switch (node.$$typeof) {
      case REACT_ELEMENT_TYPE:
        {
          const element = node;
          const type = element.type;
          const key = element.key;
          const props = element.props;
          let ref;

          {
            ref = element.ref;
          }

          const name = getComponentNameFromType(type);
          const keyOrIndex = key == null ? childIndex === -1 ? 0 : childIndex : key;
          const keyPath = [task.keyPath, name, keyOrIndex];

          if (task.replay !== null) {
            replayElement(request, task, keyPath, name, keyOrIndex, childIndex, type, props, ref, task.replay); // No matches found for this node. We assume it's already emitted in the
            // prelude and skip it during the replay.
          } else {
            // We're doing a plain render.
            renderElement(request, task, keyPath, type, props, ref);
          }

          return;
        }

      case REACT_PORTAL_TYPE:
        throw Error(formatProdErrorMessage(257));

      case REACT_LAZY_TYPE:
        {
          const previousComponentStack = task.componentStack;
          task.componentStack = createBuiltInComponentStack(task, 'Lazy');
          const lazyNode = node;
          const payload = lazyNode._payload;
          const init = lazyNode._init;
          const resolvedNode = init(payload); // We restore the stack before rendering the resolved node because once the Lazy
          // has resolved any future errors

          task.componentStack = previousComponentStack; // Now we render the resolved node

          renderNodeDestructive(request, task, resolvedNode, childIndex);
          return;
        }
    }

    if (isArray(node)) {
      renderChildrenArray(request, task, node, childIndex);
      return;
    }

    const iteratorFn = getIteratorFn(node);

    if (iteratorFn) {

      const iterator = iteratorFn.call(node);

      if (iterator) {
        // We need to know how many total children are in this set, so that we
        // can allocate enough id slots to acommodate them. So we must exhaust
        // the iterator before we start recursively rendering the children.
        // TODO: This is not great but I think it's inherent to the id
        // generation algorithm.
        let step = iterator.next(); // If there are not entries, we need to push an empty so we start by checking that.

        if (!step.done) {
          const children = [];

          do {
            children.push(step.value);
            step = iterator.next();
          } while (!step.done);

          renderChildrenArray(request, task, children, childIndex);
          return;
        }

        return;
      }
    } // Usables are a valid React node type. When React encounters a Usable in
    // a child position, it unwraps it using the same algorithm as `use`. For
    // example, for promises, React will throw an exception to unwind the
    // stack, then replay the component once the promise resolves.
    //
    // A difference from `use` is that React will keep unwrapping the value
    // until it reaches a non-Usable type.
    //
    // e.g. Usable<Usable<Usable<T>>> should resolve to T


    const maybeUsable = node;

    if (typeof maybeUsable.then === 'function') {
      // Clear any previous thenable state that was created by the unwrapping.
      task.thenableState = null;
      const thenable = maybeUsable;
      return renderNodeDestructive(request, task, unwrapThenable(thenable), childIndex);
    }

    if (maybeUsable.$$typeof === REACT_CONTEXT_TYPE) {
      const context = maybeUsable;
      return renderNodeDestructive(request, task, readContext$1(context), childIndex);
    } // $FlowFixMe[method-unbinding]


    const childString = Object.prototype.toString.call(node);
    throw Error(formatProdErrorMessage(31, childString === '[object Object]' ? 'object with keys {' + Object.keys(node).join(', ') + '}' : childString));
  }

  if (typeof node === 'string') {
    const segment = task.blockedSegment;

    if (segment === null) ; else {
      segment.lastPushedText = pushTextInstance(segment.chunks, node, request.renderState, segment.lastPushedText);
    }

    return;
  }

  if (typeof node === 'number') {
    const segment = task.blockedSegment;

    if (segment === null) ; else {
      segment.lastPushedText = pushTextInstance(segment.chunks, '' + node, request.renderState, segment.lastPushedText);
    }

    return;
  }
}

function replayFragment(request, task, children, childIndex) {
  // If we're supposed follow this array, we'd expect to see a ReplayNode matching
  // this fragment.
  const replay = task.replay;
  const replayNodes = replay.nodes;

  for (let j = 0; j < replayNodes.length; j++) {
    const node = replayNodes[j];

    if (node[1] !== childIndex) {
      continue;
    } // Matched a replayable path.


    const childNodes = node[2];
    const childSlots = node[3];
    task.replay = {
      nodes: childNodes,
      slots: childSlots,
      pendingTasks: 1
    };

    try {
      renderChildrenArray(request, task, children, -1);

      if (task.replay.pendingTasks === 1 && task.replay.nodes.length > 0) {
        throw Error(formatProdErrorMessage(488));
      }

      task.replay.pendingTasks--;
    } catch (x) {
      if (typeof x === 'object' && x !== null && (x === SuspenseException || typeof x.then === 'function')) {
        // Suspend
        throw x;
      }

      task.replay.pendingTasks--; // Unlike regular render, we don't terminate the siblings if we error
      // during a replay. That's because this component didn't actually error
      // in the original prerender. What's unable to complete is the child
      // replay nodes which might be Suspense boundaries which are able to
      // absorb the error and we can still continue with siblings.
      // This is an error, stash the component stack if it is null.

      const thrownInfo = getThrownInfo(request, task.componentStack);
      erroredReplay(request, task.blockedBoundary, x, thrownInfo, childNodes, childSlots);
    }

    task.replay = replay; // We finished rendering this node, so now we can consume this
    // slot. This must happen after in case we rerender this task.

    replayNodes.splice(j, 1);
    break;
  }
}

function renderChildrenArray(request, task, children, childIndex) {
  const prevKeyPath = task.keyPath;

  if (childIndex !== -1) {
    task.keyPath = [task.keyPath, 'Fragment', childIndex];

    if (task.replay !== null) {
      replayFragment(request, // $FlowFixMe: Refined.
      task, children, childIndex);
      task.keyPath = prevKeyPath;
      return;
    }
  }

  const prevTreeContext = task.treeContext;
  const totalChildren = children.length;

  if (task.replay !== null) {
    // Replay
    // First we need to check if we have any resume slots at this level.
    const resumeSlots = task.replay.slots;

    if (resumeSlots !== null && typeof resumeSlots === 'object') {
      for (let i = 0; i < totalChildren; i++) {
        const node = children[i];
        task.treeContext = pushTreeContext(prevTreeContext, totalChildren, i); // We need to use the non-destructive form so that we can safely pop back
        // up and render the sibling if something suspends.

        const resumeSegmentID = resumeSlots[i]; // TODO: If this errors we should still continue with the next sibling.

        if (typeof resumeSegmentID === 'number') {
          resumeNode(request, task, resumeSegmentID, node, i); // We finished rendering this node, so now we can consume this
          // slot. This must happen after in case we rerender this task.

          delete resumeSlots[i];
        } else {
          renderNode(request, task, node, i);
        }
      }

      task.treeContext = prevTreeContext;
      task.keyPath = prevKeyPath;
      return;
    }
  }

  for (let i = 0; i < totalChildren; i++) {
    const node = children[i];
    task.treeContext = pushTreeContext(prevTreeContext, totalChildren, i); // We need to use the non-destructive form so that we can safely pop back
    // up and render the sibling if something suspends.

    renderNode(request, task, node, i);
  } // Because this context is always set right before rendering every child, we
  // only need to reset it to the previous value at the very end.


  task.treeContext = prevTreeContext;
  task.keyPath = prevKeyPath;
}
// resume it.


function untrackBoundary(request, boundary) {
  const trackedPostpones = request.trackedPostpones;

  if (trackedPostpones === null) {
    return;
  }

  const boundaryKeyPath = boundary.trackedContentKeyPath;

  if (boundaryKeyPath === null) {
    return;
  }

  const boundaryNode = trackedPostpones.workingMap.get(boundaryKeyPath);

  if (boundaryNode === undefined) {
    return;
  } // Downgrade to plain ReplayNode since we won't replay through it.
  // $FlowFixMe[cannot-write]: We intentionally downgrade this to the other tuple.


  boundaryNode.length = 4; // Remove any resumable slots.

  boundaryNode[2] = [];
  boundaryNode[3] = null; // TODO: We should really just remove the boundary from all parent paths too so
  // we don't replay the path to it.
}

function spawnNewSuspendedReplayTask(request, task, thenableState, x) {
  const newTask = createReplayTask(request, thenableState, task.replay, task.node, task.childIndex, task.blockedBoundary, task.hoistableState, task.abortSet, task.keyPath, task.formatContext, task.legacyContext, task.context, task.treeContext, // We pop one task off the stack because the node that suspended will be tried again,
  // which will add it back onto the stack.
  task.componentStack !== null ? task.componentStack.parent : null, task.isFallback);
  const ping = newTask.ping;
  x.then(ping, ping);
}

function spawnNewSuspendedRenderTask(request, task, thenableState, x) {
  // Something suspended, we'll need to create a new segment and resolve it later.
  const segment = task.blockedSegment;
  const insertionIndex = segment.chunks.length;
  const newSegment = createPendingSegment(request, insertionIndex, null, task.formatContext, // Adopt the parent segment's leading text embed
  segment.lastPushedText, // Assume we are text embedded at the trailing edge
  true);
  segment.children.push(newSegment); // Reset lastPushedText for current Segment since the new Segment "consumed" it

  segment.lastPushedText = false;
  const newTask = createRenderTask(request, thenableState, task.node, task.childIndex, task.blockedBoundary, newSegment, task.hoistableState, task.abortSet, task.keyPath, task.formatContext, task.legacyContext, task.context, task.treeContext, // We pop one task off the stack because the node that suspended will be tried again,
  // which will add it back onto the stack.
  task.componentStack !== null ? task.componentStack.parent : null, task.isFallback);
  const ping = newTask.ping;
  x.then(ping, ping);
} // This is a non-destructive form of rendering a node. If it suspends it spawns
// a new task and restores the context of this task to what it was before.


function renderNode(request, task, node, childIndex) {
  // Snapshot the current context in case something throws to interrupt the
  // process.
  const previousFormatContext = task.formatContext;
  const previousLegacyContext = task.legacyContext;
  const previousContext = task.context;
  const previousKeyPath = task.keyPath;
  const previousTreeContext = task.treeContext;
  const previousComponentStack = task.componentStack;
  let x; // Store how much we've pushed at this point so we can reset it in case something
  // suspended partially through writing something.

  const segment = task.blockedSegment;

  if (segment === null) {
    // Replay
    try {
      return renderNodeDestructive(request, task, node, childIndex);
    } catch (thrownValue) {
      resetHooksState();
      x = thrownValue === SuspenseException ? // This is a special type of exception used for Suspense. For historical
      // reasons, the rest of the Suspense implementation expects the thrown
      // value to be a thenable, because before `use` existed that was the
      // (unstable) API for suspending. This implementation detail can change
      // later, once we deprecate the old API in favor of `use`.
      getSuspendedThenable() : thrownValue;

      if (typeof x === 'object' && x !== null) {
        // $FlowFixMe[method-unbinding]
        if (typeof x.then === 'function') {
          const wakeable = x;
          const thenableState = getThenableStateAfterSuspending();
          spawnNewSuspendedReplayTask(request, // $FlowFixMe: Refined.
          task, thenableState, wakeable); // Restore the context. We assume that this will be restored by the inner
          // functions in case nothing throws so we don't use "finally" here.

          task.formatContext = previousFormatContext;
          task.legacyContext = previousLegacyContext;
          task.context = previousContext;
          task.keyPath = previousKeyPath;
          task.treeContext = previousTreeContext;
          task.componentStack = previousComponentStack; // Restore all active ReactContexts to what they were before.

          switchContext(previousContext);
          return;
        }
      } // TODO: Abort any undiscovered Suspense boundaries in the ReplayNode.

    }
  } else {
    // Render
    const childrenLength = segment.children.length;
    const chunkLength = segment.chunks.length;

    try {
      return renderNodeDestructive(request, task, node, childIndex);
    } catch (thrownValue) {
      resetHooksState(); // Reset the write pointers to where we started.

      segment.children.length = childrenLength;
      segment.chunks.length = chunkLength;
      x = thrownValue === SuspenseException ? // This is a special type of exception used for Suspense. For historical
      // reasons, the rest of the Suspense implementation expects the thrown
      // value to be a thenable, because before `use` existed that was the
      // (unstable) API for suspending. This implementation detail can change
      // later, once we deprecate the old API in favor of `use`.
      getSuspendedThenable() : thrownValue;

      if (typeof x === 'object' && x !== null) {
        // $FlowFixMe[method-unbinding]
        if (typeof x.then === 'function') {
          const wakeable = x;
          const thenableState = getThenableStateAfterSuspending();
          spawnNewSuspendedRenderTask(request, // $FlowFixMe: Refined.
          task, thenableState, wakeable); // Restore the context. We assume that this will be restored by the inner
          // functions in case nothing throws so we don't use "finally" here.

          task.formatContext = previousFormatContext;
          task.legacyContext = previousLegacyContext;
          task.context = previousContext;
          task.keyPath = previousKeyPath;
          task.treeContext = previousTreeContext;
          task.componentStack = previousComponentStack; // Restore all active ReactContexts to what they were before.

          switchContext(previousContext);
          return;
        }
      }
    }
  } // Restore the context. We assume that this will be restored by the inner
  // functions in case nothing throws so we don't use "finally" here.


  task.formatContext = previousFormatContext;
  task.legacyContext = previousLegacyContext;
  task.context = previousContext;
  task.keyPath = previousKeyPath;
  task.treeContext = previousTreeContext; // We intentionally do not restore the component stack on the error pathway
  // Whatever handles the error needs to use this stack which is the location of the
  // error. We must restore the stack wherever we handle this
  // Restore all active ReactContexts to what they were before.

  switchContext(previousContext);
  throw x;
}

function erroredReplay(request, boundary, error, errorInfo, replayNodes, resumeSlots) {
  // Erroring during a replay doesn't actually cause an error by itself because
  // that component has already rendered. What causes the error is the resumable
  // points that we did not yet finish which will be below the point of the reset.
  // For example, if we're replaying a path to a Suspense boundary that is not done
  // that doesn't error the parent Suspense boundary.
  // This might be a bit strange that the error in a parent gets thrown at a child.
  // We log it only once and reuse the digest.
  let errorDigest;

  {
    errorDigest = logRecoverableError(request, error, errorInfo);
  }

  abortRemainingReplayNodes(request, boundary, replayNodes, resumeSlots, error, errorDigest);
}

function erroredTask(request, boundary, error, errorInfo) {
  // Report the error to a global handler.
  let errorDigest;

  {
    errorDigest = logRecoverableError(request, error, errorInfo);
  }

  if (boundary === null) {
    fatalError(request, error);
  } else {
    boundary.pendingTasks--;

    if (boundary.status !== CLIENT_RENDERED) {
      boundary.status = CLIENT_RENDERED;
      encodeErrorForBoundary(boundary, errorDigest);
      untrackBoundary(request, boundary); // Regardless of what happens next, this boundary won't be displayed,
      // so we can flush it, if the parent already flushed.

      if (boundary.parentFlushed) {
        // We don't have a preference where in the queue this goes since it's likely
        // to error on the client anyway. However, intentionally client-rendered
        // boundaries should be flushed earlier so that they can start on the client.
        // We reuse the same queue for errors.
        request.clientRenderedBoundaries.push(boundary);
      }
    }
  }

  request.allPendingTasks--;

  if (request.allPendingTasks === 0) {
    completeAll(request);
  }
}

function abortTaskSoft(task) {
  // This aborts task without aborting the parent boundary that it blocks.
  // It's used for when we didn't need this task to complete the tree.
  // If task was needed, then it should use abortTask instead.
  const request = this;
  const boundary = task.blockedBoundary;
  const segment = task.blockedSegment;

  if (segment !== null) {
    segment.status = ABORTED;
    finishedTask(request, boundary, segment);
  }
}

function abortRemainingSuspenseBoundary(request, rootSegmentID, error, errorDigest, errorInfo) {
  const resumedBoundary = createSuspenseBoundary(request, new Set());
  resumedBoundary.parentFlushed = true; // We restore the same id of this boundary as was used during prerender.

  resumedBoundary.rootSegmentID = rootSegmentID;
  resumedBoundary.status = CLIENT_RENDERED;

  encodeErrorForBoundary(resumedBoundary, errorDigest);

  if (resumedBoundary.parentFlushed) {
    request.clientRenderedBoundaries.push(resumedBoundary);
  }
}

function abortRemainingReplayNodes(request, boundary, nodes, slots, error, errorDigest, errorInfo) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.length === 4) {
      abortRemainingReplayNodes(request, boundary, node[2], node[3], error, errorDigest);
    } else {
      const boundaryNode = node;
      const rootSegmentID = boundaryNode[5];
      abortRemainingSuspenseBoundary(request, rootSegmentID, error, errorDigest);
    }
  } // Empty the set, since we've cleared it now.


  nodes.length = 0;

  if (slots !== null) {
    // We had something still to resume in the parent boundary. We must trigger
    // the error on the parent boundary since it's not able to complete.
    if (boundary === null) {
      throw Error(formatProdErrorMessage(487));
    } else if (boundary.status !== CLIENT_RENDERED) {
      boundary.status = CLIENT_RENDERED;
      encodeErrorForBoundary(boundary, errorDigest);

      if (boundary.parentFlushed) {
        request.clientRenderedBoundaries.push(boundary);
      }
    } // Empty the set


    if (typeof slots === 'object') {
      for (const index in slots) {
        delete slots[index];
      }
    }
  }
}

function abortTask(task, request, error) {
  // This aborts the task and aborts the parent that it blocks, putting it into
  // client rendered mode.
  const boundary = task.blockedBoundary;
  const segment = task.blockedSegment;

  if (segment !== null) {
    segment.status = ABORTED;
  }

  if (boundary === null) {
    const errorInfo = {};

    if (request.status !== CLOSING && request.status !== CLOSED) {
      const replay = task.replay;

      if (replay === null) {
        // We didn't complete the root so we have nothing to show. We can close
        // the request;
        {
          logRecoverableError(request, error, errorInfo);
          fatalError(request, error);
        }

        return;
      } else {
        // If the shell aborts during a replay, that's not a fatal error. Instead
        // we should be able to recover by client rendering all the root boundaries in
        // the ReplaySet.
        replay.pendingTasks--;

        if (replay.pendingTasks === 0 && replay.nodes.length > 0) {
          let errorDigest;

          {
            errorDigest = logRecoverableError(request, error, errorInfo);
          }

          abortRemainingReplayNodes(request, null, replay.nodes, replay.slots, error, errorDigest);
        }

        request.pendingRootTasks--;

        if (request.pendingRootTasks === 0) {
          completeShell(request);
        }
      }
    }
  } else {
    boundary.pendingTasks--;

    if (boundary.status !== CLIENT_RENDERED) {
      boundary.status = CLIENT_RENDERED; // We construct an errorInfo from the boundary's componentStack so the error in dev will indicate which
      // boundary the message is referring to

      const errorInfo = getThrownInfo(request, task.componentStack);
      let errorDigest;

      {
        errorDigest = logRecoverableError(request, error, errorInfo);
      }

      encodeErrorForBoundary(boundary, errorDigest);
      untrackBoundary(request, boundary);

      if (boundary.parentFlushed) {
        request.clientRenderedBoundaries.push(boundary);
      }
    } // If this boundary was still pending then we haven't already cancelled its fallbacks.
    // We'll need to abort the fallbacks, which will also error that parent boundary.


    boundary.fallbackAbortableTasks.forEach(fallbackTask => abortTask(fallbackTask, request, error));
    boundary.fallbackAbortableTasks.clear();
  }

  request.allPendingTasks--;

  if (request.allPendingTasks === 0) {
    completeAll(request);
  }
}

function safelyEmitEarlyPreloads(request, shellComplete) {
  try {
    emitEarlyPreloads(request.renderState, request.resumableState, shellComplete);
  } catch (error) {
    // We assume preloads are optimistic and thus non-fatal if errored.
    const errorInfo = {};
    logRecoverableError(request, error, errorInfo);
  }
} // I extracted this function out because we want to ensure we consistently emit preloads before
// transitioning to the next request stage and this transition can happen in multiple places in this
// implementation.


function completeShell(request) {
  if (request.trackedPostpones === null) {
    // We only emit early preloads on shell completion for renders. For prerenders
    // we wait for the entire Request to finish because we are not responding to a
    // live request and can wait for as much data as possible.
    // we should only be calling completeShell when the shell is complete so we
    // just use a literal here
    const shellComplete = true;
    safelyEmitEarlyPreloads(request, shellComplete);
  } // We have completed the shell so the shell can't error anymore.


  request.onShellError = noop;
  const onShellReady = request.onShellReady;
  onShellReady();
} // I extracted this function out because we want to ensure we consistently emit preloads before
// transitioning to the next request stage and this transition can happen in multiple places in this
// implementation.


function completeAll(request) {
  // During a render the shell must be complete if the entire request is finished
  // however during a Prerender it is possible that the shell is incomplete because
  // it postponed. We cannot use rootPendingTasks in the prerender case because
  // those hit zero even when the shell postpones. Instead we look at the completedRootSegment
  const shellComplete = request.trackedPostpones === null ? // Render, we assume it is completed
  true : // Prerender Request, we use the state of the root segment
  request.completedRootSegment === null || request.completedRootSegment.status !== POSTPONED;
  safelyEmitEarlyPreloads(request, shellComplete);
  const onAllReady = request.onAllReady;
  onAllReady();
}

function queueCompletedSegment(boundary, segment) {
  if (segment.chunks.length === 0 && segment.children.length === 1 && segment.children[0].boundary === null && segment.children[0].id === -1) {
    // This is an empty segment. There's nothing to write, so we can instead transfer the ID
    // to the child. That way any existing references point to the child.
    const childSegment = segment.children[0];
    childSegment.id = segment.id;
    childSegment.parentFlushed = true;

    if (childSegment.status === COMPLETED) {
      queueCompletedSegment(boundary, childSegment);
    }
  } else {
    const completedSegments = boundary.completedSegments;
    completedSegments.push(segment);
  }
}

function finishedTask(request, boundary, segment) {
  if (boundary === null) {
    if (segment !== null && segment.parentFlushed) {
      if (request.completedRootSegment !== null) {
        throw Error(formatProdErrorMessage(389));
      }

      request.completedRootSegment = segment;
    }

    request.pendingRootTasks--;

    if (request.pendingRootTasks === 0) {
      completeShell(request);
    }
  } else {
    boundary.pendingTasks--;

    if (boundary.status === CLIENT_RENDERED) ; else if (boundary.pendingTasks === 0) {
      if (boundary.status === PENDING) {
        boundary.status = COMPLETED;
      } // This must have been the last segment we were waiting on. This boundary is now complete.


      if (segment !== null && segment.parentFlushed) {
        // Our parent segment already flushed, so we need to schedule this segment to be emitted.
        // If it is a segment that was aborted, we'll write other content instead so we don't need
        // to emit it.
        if (segment.status === COMPLETED) {
          queueCompletedSegment(boundary, segment);
        }
      }

      if (boundary.parentFlushed) {
        // The segment might be part of a segment that didn't flush yet, but if the boundary's
        // parent flushed, we need to schedule the boundary to be emitted.
        request.completedBoundaries.push(boundary);
      } // We can now cancel any pending task on the fallback since we won't need to show it anymore.
      // This needs to happen after we read the parentFlushed flags because aborting can finish
      // work which can trigger user code, which can start flushing, which can change those flags.
      // If the boundary was POSTPONED, we still need to finish the fallback first.


      if (boundary.status === COMPLETED) {
        boundary.fallbackAbortableTasks.forEach(abortTaskSoft, request);
        boundary.fallbackAbortableTasks.clear();
      }
    } else {
      if (segment !== null && segment.parentFlushed) {
        // Our parent already flushed, so we need to schedule this segment to be emitted.
        // If it is a segment that was aborted, we'll write other content instead so we don't need
        // to emit it.
        if (segment.status === COMPLETED) {
          queueCompletedSegment(boundary, segment);
          const completedSegments = boundary.completedSegments;

          if (completedSegments.length === 1) {
            // This is the first time since we last flushed that we completed anything.
            // We can schedule this boundary to emit its partially completed segments early
            // in case the parent has already been flushed.
            if (boundary.parentFlushed) {
              request.partialBoundaries.push(boundary);
            }
          }
        }
      }
    }
  }

  request.allPendingTasks--;

  if (request.allPendingTasks === 0) {
    completeAll(request);
  }
}

function retryTask(request, task) {
  const segment = task.blockedSegment;

  if (segment === null) {
    retryReplayTask(request, // $FlowFixMe: Refined.
    task);
  } else {
    retryRenderTask(request, // $FlowFixMe: Refined.
    task, segment);
  }
}

function retryRenderTask(request, task, segment) {
  if (segment.status !== PENDING) {
    // We completed this by other means before we had a chance to retry it.
    return;
  } // We restore the context to what it was when we suspended.
  // We don't restore it after we leave because it's likely that we'll end up
  // needing a very similar context soon again.


  switchContext(task.context);

  const childrenLength = segment.children.length;
  const chunkLength = segment.chunks.length;

  try {
    // We call the destructive form that mutates this task. That way if something
    // suspends again, we can reuse the same task instead of spawning a new one.
    renderNodeDestructive(request, task, task.node, task.childIndex);
    pushSegmentFinale(segment.chunks, request.renderState, segment.lastPushedText, segment.textEmbedded);
    task.abortSet.delete(task);
    segment.status = COMPLETED;
    finishedTask(request, task.blockedBoundary, segment);
  } catch (thrownValue) {
    resetHooksState(); // Reset the write pointers to where we started.

    segment.children.length = childrenLength;
    segment.chunks.length = chunkLength;
    const x = thrownValue === SuspenseException ? // This is a special type of exception used for Suspense. For historical
    // reasons, the rest of the Suspense implementation expects the thrown
    // value to be a thenable, because before `use` existed that was the
    // (unstable) API for suspending. This implementation detail can change
    // later, once we deprecate the old API in favor of `use`.
    getSuspendedThenable() : thrownValue;

    if (typeof x === 'object' && x !== null) {
      // $FlowFixMe[method-unbinding]
      if (typeof x.then === 'function') {
        // Something suspended again, let's pick it back up later.
        const ping = task.ping;
        x.then(ping, ping);
        task.thenableState = getThenableStateAfterSuspending();
        return;
      }
    }

    const errorInfo = getThrownInfo(request, task.componentStack);
    task.abortSet.delete(task);
    segment.status = ERRORED;
    erroredTask(request, task.blockedBoundary, x, errorInfo);
    return;
  } finally {
  }
}

function retryReplayTask(request, task) {
  if (task.replay.pendingTasks === 0) {
    // There are no pending tasks working on this set, so we must have aborted.
    return;
  } // We restore the context to what it was when we suspended.
  // We don't restore it after we leave because it's likely that we'll end up
  // needing a very similar context soon again.


  switchContext(task.context);

  try {
    // We call the destructive form that mutates this task. That way if something
    // suspends again, we can reuse the same task instead of spawning a new one.
    renderNodeDestructive(request, task, task.node, task.childIndex);

    if (task.replay.pendingTasks === 1 && task.replay.nodes.length > 0) {
      throw Error(formatProdErrorMessage(488));
    }

    task.replay.pendingTasks--;
    task.abortSet.delete(task);
    finishedTask(request, task.blockedBoundary, null);
  } catch (thrownValue) {
    resetHooksState();
    const x = thrownValue === SuspenseException ? // This is a special type of exception used for Suspense. For historical
    // reasons, the rest of the Suspense implementation expects the thrown
    // value to be a thenable, because before `use` existed that was the
    // (unstable) API for suspending. This implementation detail can change
    // later, once we deprecate the old API in favor of `use`.
    getSuspendedThenable() : thrownValue;

    if (typeof x === 'object' && x !== null) {
      // $FlowFixMe[method-unbinding]
      if (typeof x.then === 'function') {
        // Something suspended again, let's pick it back up later.
        const ping = task.ping;
        x.then(ping, ping);
        task.thenableState = getThenableStateAfterSuspending();
        return;
      }
    }

    task.replay.pendingTasks--;
    task.abortSet.delete(task);
    const errorInfo = getThrownInfo(request, task.componentStack);
    erroredReplay(request, task.blockedBoundary, x, errorInfo, task.replay.nodes, task.replay.slots);
    request.pendingRootTasks--;

    if (request.pendingRootTasks === 0) {
      completeShell(request);
    }

    request.allPendingTasks--;

    if (request.allPendingTasks === 0) {
      completeAll(request);
    }

    return;
  } finally {
  }
}

function performWork(request) {
  if (request.status === CLOSED) {
    return;
  }

  const prevContext = getActiveContext();
  const prevDispatcher = ReactCurrentDispatcher.current;
  ReactCurrentDispatcher.current = HooksDispatcher;
  let prevCacheDispatcher;

  {
    prevCacheDispatcher = ReactCurrentCache.current;
    ReactCurrentCache.current = DefaultCacheDispatcher;
  }

  const prevRequest = currentRequest;
  currentRequest = request;

  const prevResumableState = currentResumableState;
  setCurrentResumableState(request.resumableState);

  try {
    const pingedTasks = request.pingedTasks;
    let i;

    for (i = 0; i < pingedTasks.length; i++) {
      const task = pingedTasks[i];
      retryTask(request, task);
    }

    pingedTasks.splice(0, i);

    if (request.destination !== null) {
      flushCompletedQueues(request, request.destination);
    }
  } catch (error) {
    const errorInfo = {};
    logRecoverableError(request, error, errorInfo);
    fatalError(request, error);
  } finally {
    setCurrentResumableState(prevResumableState);
    ReactCurrentDispatcher.current = prevDispatcher;

    {
      ReactCurrentCache.current = prevCacheDispatcher;
    }

    if (prevDispatcher === HooksDispatcher) {
      // This means that we were in a reentrant work loop. This could happen
      // in a renderer that supports synchronous work like renderToString,
      // when it's called from within another renderer.
      // Normally we don't bother switching the contexts to their root/default
      // values when leaving because we'll likely need the same or similar
      // context again. However, when we're inside a synchronous loop like this
      // we'll to restore the context to what it was before returning.
      switchContext(prevContext);
    }

    currentRequest = prevRequest;
  }
}

function flushPreamble(request, destination, rootSegment) {
  const willFlushAllSegments = request.allPendingTasks === 0 && request.trackedPostpones === null;
  writePreamble(destination, request.resumableState, request.renderState, willFlushAllSegments);
}

function flushSubtree(request, destination, segment, hoistableState) {
  segment.parentFlushed = true;

  switch (segment.status) {
    case PENDING:
      {
        // We're emitting a placeholder for this segment to be filled in later.
        // Therefore we'll need to assign it an ID - to refer to it by.
        segment.id = request.nextSegmentId++; // Fallthrough
      }

    case POSTPONED:
      {
        const segmentID = segment.id; // When this segment finally completes it won't be embedded in text since it will flush separately

        segment.lastPushedText = false;
        segment.textEmbedded = false;
        return writePlaceholder(destination, request.renderState, segmentID);
      }

    case COMPLETED:
      {
        segment.status = FLUSHED;
        let r = true;
        const chunks = segment.chunks;
        let chunkIdx = 0;
        const children = segment.children;

        for (let childIdx = 0; childIdx < children.length; childIdx++) {
          const nextChild = children[childIdx]; // Write all the chunks up until the next child.

          for (; chunkIdx < nextChild.index; chunkIdx++) {
            writeChunk(destination, chunks[chunkIdx]);
          }

          r = flushSegment(request, destination, nextChild, hoistableState);
        } // Finally just write all the remaining chunks


        for (; chunkIdx < chunks.length - 1; chunkIdx++) {
          writeChunk(destination, chunks[chunkIdx]);
        }

        if (chunkIdx < chunks.length) {
          r = writeChunkAndReturn(destination, chunks[chunkIdx]);
        }

        return r;
      }

    default:
      {
        throw Error(formatProdErrorMessage(390));
      }
  }
}

function flushSegment(request, destination, segment, hoistableState) {
  const boundary = segment.boundary;

  if (boundary === null) {
    // Not a suspense boundary.
    return flushSubtree(request, destination, segment, hoistableState);
  }

  boundary.parentFlushed = true; // This segment is a Suspense boundary. We need to decide whether to
  // emit the content or the fallback now.

  if (boundary.status === CLIENT_RENDERED) {
    // Emit a client rendered suspense boundary wrapper.
    // We never queue the inner boundary so we'll never emit its content or partial segments.
    writeStartClientRenderedSuspenseBoundary(destination, request.renderState, boundary.errorDigest); // Flush the fallback.

    flushSubtree(request, destination, segment, hoistableState);
    return writeEndClientRenderedSuspenseBoundary(destination, request.renderState);
  } else if (boundary.status !== COMPLETED) {
    if (boundary.status === PENDING) {
      // For pending boundaries we lazily assign an ID to the boundary
      // and root segment.
      boundary.rootSegmentID = request.nextSegmentId++;
    }

    if (boundary.completedSegments.length > 0) {
      // If this is at least partially complete, we can queue it to be partially emitted early.
      request.partialBoundaries.push(boundary);
    } // This boundary is still loading. Emit a pending suspense boundary wrapper.


    const id = boundary.rootSegmentID;
    writeStartPendingSuspenseBoundary(destination, request.renderState, id); // We are going to flush the fallback so we need to hoist the fallback
    // state to the parent boundary

    {
      if (hoistableState) {
        hoistHoistables(hoistableState, boundary.fallbackState);
      }
    } // Flush the fallback.


    flushSubtree(request, destination, segment, hoistableState);
    return writeEndPendingSuspenseBoundary(destination);
  } else if (boundary.byteSize > request.progressiveChunkSize) {
    // This boundary is large and will be emitted separately so that we can progressively show
    // other content. We add it to the queue during the flush because we have to ensure that
    // the parent flushes first so that there's something to inject it into.
    // We also have to make sure that it's emitted into the queue in a deterministic slot.
    // I.e. we can't insert it here when it completes.
    // Assign an ID to refer to the future content by.
    boundary.rootSegmentID = request.nextSegmentId++;
    request.completedBoundaries.push(boundary); // Emit a pending rendered suspense boundary wrapper.

    writeStartPendingSuspenseBoundary(destination, request.renderState, boundary.rootSegmentID); // While we are going to flush the fallback we are going to follow it up with
    // the completed boundary immediately so we make the choice to omit fallback
    // boundary state from the parent since it will be replaced when the boundary
    // flushes later in this pass or in a future flush
    // Flush the fallback.

    flushSubtree(request, destination, segment, hoistableState);
    return writeEndPendingSuspenseBoundary(destination);
  } else {
    {
      if (hoistableState) {
        hoistHoistables(hoistableState, boundary.contentState);
      }
    } // We can inline this boundary's content as a complete boundary.


    writeStartCompletedSuspenseBoundary(destination, request.renderState);
    const completedSegments = boundary.completedSegments;

    if (completedSegments.length !== 1) {
      throw Error(formatProdErrorMessage(391));
    }

    const contentSegment = completedSegments[0];
    flushSegment(request, destination, contentSegment, hoistableState);
    return writeEndCompletedSuspenseBoundary(destination, request.renderState);
  }
}

function flushClientRenderedBoundary(request, destination, boundary) {
  return writeClientRenderBoundaryInstruction(destination, request.resumableState, request.renderState, boundary.rootSegmentID, boundary.errorDigest, boundary.errorMessage, boundary.errorComponentStack);
}

function flushSegmentContainer(request, destination, segment, hoistableState) {
  writeStartSegment(destination, request.renderState, segment.parentFormatContext, segment.id);
  flushSegment(request, destination, segment, hoistableState);
  return writeEndSegment(destination, segment.parentFormatContext);
}

function flushCompletedBoundary(request, destination, boundary) {
  const completedSegments = boundary.completedSegments;
  let i = 0;

  for (; i < completedSegments.length; i++) {
    const segment = completedSegments[i];
    flushPartiallyCompletedSegment(request, destination, boundary, segment);
  }

  completedSegments.length = 0;

  {
    writeHoistablesForBoundary(destination, boundary.contentState, request.renderState);
  }

  return writeCompletedBoundaryInstruction(destination, request.resumableState, request.renderState, boundary.rootSegmentID, boundary.contentState);
}

function flushPartialBoundary(request, destination, boundary) {
  const completedSegments = boundary.completedSegments;
  let i = 0;

  for (; i < completedSegments.length; i++) {
    const segment = completedSegments[i];

    if (!flushPartiallyCompletedSegment(request, destination, boundary, segment)) {
      i++;
      completedSegments.splice(0, i); // Only write as much as the buffer wants. Something higher priority
      // might want to write later.

      return false;
    }
  }

  completedSegments.splice(0, i);

  {
    return writeHoistablesForBoundary(destination, boundary.contentState, request.renderState);
  }
}

function flushPartiallyCompletedSegment(request, destination, boundary, segment) {
  if (segment.status === FLUSHED) {
    // We've already flushed this inline.
    return true;
  }

  const hoistableState = boundary.contentState;
  const segmentID = segment.id;

  if (segmentID === -1) {
    // This segment wasn't previously referred to. This happens at the root of
    // a boundary. We make kind of a leap here and assume this is the root.
    const rootSegmentID = segment.id = boundary.rootSegmentID;

    if (rootSegmentID === -1) {
      throw Error(formatProdErrorMessage(392));
    }

    return flushSegmentContainer(request, destination, segment, hoistableState);
  } else if (segmentID === boundary.rootSegmentID) {
    // When we emit postponed boundaries, we might have assigned the ID already
    // but it's still the root segment so we can't inject it into the parent yet.
    return flushSegmentContainer(request, destination, segment, hoistableState);
  } else {
    flushSegmentContainer(request, destination, segment, hoistableState);
    return writeCompletedSegmentInstruction(destination, request.resumableState, request.renderState, segmentID);
  }
}

function flushCompletedQueues(request, destination) {

  try {
    // The structure of this is to go through each queue one by one and write
    // until the sink tells us to stop. When we should stop, we still finish writing
    // that item fully and then yield. At that point we remove the already completed
    // items up until the point we completed them.
    let i;
    const completedRootSegment = request.completedRootSegment;

    if (completedRootSegment !== null) {
      if (completedRootSegment.status === POSTPONED) {
        // We postponed the root, so we write nothing.
        return;
      } else if (request.pendingRootTasks === 0) {
        if (enableFloat) {
          flushPreamble(request, destination, completedRootSegment);
        }

        flushSegment(request, destination, completedRootSegment, null);
        request.completedRootSegment = null;
        writeCompletedRoot(destination, request.renderState);
      } else {
        // We haven't flushed the root yet so we don't need to check any other branches further down
        return;
      }
    }

    if (enableFloat) {
      writeHoistables(destination, request.resumableState, request.renderState);
    } // We emit client rendering instructions for already emitted boundaries first.
    // This is so that we can signal to the client to start client rendering them as
    // soon as possible.


    const clientRenderedBoundaries = request.clientRenderedBoundaries;

    for (i = 0; i < clientRenderedBoundaries.length; i++) {
      const boundary = clientRenderedBoundaries[i];

      if (!flushClientRenderedBoundary(request, destination, boundary)) {
        request.destination = null;
        i++;
        clientRenderedBoundaries.splice(0, i);
        return;
      }
    }

    clientRenderedBoundaries.splice(0, i); // Next we emit any complete boundaries. It's better to favor boundaries
    // that are completely done since we can actually show them, than it is to emit
    // any individual segments from a partially complete boundary.

    const completedBoundaries = request.completedBoundaries;

    for (i = 0; i < completedBoundaries.length; i++) {
      const boundary = completedBoundaries[i];

      if (!flushCompletedBoundary(request, destination, boundary)) {
        request.destination = null;
        i++;
        completedBoundaries.splice(0, i);
        return;
      }
    }

    completedBoundaries.splice(0, i); // Allow anything written so far to flush to the underlying sink before
    // we continue with lower priorities.

    completeWriting(destination);
    beginWriting(destination); // TODO: Here we'll emit data used by hydration.
    // Next we emit any segments of any boundaries that are partially complete
    // but not deeply complete.

    const partialBoundaries = request.partialBoundaries;

    for (i = 0; i < partialBoundaries.length; i++) {
      const boundary = partialBoundaries[i];

      if (!flushPartialBoundary(request, destination, boundary)) {
        request.destination = null;
        i++;
        partialBoundaries.splice(0, i);
        return;
      }
    }

    partialBoundaries.splice(0, i); // Next we check the completed boundaries again. This may have had
    // boundaries added to it in case they were too larged to be inlined.
    // New ones might be added in this loop.

    const largeBoundaries = request.completedBoundaries;

    for (i = 0; i < largeBoundaries.length; i++) {
      const boundary = largeBoundaries[i];

      if (!flushCompletedBoundary(request, destination, boundary)) {
        request.destination = null;
        i++;
        largeBoundaries.splice(0, i);
        return;
      }
    }

    largeBoundaries.splice(0, i);
  } finally {
    if (request.allPendingTasks === 0 && request.pingedTasks.length === 0 && request.clientRenderedBoundaries.length === 0 && request.completedBoundaries.length === 0 // We don't need to check any partially completed segments because
    // either they have pending task or they're complete.
    ) {
        request.flushScheduled = false;

        {
          // We write the trailing tags but only if don't have any data to resume.
          // If we need to resume we'll write the postamble in the resume instead.
          {
            writePostamble(destination, request.resumableState);
          }
        }


        close(destination); // We need to stop flowing now because we do not want any async contexts which might call
        // float methods to initiate any flushes after this point

        stopFlowing(request);
      }
  }
}

function startWork(request) {
  request.flushScheduled = request.destination !== null;

  {
    scheduleWork(() => performWork(request));
  }

  if (request.trackedPostpones === null) {
    // this is either a regular render or a resume. For regular render we want
    // to call emitEarlyPreloads after the first performWork because we want
    // are responding to a live request and need to balance sending something early
    // (i.e. don't want for the shell to finish) but we need something to send.
    // The only implementation of this is for DOM at the moment and during resumes nothing
    // actually emits but the code paths here are the same.
    // During a prerender we don't want to be too aggressive in emitting early preloads
    // because we aren't responding to a live request and we can wait for the prerender to
    // postpone before we emit anything.
    {
      scheduleWork(() => enqueueEarlyPreloadsAfterInitialWork(request));
    }
  }
}

function enqueueEarlyPreloadsAfterInitialWork(request) {
  const shellComplete = request.pendingRootTasks === 0;
  safelyEmitEarlyPreloads(request, shellComplete);
}

function enqueueFlush(request) {
  if (request.flushScheduled === false && // If there are pinged tasks we are going to flush anyway after work completes
  request.pingedTasks.length === 0 && // If there is no destination there is nothing we can flush to. A flush will
  // happen when we start flowing again
  request.destination !== null) {
    request.flushScheduled = true;
    scheduleWork(() => {
      // We need to existence check destination again here because it might go away
      // in between the enqueueFlush call and the work execution
      const destination = request.destination;

      if (destination) {
        flushCompletedQueues(request, destination);
      } else {
        request.flushScheduled = false;
      }
    });
  }
} // This function is intented to only be called during the pipe function for the Node builds.
function startFlowing(request, destination) {
  if (request.status === CLOSING) {
    request.status = CLOSED;
    closeWithError(destination, request.fatalError);
    return;
  }

  if (request.status === CLOSED) {
    return;
  }

  if (request.destination !== null) {
    // We're already flowing.
    return;
  }

  request.destination = destination;

  try {
    flushCompletedQueues(request, destination);
  } catch (error) {
    const errorInfo = {};
    logRecoverableError(request, error, errorInfo);
    fatalError(request, error);
  }
}
function stopFlowing(request) {
  request.destination = null;
} // This is called to early terminate a request. It puts all pending boundaries in client rendered state.

function abort(request, reason) {
  try {
    const abortableTasks = request.abortableTasks;

    if (abortableTasks.size > 0) {
      const error = reason === undefined ? Error(formatProdErrorMessage(432)) : reason;
      abortableTasks.forEach(task => abortTask(task, request, error));
      abortableTasks.clear();
    }

    if (request.destination !== null) {
      flushCompletedQueues(request, request.destination);
    }
  } catch (error) {
    const errorInfo = {};
    logRecoverableError(request, error, errorInfo);
    fatalError(request, error);
  }
}
function flushResources(request) {
  enqueueFlush(request);
}
function getFormState(request) {
  return request.formState;
}
function getResumableState(request) {
  return request.resumableState;
}
function getRenderState(request) {
  return request.renderState;
}

function onError() {// Non-fatal errors are ignored.
}

function renderToStringImpl(children, options, generateStaticMarkup, abortReason) {
  let didFatal = false;
  let fatalError = null;
  let result = '';
  const destination = {
    // $FlowFixMe[missing-local-annot]
    push(chunk) {
      if (chunk !== null) {
        result += chunk;
      }

      return true;
    },

    // $FlowFixMe[missing-local-annot]
    destroy(error) {
      didFatal = true;
      fatalError = error;
    }

  };
  let readyToStream = false;

  function onShellReady() {
    readyToStream = true;
  }

  const resumableState = createResumableState(options ? options.identifierPrefix : undefined, undefined);
  const request = createRequest(children, resumableState, createRenderState(resumableState, generateStaticMarkup), createRootFormatContext(), Infinity, onError, undefined, onShellReady, undefined, undefined, undefined);
  startWork(request); // If anything suspended and is still pending, we'll abort it before writing.
  // That way we write only client-rendered boundaries from the start.

  abort(request, abortReason);
  startFlowing(request, destination);

  if (didFatal && fatalError !== abortReason) {
    throw fatalError;
  }

  if (!readyToStream) {
    // Note: This error message is the one we use on the client. It doesn't
    // really make sense here. But this is the legacy server renderer, anyway.
    // We're going to delete it soon.
    throw Error(formatProdErrorMessage(426));
  }

  return result;
}

function renderToString(children, options) {
  return renderToStringImpl(children, options, false, 'The server used "renderToString" which does not support Suspense. If you intended for this Suspense boundary to render the fallback content on the server consider throwing an Error somewhere within the Suspense boundary. If you intended to have the server wait for the suspended component please switch to "renderToReadableStream" which supports Suspense on the server');
}

function renderToStaticMarkup(children, options) {
  return renderToStringImpl(children, options, true, 'The server used "renderToStaticMarkup" which does not support Suspense. If you intended to have the server wait for the suspended component please switch to "renderToReadableStream" which supports Suspense on the server');
}

function renderToNodeStream() {
  throw Error(formatProdErrorMessage(207));
}

function renderToStaticNodeStream() {
  throw Error(formatProdErrorMessage(208));
}

exports.renderToNodeStream = renderToNodeStream;
exports.renderToStaticMarkup = renderToStaticMarkup;
exports.renderToStaticNodeStream = renderToStaticNodeStream;
exports.renderToString = renderToString;
exports.version = ReactVersion;