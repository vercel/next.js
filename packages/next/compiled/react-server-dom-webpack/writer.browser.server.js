/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 997:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

/**
 * @license React
 * react-server-dom-webpack-writer.browser.development.server.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */



if (process.env.NODE_ENV !== "production") {
  (function() {
'use strict';

var React = __nccwpck_require__(522);
var ReactDOM = __nccwpck_require__(255);

var ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

function error(format) {
  {
    {
      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        args[_key2 - 1] = arguments[_key2];
      }

      printWarning('error', format, args);
    }
  }
}

function printWarning(level, format, args) {
  // When changing this logic, you might want to also
  // update consoleWithStackDev.www.js as well.
  {
    var ReactDebugCurrentFrame = ReactSharedInternals.ReactDebugCurrentFrame;
    var stack = ReactDebugCurrentFrame.getStackAddendum();

    if (stack !== '') {
      format += '%s';
      args = args.concat([stack]);
    } // eslint-disable-next-line react-internal/safe-string-coercion


    var argsWithFormat = args.map(function (item) {
      return String(item);
    }); // Careful: RN currently depends on this prefix

    argsWithFormat.unshift('Warning: ' + format); // We intentionally don't use spread (or .apply) directly because it
    // breaks IE9: https://github.com/facebook/react/issues/13610
    // eslint-disable-next-line react-internal/no-production-logging

    Function.prototype.apply.call(console[level], console, argsWithFormat);
  }
}

function scheduleWork(callback) {
  callback();
}
var VIEW_SIZE = 512;
var currentView = null;
var writtenBytes = 0;
function beginWriting(destination) {
  currentView = new Uint8Array(VIEW_SIZE);
  writtenBytes = 0;
}
function writeChunk(destination, chunk) {
  if (chunk.length === 0) {
    return;
  }

  if (chunk.length > VIEW_SIZE) {
    // this chunk may overflow a single view which implies it was not
    // one that is cached by the streaming renderer. We will enqueu
    // it directly and expect it is not re-used
    if (writtenBytes > 0) {
      destination.enqueue(new Uint8Array(currentView.buffer, 0, writtenBytes));
      currentView = new Uint8Array(VIEW_SIZE);
      writtenBytes = 0;
    }

    destination.enqueue(chunk);
    return;
  }

  var bytesToWrite = chunk;
  var allowableBytes = currentView.length - writtenBytes;

  if (allowableBytes < bytesToWrite.length) {
    // this chunk would overflow the current view. We enqueue a full view
    // and start a new view with the remaining chunk
    if (allowableBytes === 0) {
      // the current view is already full, send it
      destination.enqueue(currentView);
    } else {
      // fill up the current view and apply the remaining chunk bytes
      // to a new view.
      currentView.set(bytesToWrite.subarray(0, allowableBytes), writtenBytes); // writtenBytes += allowableBytes; // this can be skipped because we are going to immediately reset the view

      destination.enqueue(currentView);
      bytesToWrite = bytesToWrite.subarray(allowableBytes);
    }

    currentView = new Uint8Array(VIEW_SIZE);
    writtenBytes = 0;
  }

  currentView.set(bytesToWrite, writtenBytes);
  writtenBytes += bytesToWrite.length;
}
function writeChunkAndReturn(destination, chunk) {
  writeChunk(destination, chunk); // in web streams there is no backpressure so we can alwas write more

  return true;
}
function completeWriting(destination) {
  if (currentView && writtenBytes > 0) {
    destination.enqueue(new Uint8Array(currentView.buffer, 0, writtenBytes));
    currentView = null;
    writtenBytes = 0;
  }
}
function close(destination) {
  destination.close();
}
var textEncoder = new TextEncoder();
function stringToChunk(content) {
  return textEncoder.encode(content);
}
function stringToPrecomputedChunk(content) {
  return textEncoder.encode(content);
}
function closeWithError(destination, error) {
  // $FlowFixMe[method-unbinding]
  if (typeof destination.error === 'function') {
    // $FlowFixMe: This is an Error object or the destination accepts other types.
    destination.error(error);
  } else {
    // Earlier implementations doesn't support this method. In that environment you're
    // supposed to throw from a promise returned but we don't return a promise in our
    // approach. We could fork this implementation but this is environment is an edge
    // case to begin with. It's even less common to run this in an older environment.
    // Even then, this is not where errors are supposed to happen and they get reported
    // to a global callback in addition to this anyway. So it's fine just to close this.
    destination.close();
  }
}

// This file is an intermediate layer to translate between Flight
var stringify = JSON.stringify;

function serializeRowHeader(tag, id) {
  return tag + id.toString(16) + ':';
}

function processErrorChunkProd(request, id, digest) {
  {
    // These errors should never make it into a build so we don't need to encode them in codes.json
    // eslint-disable-next-line react-internal/prod-error-codes
    throw new Error('processErrorChunkProd should never be called while in development mode. Use processErrorChunkDev instead. This is a bug in React.');
  }

  var errorInfo = {
    digest: digest
  };
  var row = serializeRowHeader('E', id) + stringify(errorInfo) + '\n';
}
function processErrorChunkDev(request, id, digest, message, stack) {

  var errorInfo = {
    digest: digest,
    message: message,
    stack: stack
  };
  var row = serializeRowHeader('E', id) + stringify(errorInfo) + '\n';
  return stringToChunk(row);
}
function processModelChunk(request, id, model) {
  var json = stringify(model, request.toJSON);
  var row = serializeRowHeader('J', id) + json + '\n';
  return stringToChunk(row);
}
function processReferenceChunk(request, id, reference) {
  var json = stringify(reference);
  var row = serializeRowHeader('J', id) + json + '\n';
  return stringToChunk(row);
}
function processModuleChunk(request, id, moduleMetaData) {
  var json = stringify(moduleMetaData);
  var row = serializeRowHeader('M', id) + json + '\n';
  return stringToChunk(row);
}
function processProviderChunk(request, id, contextName) {
  var row = serializeRowHeader('P', id) + contextName + '\n';
  return stringToChunk(row);
}
function processSymbolChunk(request, id, name) {
  var json = stringify(name);
  var row = serializeRowHeader('S', id) + json + '\n';
  return stringToChunk(row);
}

// eslint-disable-next-line no-unused-vars
var MODULE_TAG = Symbol.for('react.module.reference');
function getModuleKey(reference) {
  return reference.filepath + '#' + reference.name + (reference.async ? '#async' : '');
}
function isModuleReference(reference) {
  return reference.$$typeof === MODULE_TAG;
}
function resolveModuleMetaData(config, moduleReference) {
  var resolvedModuleData = config[moduleReference.filepath][moduleReference.name];

  if (moduleReference.async) {
    return {
      id: resolvedModuleData.id,
      chunks: resolvedModuleData.chunks,
      name: resolvedModuleData.name,
      async: true
    };
  } else {
    return resolvedModuleData;
  }
}

// ATTENTION
// When adding new symbols to this file,
// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'
// The Symbol used to tag the ReactElement-like types.
var REACT_ELEMENT_TYPE = Symbol.for('react.element');
var REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
var REACT_PROVIDER_TYPE = Symbol.for('react.provider');
var REACT_SERVER_CONTEXT_TYPE = Symbol.for('react.server_context');
var REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
var REACT_MEMO_TYPE = Symbol.for('react.memo');
var REACT_LAZY_TYPE = Symbol.for('react.lazy');
var REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED = Symbol.for('react.default_value');

// A reserved attribute.
// It is handled by React separately and shouldn't be written to the DOM.
var RESERVED = 0; // A simple string attribute.
// Attributes that aren't in the filter are presumed to have this type.

var STRING = 1; // A string attribute that accepts booleans in React. In HTML, these are called
// "enumerated" attributes with "true" and "false" as possible values.
// When true, it should be set to a "true" string.
// When false, it should be set to a "false" string.

var BOOLEANISH_STRING = 2; // A real boolean attribute.
// When true, it should be present (set either to an empty string or its name).
// When false, it should be omitted.

var BOOLEAN = 3; // An attribute that can be used as a flag as well as with a value.
// When true, it should be present (set either to an empty string or its name).
// When false, it should be omitted.
// For any other value, should be present with that value.

var OVERLOADED_BOOLEAN = 4; // An attribute that must be numeric or parse as a numeric.
// When falsy, it should be removed.

var NUMERIC = 5; // An attribute that must be positive numeric or parse as a positive numeric.
// When falsy, it should be removed.

var POSITIVE_NUMERIC = 6;

function PropertyInfoRecord(name, type, mustUseProperty, attributeName, attributeNamespace, sanitizeURL, removeEmptyString) {
  this.acceptsBooleans = type === BOOLEANISH_STRING || type === BOOLEAN || type === OVERLOADED_BOOLEAN;
  this.attributeName = attributeName;
  this.attributeNamespace = attributeNamespace;
  this.mustUseProperty = mustUseProperty;
  this.propertyName = name;
  this.type = type;
  this.sanitizeURL = sanitizeURL;
  this.removeEmptyString = removeEmptyString;
} // When adding attributes to this list, be sure to also add them to
// the `possibleStandardNames` module to ensure casing and incorrect
// name warnings.


var properties = {}; // These props are reserved by React. They shouldn't be written to the DOM.

var reservedProps = ['children', 'dangerouslySetInnerHTML', // TODO: This prevents the assignment of defaultValue to regular
// elements (not just inputs). Now that ReactDOMInput assigns to the
// defaultValue property -- do we need this?
'defaultValue', 'defaultChecked', 'innerHTML', 'suppressContentEditableWarning', 'suppressHydrationWarning', 'style'];

{
  reservedProps.push('innerText', 'textContent');
}

reservedProps.forEach(function (name) {
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  properties[name] = new PropertyInfoRecord(name, RESERVED, false, // mustUseProperty
  name, // attributeName
  null, // attributeNamespace
  false, // sanitizeURL
  false);
}); // A few React string attributes have a different name.
// This is a mapping from React prop names to the attribute names.

[['acceptCharset', 'accept-charset'], ['className', 'class'], ['htmlFor', 'for'], ['httpEquiv', 'http-equiv']].forEach(function (_ref) {
  var name = _ref[0],
      attributeName = _ref[1];
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  properties[name] = new PropertyInfoRecord(name, STRING, false, // mustUseProperty
  attributeName, // attributeName
  null, // attributeNamespace
  false, // sanitizeURL
  false);
}); // These are "enumerated" HTML attributes that accept "true" and "false".
// In React, we let users pass `true` and `false` even though technically
// these aren't boolean attributes (they are coerced to strings).

['contentEditable', 'draggable', 'spellCheck', 'value'].forEach(function (name) {
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  properties[name] = new PropertyInfoRecord(name, BOOLEANISH_STRING, false, // mustUseProperty
  name.toLowerCase(), // attributeName
  null, // attributeNamespace
  false, // sanitizeURL
  false);
}); // These are "enumerated" SVG attributes that accept "true" and "false".
// In React, we let users pass `true` and `false` even though technically
// these aren't boolean attributes (they are coerced to strings).
// Since these are SVG attributes, their attribute names are case-sensitive.

['autoReverse', 'externalResourcesRequired', 'focusable', 'preserveAlpha'].forEach(function (name) {
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  properties[name] = new PropertyInfoRecord(name, BOOLEANISH_STRING, false, // mustUseProperty
  name, // attributeName
  null, // attributeNamespace
  false, // sanitizeURL
  false);
}); // These are HTML boolean attributes.

['allowFullScreen', 'async', // Note: there is a special case that prevents it from being written to the DOM
// on the client side because the browsers are inconsistent. Instead we call focus().
'autoFocus', 'autoPlay', 'controls', 'default', 'defer', 'disabled', 'disablePictureInPicture', 'disableRemotePlayback', 'formNoValidate', 'hidden', 'loop', 'noModule', 'noValidate', 'open', 'playsInline', 'readOnly', 'required', 'reversed', 'scoped', 'seamless', // Microdata
'itemScope'].forEach(function (name) {
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  properties[name] = new PropertyInfoRecord(name, BOOLEAN, false, // mustUseProperty
  name.toLowerCase(), // attributeName
  null, // attributeNamespace
  false, // sanitizeURL
  false);
}); // These are the few React props that we set as DOM properties
// rather than attributes. These are all booleans.

['checked', // Note: `option.selected` is not updated if `select.multiple` is
// disabled with `removeAttribute`. We have special logic for handling this.
'multiple', 'muted', 'selected' // NOTE: if you add a camelCased prop to this list,
// you'll need to set attributeName to name.toLowerCase()
// instead in the assignment below.
].forEach(function (name) {
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  properties[name] = new PropertyInfoRecord(name, BOOLEAN, true, // mustUseProperty
  name, // attributeName
  null, // attributeNamespace
  false, // sanitizeURL
  false);
}); // These are HTML attributes that are "overloaded booleans": they behave like
// booleans, but can also accept a string value.

['capture', 'download' // NOTE: if you add a camelCased prop to this list,
// you'll need to set attributeName to name.toLowerCase()
// instead in the assignment below.
].forEach(function (name) {
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  properties[name] = new PropertyInfoRecord(name, OVERLOADED_BOOLEAN, false, // mustUseProperty
  name, // attributeName
  null, // attributeNamespace
  false, // sanitizeURL
  false);
}); // These are HTML attributes that must be positive numbers.

['cols', 'rows', 'size', 'span' // NOTE: if you add a camelCased prop to this list,
// you'll need to set attributeName to name.toLowerCase()
// instead in the assignment below.
].forEach(function (name) {
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  properties[name] = new PropertyInfoRecord(name, POSITIVE_NUMERIC, false, // mustUseProperty
  name, // attributeName
  null, // attributeNamespace
  false, // sanitizeURL
  false);
}); // These are HTML attributes that must be numbers.

['rowSpan', 'start'].forEach(function (name) {
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  properties[name] = new PropertyInfoRecord(name, NUMERIC, false, // mustUseProperty
  name.toLowerCase(), // attributeName
  null, // attributeNamespace
  false, // sanitizeURL
  false);
});
var CAMELIZE = /[\-\:]([a-z])/g;

var capitalize = function (token) {
  return token[1].toUpperCase();
}; // This is a list of all SVG attributes that need special casing, namespacing,
// or boolean value assignment. Regular attributes that just accept strings
// and have the same names are omitted, just like in the HTML attribute filter.
// Some of these attributes can be hard to find. This list was created by
// scraping the MDN documentation.


['accent-height', 'alignment-baseline', 'arabic-form', 'baseline-shift', 'cap-height', 'clip-path', 'clip-rule', 'color-interpolation', 'color-interpolation-filters', 'color-profile', 'color-rendering', 'dominant-baseline', 'enable-background', 'fill-opacity', 'fill-rule', 'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'glyph-name', 'glyph-orientation-horizontal', 'glyph-orientation-vertical', 'horiz-adv-x', 'horiz-origin-x', 'image-rendering', 'letter-spacing', 'lighting-color', 'marker-end', 'marker-mid', 'marker-start', 'overline-position', 'overline-thickness', 'paint-order', 'panose-1', 'pointer-events', 'rendering-intent', 'shape-rendering', 'stop-color', 'stop-opacity', 'strikethrough-position', 'strikethrough-thickness', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'text-anchor', 'text-decoration', 'text-rendering', 'underline-position', 'underline-thickness', 'unicode-bidi', 'unicode-range', 'units-per-em', 'v-alphabetic', 'v-hanging', 'v-ideographic', 'v-mathematical', 'vector-effect', 'vert-adv-y', 'vert-origin-x', 'vert-origin-y', 'word-spacing', 'writing-mode', 'xmlns:xlink', 'x-height' // NOTE: if you add a camelCased prop to this list,
// you'll need to set attributeName to name.toLowerCase()
// instead in the assignment below.
].forEach(function (attributeName) {
  var name = attributeName.replace(CAMELIZE, capitalize); // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions

  properties[name] = new PropertyInfoRecord(name, STRING, false, // mustUseProperty
  attributeName, null, // attributeNamespace
  false, // sanitizeURL
  false);
}); // String SVG attributes with the xlink namespace.

['xlink:actuate', 'xlink:arcrole', 'xlink:role', 'xlink:show', 'xlink:title', 'xlink:type' // NOTE: if you add a camelCased prop to this list,
// you'll need to set attributeName to name.toLowerCase()
// instead in the assignment below.
].forEach(function (attributeName) {
  var name = attributeName.replace(CAMELIZE, capitalize); // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions

  properties[name] = new PropertyInfoRecord(name, STRING, false, // mustUseProperty
  attributeName, 'http://www.w3.org/1999/xlink', false, // sanitizeURL
  false);
}); // String SVG attributes with the xml namespace.

['xml:base', 'xml:lang', 'xml:space' // NOTE: if you add a camelCased prop to this list,
// you'll need to set attributeName to name.toLowerCase()
// instead in the assignment below.
].forEach(function (attributeName) {
  var name = attributeName.replace(CAMELIZE, capitalize); // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions

  properties[name] = new PropertyInfoRecord(name, STRING, false, // mustUseProperty
  attributeName, 'http://www.w3.org/XML/1998/namespace', false, // sanitizeURL
  false);
}); // These attribute exists both in HTML and SVG.
// The attribute name is case-sensitive in SVG so we can't just use
// the React name like we do for attributes that exist only in HTML.

['tabIndex', 'crossOrigin'].forEach(function (attributeName) {
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  properties[attributeName] = new PropertyInfoRecord(attributeName, STRING, false, // mustUseProperty
  attributeName.toLowerCase(), // attributeName
  null, // attributeNamespace
  false, // sanitizeURL
  false);
}); // These attributes accept URLs. These must not allow javascript: URLS.
// These will also need to accept Trusted Types object in the future.

var xlinkHref = 'xlinkHref'; // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions

properties[xlinkHref] = new PropertyInfoRecord('xlinkHref', STRING, false, // mustUseProperty
'xlink:href', 'http://www.w3.org/1999/xlink', true, // sanitizeURL
false);
['src', 'href', 'action', 'formAction'].forEach(function (attributeName) {
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  properties[attributeName] = new PropertyInfoRecord(attributeName, STRING, false, // mustUseProperty
  attributeName.toLowerCase(), // attributeName
  null, // attributeNamespace
  true, // sanitizeURL
  true);
});

/**
 * CSS properties which accept numbers but are not in units of "px".
 */
var isUnitlessNumber = {
  animationIterationCount: true,
  aspectRatio: true,
  borderImageOutset: true,
  borderImageSlice: true,
  borderImageWidth: true,
  boxFlex: true,
  boxFlexGroup: true,
  boxOrdinalGroup: true,
  columnCount: true,
  columns: true,
  flex: true,
  flexGrow: true,
  flexPositive: true,
  flexShrink: true,
  flexNegative: true,
  flexOrder: true,
  gridArea: true,
  gridRow: true,
  gridRowEnd: true,
  gridRowSpan: true,
  gridRowStart: true,
  gridColumn: true,
  gridColumnEnd: true,
  gridColumnSpan: true,
  gridColumnStart: true,
  fontWeight: true,
  lineClamp: true,
  lineHeight: true,
  opacity: true,
  order: true,
  orphans: true,
  tabSize: true,
  widows: true,
  zIndex: true,
  zoom: true,
  // SVG-related properties
  fillOpacity: true,
  floodOpacity: true,
  stopOpacity: true,
  strokeDasharray: true,
  strokeDashoffset: true,
  strokeMiterlimit: true,
  strokeOpacity: true,
  strokeWidth: true
};
/**
 * @param {string} prefix vendor-specific prefix, eg: Webkit
 * @param {string} key style name, eg: transitionDuration
 * @return {string} style name prefixed with `prefix`, properly camelCased, eg:
 * WebkitTransitionDuration
 */

function prefixKey(prefix, key) {
  return prefix + key.charAt(0).toUpperCase() + key.substring(1);
}
/**
 * Support style names that may come passed in prefixed by adding permutations
 * of vendor prefixes.
 */


var prefixes = ['Webkit', 'ms', 'Moz', 'O']; // Using Object.keys here, or else the vanilla for-in loop makes IE8 go into an
// infinite loop, because it iterates over the newly added props too.

Object.keys(isUnitlessNumber).forEach(function (prop) {
  prefixes.forEach(function (prefix) {
    isUnitlessNumber[prefixKey(prefix, prop)] = isUnitlessNumber[prop];
  });
});

var isArrayImpl = Array.isArray; // eslint-disable-next-line no-redeclare

function isArray(a) {
  return isArrayImpl(a);
}

var ReactDOMSharedInternals = ReactDOM.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

var ReactDOMCurrentDispatcher = ReactDOMSharedInternals.Dispatcher;

var startInlineScript = stringToPrecomputedChunk('<script>');
var endInlineScript = stringToPrecomputedChunk('</script>');
var startScriptSrc = stringToPrecomputedChunk('<script src="');
var startModuleSrc = stringToPrecomputedChunk('<script type="module" src="');
var scriptIntegirty = stringToPrecomputedChunk('" integrity="');
var endAsyncScript = stringToPrecomputedChunk('" async=""></script>');

var textSeparator = stringToPrecomputedChunk('<!-- -->');

var styleAttributeStart = stringToPrecomputedChunk(' style="');
var styleAssign = stringToPrecomputedChunk(':');
var styleSeparator = stringToPrecomputedChunk(';');

var attributeSeparator = stringToPrecomputedChunk(' ');
var attributeAssign = stringToPrecomputedChunk('="');
var attributeEnd = stringToPrecomputedChunk('"');
var attributeEmptyString = stringToPrecomputedChunk('=""');

var endOfStartTag = stringToPrecomputedChunk('>');
var endOfStartTagSelfClosing = stringToPrecomputedChunk('/>');

var selectedMarkerAttribute = stringToPrecomputedChunk(' selected=""');

var leadingNewline = stringToPrecomputedChunk('\n');

var DOCTYPE = stringToPrecomputedChunk('<!DOCTYPE html>');
var endTag1 = stringToPrecomputedChunk('</');
var endTag2 = stringToPrecomputedChunk('>');
// A placeholder is a node inside a hidden partial tree that can be filled in later, but before
// display. It's never visible to users. We use the template tag because it can be used in every
// type of parent. <script> tags also work in every other tag except <colgroup>.

var placeholder1 = stringToPrecomputedChunk('<template id="');
var placeholder2 = stringToPrecomputedChunk('"></template>');

var startCompletedSuspenseBoundary = stringToPrecomputedChunk('<!--$-->');
var startPendingSuspenseBoundary1 = stringToPrecomputedChunk('<!--$?--><template id="');
var startPendingSuspenseBoundary2 = stringToPrecomputedChunk('"></template>');
var startClientRenderedSuspenseBoundary = stringToPrecomputedChunk('<!--$!-->');
var endSuspenseBoundary = stringToPrecomputedChunk('<!--/$-->');
var clientRenderedSuspenseBoundaryError1 = stringToPrecomputedChunk('<template');
var clientRenderedSuspenseBoundaryErrorAttrInterstitial = stringToPrecomputedChunk('"');
var clientRenderedSuspenseBoundaryError1A = stringToPrecomputedChunk(' data-dgst="');
var clientRenderedSuspenseBoundaryError1B = stringToPrecomputedChunk(' data-msg="');
var clientRenderedSuspenseBoundaryError1C = stringToPrecomputedChunk(' data-stck="');
var clientRenderedSuspenseBoundaryError2 = stringToPrecomputedChunk('></template>');
var startSegmentHTML = stringToPrecomputedChunk('<div hidden id="');
var startSegmentHTML2 = stringToPrecomputedChunk('">');
var endSegmentHTML = stringToPrecomputedChunk('</div>');
var startSegmentSVG = stringToPrecomputedChunk('<svg aria-hidden="true" style="display:none" id="');
var startSegmentSVG2 = stringToPrecomputedChunk('">');
var endSegmentSVG = stringToPrecomputedChunk('</svg>');
var startSegmentMathML = stringToPrecomputedChunk('<math aria-hidden="true" style="display:none" id="');
var startSegmentMathML2 = stringToPrecomputedChunk('">');
var endSegmentMathML = stringToPrecomputedChunk('</math>');
var startSegmentTable = stringToPrecomputedChunk('<table hidden id="');
var startSegmentTable2 = stringToPrecomputedChunk('">');
var endSegmentTable = stringToPrecomputedChunk('</table>');
var startSegmentTableBody = stringToPrecomputedChunk('<table hidden><tbody id="');
var startSegmentTableBody2 = stringToPrecomputedChunk('">');
var endSegmentTableBody = stringToPrecomputedChunk('</tbody></table>');
var startSegmentTableRow = stringToPrecomputedChunk('<table hidden><tr id="');
var startSegmentTableRow2 = stringToPrecomputedChunk('">');
var endSegmentTableRow = stringToPrecomputedChunk('</tr></table>');
var startSegmentColGroup = stringToPrecomputedChunk('<table hidden><colgroup id="');
var startSegmentColGroup2 = stringToPrecomputedChunk('">');
var endSegmentColGroup = stringToPrecomputedChunk('</colgroup></table>');
// The following code is the source scripts that we then minify and inline below,
// with renamed function names that we hope don't collide:
// const COMMENT_NODE = 8;
// const SUSPENSE_START_DATA = '$';
// const SUSPENSE_END_DATA = '/$';
// const SUSPENSE_PENDING_START_DATA = '$?';
// const SUSPENSE_FALLBACK_START_DATA = '$!';
// const LOADED = 'l';
// const ERRORED = 'e';
// function clientRenderBoundary(suspenseBoundaryID, errorDigest, errorMsg, errorComponentStack) {
//   // Find the fallback's first element.
//   const suspenseIdNode = document.getElementById(suspenseBoundaryID);
//   if (!suspenseIdNode) {
//     // The user must have already navigated away from this tree.
//     // E.g. because the parent was hydrated.
//     return;
//   }
//   // Find the boundary around the fallback. This is always the previous node.
//   const suspenseNode = suspenseIdNode.previousSibling;
//   // Tag it to be client rendered.
//   suspenseNode.data = SUSPENSE_FALLBACK_START_DATA;
//   // assign error metadata to first sibling
//   let dataset = suspenseIdNode.dataset;
//   if (errorDigest) dataset.dgst = errorDigest;
//   if (errorMsg) dataset.msg = errorMsg;
//   if (errorComponentStack) dataset.stck = errorComponentStack;
//   // Tell React to retry it if the parent already hydrated.
//   if (suspenseNode._reactRetry) {
//     suspenseNode._reactRetry();
//   }
// }
// resourceMap = new Map();
// function completeBoundaryWithStyles(suspenseBoundaryID, contentID, styles) {
//   const precedences = new Map();
//   const thisDocument = document;
//   let lastResource, node;
//   // Seed the precedence list with existing resources
//   let nodes = thisDocument.querySelectorAll('link[data-rprec]');
//   for (let i = 0;node = nodes[i++];) {
//     precedences.set(node.dataset.rprec, lastResource = node);
//   }
//   let i = 0;
//   let dependencies = [];
//   let style, href, precedence, attr, loadingState, resourceEl;
//   function setStatus(s) {
//     this.s = s;
//   }
//   while (style = styles[i++]) {
//     let j = 0;
//     href = style[j++];
//     // We check if this resource is already in our resourceMap and reuse it if so.
//     // If it is already loaded we don't return it as a depenendency since there is nothing
//     // to wait for
//     loadingState = resourceMap.get(href);
//     if (loadingState) {
//       if (loadingState.s !== 'l') {
//         dependencies.push(loadingState);
//       }
//       continue;
//     }
//     // We construct our new resource element, looping over remaining attributes if any
//     // setting them to the Element.
//     resourceEl = thisDocument.createElement("link");
//     resourceEl.href = href;
//     resourceEl.rel = 'stylesheet';
//     resourceEl.dataset.rprec = precedence = style[j++];
//     while(attr = style[j++]) {
//       resourceEl.setAttribute(attr, style[j++]);
//     }
//     // We stash a pending promise in our map by href which will resolve or reject
//     // when the underlying resource loads or errors. We add it to the dependencies
//     // array to be returned.
//     loadingState = resourceEl._p = new Promise((re, rj) => {
//       resourceEl.onload = re;
//       resourceEl.onerror = rj;
//     })
//     loadingState.then(
//       setStatus.bind(loadingState, LOADED),
//       setStatus.bind(loadingState, ERRORED)
//     );
//     resourceMap.set(href, loadingState);
//     dependencies.push(loadingState);
//     // The prior style resource is the last one placed at a given
//     // precedence or the last resource itself which may be null.
//     // We grab this value and then update the last resource for this
//     // precedence to be the inserted element, updating the lastResource
//     // pointer if needed.
//     let prior = precedences.get(precedence) || lastResource;
//     if (prior === lastResource) {
//       lastResource = resourceEl
//     }
//     precedences.set(precedence, resourceEl)
//     // Finally, we insert the newly constructed instance at an appropriate location
//     // in the Document.
//     if (prior) {
//       prior.parentNode.insertBefore(resourceEl, prior.nextSibling);
//     } else {
//       let head = thisDocument.head;
//       head.insertBefore(resourceEl, head.firstChild);
//     }
//   }
//   Promise.all(dependencies).then(
//     completeBoundary.bind(null, suspenseBoundaryID, contentID, ''),
//     completeBoundary.bind(null, suspenseBoundaryID, contentID, "Resource failed to load")
//   );
// }
// function completeBoundary(suspenseBoundaryID, contentID, errorDigest) {
//   const contentNode = document.getElementById(contentID);
//   // We'll detach the content node so that regardless of what happens next we don't leave in the tree.
//   // This might also help by not causing recalcing each time we move a child from here to the target.
//   contentNode.parentNode.removeChild(contentNode);
//   // Find the fallback's first element.
//   const suspenseIdNode = document.getElementById(suspenseBoundaryID);
//   if (!suspenseIdNode) {
//     // The user must have already navigated away from this tree.
//     // E.g. because the parent was hydrated. That's fine there's nothing to do
//     // but we have to make sure that we already deleted the container node.
//     return;
//   }
//   // Find the boundary around the fallback. This is always the previous node.
//   const suspenseNode = suspenseIdNode.previousSibling;
//   if (!errorDigest) {
//     // Clear all the existing children. This is complicated because
//     // there can be embedded Suspense boundaries in the fallback.
//     // This is similar to clearSuspenseBoundary in ReactDOMHostConfig.
//     // TODO: We could avoid this if we never emitted suspense boundaries in fallback trees.
//     // They never hydrate anyway. However, currently we support incrementally loading the fallback.
//     const parentInstance = suspenseNode.parentNode;
//     let node = suspenseNode.nextSibling;
//     let depth = 0;
//     do {
//       if (node && node.nodeType === COMMENT_NODE) {
//         const data = node.data;
//         if (data === SUSPENSE_END_DATA) {
//           if (depth === 0) {
//             break;
//           } else {
//             depth--;
//           }
//         } else if (
//           data === SUSPENSE_START_DATA ||
//           data === SUSPENSE_PENDING_START_DATA ||
//           data === SUSPENSE_FALLBACK_START_DATA
//         ) {
//           depth++;
//         }
//       }
//       const nextNode = node.nextSibling;
//       parentInstance.removeChild(node);
//       node = nextNode;
//     } while (node);
//     const endOfBoundary = node;
//     // Insert all the children from the contentNode between the start and end of suspense boundary.
//     while (contentNode.firstChild) {
//       parentInstance.insertBefore(contentNode.firstChild, endOfBoundary);
//     }
//     suspenseNode.data = SUSPENSE_START_DATA;
//   } else {
//     suspenseNode.data = SUSPENSE_FALLBACK_START_DATA;
//     suspenseIdNode.setAttribute('data-dgst', errorDigest)
//   }
//   if (suspenseNode._reactRetry) {
//     suspenseNode._reactRetry();
//   }
// }
// function completeSegment(containerID, placeholderID) {
//   const segmentContainer = document.getElementById(containerID);
//   const placeholderNode = document.getElementById(placeholderID);
//   // We always expect both nodes to exist here because, while we might
//   // have navigated away from the main tree, we still expect the detached
//   // tree to exist.
//   segmentContainer.parentNode.removeChild(segmentContainer);
//   while (segmentContainer.firstChild) {
//     placeholderNode.parentNode.insertBefore(
//       segmentContainer.firstChild,
//       placeholderNode,
//     );
//   }
//   placeholderNode.parentNode.removeChild(placeholderNode);
// }

var completeSegmentFunction = 'function $RS(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)}';
var completeBoundaryFunction = 'function $RC(b,c,d){c=document.getElementById(c);c.parentNode.removeChild(c);var a=document.getElementById(b);if(a){b=a.previousSibling;if(d)b.data="$!",a.setAttribute("data-dgst",d);else{d=b.parentNode;a=b.nextSibling;var e=0;do{if(a&&a.nodeType===8){var h=a.data;if(h==="/$")if(0===e)break;else e--;else h!=="$"&&h!=="$?"&&h!=="$!"||e++}h=a.nextSibling;d.removeChild(a);a=h}while(a);for(;c.firstChild;)d.insertBefore(c.firstChild,a);b.data="$"}b._reactRetry&&b._reactRetry()}}';
var styleInsertionFunction = '$RM=new Map;function $RR(p,q,t){function r(l){this.s=l}for(var m=new Map,n=document,g,e,f=n.querySelectorAll("link[data-rprec]"),d=0;e=f[d++];)m.set(e.dataset.rprec,g=e);e=0;f=[];for(var c,h,b,a;c=t[e++];){var k=0;h=c[k++];if(b=$RM.get(h))"l"!==b.s&&f.push(b);else{a=n.createElement("link");a.href=h;a.rel="stylesheet";for(a.dataset.rprec=d=c[k++];b=c[k++];)a.setAttribute(b,c[k++]);b=a._p=new Promise(function(l,u){a.onload=l;a.onerror=u});b.then(r.bind(b,"l"),r.bind(b,"e"));$RM.set(h,b);f.push(b);c=m.get(d)||g;c===g&&(g=a);m.set(d,a);c?c.parentNode.insertBefore(a,c.nextSibling):(d=n.head,d.insertBefore(a,d.firstChild))}}Promise.all(f).then($RC.bind(null,p,q,""),$RC.bind(null,p,q,"Resource failed to load"))}';
var clientRenderFunction = 'function $RX(b,c,d,e){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),b._reactRetry&&b._reactRetry())}';
var completeSegmentScript1Full = stringToPrecomputedChunk(completeSegmentFunction + ';$RS("');
var completeSegmentScript1Partial = stringToPrecomputedChunk('$RS("');
var completeSegmentScript2 = stringToPrecomputedChunk('","');
var completeSegmentScript3 = stringToPrecomputedChunk('")</script>');
var completeBoundaryScript1Full = stringToPrecomputedChunk(completeBoundaryFunction + ';$RC("');
var completeBoundaryScript1Partial = stringToPrecomputedChunk('$RC("');
var completeBoundaryWithStylesScript1FullBoth = stringToPrecomputedChunk(completeBoundaryFunction + ';' + styleInsertionFunction + ';$RR("');
var completeBoundaryWithStylesScript1FullPartial = stringToPrecomputedChunk(styleInsertionFunction + ';$RR("');
var completeBoundaryWithStylesScript1Partial = stringToPrecomputedChunk('$RR("');
var completeBoundaryScript2 = stringToPrecomputedChunk('","');
var completeBoundaryScript2a = stringToPrecomputedChunk('",');
var completeBoundaryScript3 = stringToPrecomputedChunk('"');
var completeBoundaryScript4 = stringToPrecomputedChunk(')</script>');
var clientRenderScript1Full = stringToPrecomputedChunk(clientRenderFunction + ';$RX("');
var clientRenderScript1Partial = stringToPrecomputedChunk('$RX("');
var clientRenderScript1A = stringToPrecomputedChunk('"');
var clientRenderScript2 = stringToPrecomputedChunk(')</script>');
var clientRenderErrorScriptArgInterstitial = stringToPrecomputedChunk(',');

var arrayFirstOpenBracket = stringToPrecomputedChunk('[');
var arraySubsequentOpenBracket = stringToPrecomputedChunk(',[');
var arrayInterstitial = stringToPrecomputedChunk(',');
var arrayCloseBracket = stringToPrecomputedChunk(']');

var rendererSigil;

{
  // Use this to detect multiple renderers using the same context
  rendererSigil = {};
} // Used to store the parent path of all context overrides in a shared linked list.
// Forming a reverse tree.


var rootContextSnapshot = null; // We assume that this runtime owns the "current" field on all ReactContext instances.
// This global (actually thread local) state represents what state all those "current",
// fields are currently in.

var currentActiveSnapshot = null;

function popNode(prev) {
  {
    prev.context._currentValue = prev.parentValue;
  }
}

function pushNode(next) {
  {
    next.context._currentValue = next.value;
  }
}

function popToNearestCommonAncestor(prev, next) {
  if (prev === next) ; else {
    popNode(prev);
    var parentPrev = prev.parent;
    var parentNext = next.parent;

    if (parentPrev === null) {
      if (parentNext !== null) {
        throw new Error('The stacks must reach the root at the same time. This is a bug in React.');
      }
    } else {
      if (parentNext === null) {
        throw new Error('The stacks must reach the root at the same time. This is a bug in React.');
      }

      popToNearestCommonAncestor(parentPrev, parentNext); // On the way back, we push the new ones that weren't common.

      pushNode(next);
    }
  }
}

function popAllPrevious(prev) {
  popNode(prev);
  var parentPrev = prev.parent;

  if (parentPrev !== null) {
    popAllPrevious(parentPrev);
  }
}

function pushAllNext(next) {
  var parentNext = next.parent;

  if (parentNext !== null) {
    pushAllNext(parentNext);
  }

  pushNode(next);
}

function popPreviousToCommonLevel(prev, next) {
  popNode(prev);
  var parentPrev = prev.parent;

  if (parentPrev === null) {
    throw new Error('The depth must equal at least at zero before reaching the root. This is a bug in React.');
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
  var parentNext = next.parent;

  if (parentNext === null) {
    throw new Error('The depth must equal at least at zero before reaching the root. This is a bug in React.');
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
  var prev = currentActiveSnapshot;
  var next = newSnapshot;

  if (prev !== next) {
    if (prev === null) {
      // $FlowFixMe: This has to be non-null since it's not equal to prev.
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
  var prevValue;

  {
    prevValue = context._currentValue;
    context._currentValue = nextValue;

    {
      if (context._currentRenderer !== undefined && context._currentRenderer !== null && context._currentRenderer !== rendererSigil) {
        error('Detected multiple renderers concurrently rendering the ' + 'same context provider. This is currently unsupported.');
      }

      context._currentRenderer = rendererSigil;
    }
  }

  var prevNode = currentActiveSnapshot;
  var newNode = {
    parent: prevNode,
    depth: prevNode === null ? 0 : prevNode.depth + 1,
    context: context,
    parentValue: prevValue,
    value: nextValue
  };
  currentActiveSnapshot = newNode;
  return newNode;
}
function popProvider() {
  var prevSnapshot = currentActiveSnapshot;

  if (prevSnapshot === null) {
    throw new Error('Tried to pop a Context at the root of the app. This is a bug in React.');
  }

  {
    var value = prevSnapshot.parentValue;

    if (value === REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED) {
      prevSnapshot.context._currentValue = prevSnapshot.context._defaultValue;
    } else {
      prevSnapshot.context._currentValue = value;
    }
  }

  return currentActiveSnapshot = prevSnapshot.parent;
}
function getActiveContext() {
  return currentActiveSnapshot;
}
function readContext(context) {
  var value =  context._currentValue ;
  return value;
}

// Corresponds to ReactFiberWakeable and ReactFizzWakeable modules. Generally,
// changes to one module should be reflected in the others.
// TODO: Rename this module and the corresponding Fiber one to "Thenable"
// instead of "Wakeable". Or some other more appropriate name.
// TODO: Sparse arrays are bad for performance.
function createThenableState() {
  // The ThenableState is created the first time a component suspends. If it
  // suspends again, we'll reuse the same state.
  return [];
}
function trackSuspendedWakeable(wakeable) {
  // If this wakeable isn't already a thenable, turn it into one now. Then,
  // when we resume the work loop, we can check if its status is
  // still pending.
  // TODO: Get rid of the Wakeable type? It's superseded by UntrackedThenable.
  var thenable = wakeable; // We use an expando to track the status and result of a thenable so that we
  // can synchronously unwrap the value. Think of this as an extension of the
  // Promise API, or a custom interface that is a superset of Thenable.
  //
  // If the thenable doesn't have a status, set it to "pending" and attach
  // a listener that will update its status and result when it resolves.

  switch (thenable.status) {
    case 'fulfilled':
    case 'rejected':
      // A thenable that already resolved shouldn't have been thrown, so this is
      // unexpected. Suggests a mistake in a userspace data library. Don't track
      // this thenable, because if we keep trying it will likely infinite loop
      // without ever resolving.
      // TODO: Log a warning?
      break;

    default:
      {
        if (typeof thenable.status === 'string') {
          // Only instrument the thenable if the status if not defined. If
          // it's defined, but an unknown value, assume it's been instrumented by
          // some custom userspace implementation. We treat it as "pending".
          break;
        }

        var pendingThenable = thenable;
        pendingThenable.status = 'pending';
        pendingThenable.then(function (fulfilledValue) {
          if (thenable.status === 'pending') {
            var fulfilledThenable = thenable;
            fulfilledThenable.status = 'fulfilled';
            fulfilledThenable.value = fulfilledValue;
          }
        }, function (error) {
          if (thenable.status === 'pending') {
            var rejectedThenable = thenable;
            rejectedThenable.status = 'rejected';
            rejectedThenable.reason = error;
          }
        });
        break;
      }
  }
}
function trackUsedThenable(thenableState, thenable, index) {
  // This is only a separate function from trackSuspendedWakeable for symmetry
  // with Fiber.
  // TODO: Disallow throwing a thenable directly. It must go through `use` (or
  // some equivalent for internal Suspense implementations). We can't do this in
  // Fiber yet because it's a breaking change but we can do it in Server
  // Components because Server Components aren't released yet.
  thenableState[index] = thenable;
}
function getPreviouslyUsedThenableAtIndex(thenableState, index) {
  if (thenableState !== null) {
    var thenable = thenableState[index];

    if (thenable !== undefined) {
      return thenable;
    }
  }

  return null;
}

var currentRequest = null;
var thenableIndexCounter = 0;
var thenableState = null;
function prepareToUseHooksForRequest(request) {
  currentRequest = request;
}
function resetHooksForRequest() {
  currentRequest = null;
}
function prepareToUseHooksForComponent(prevThenableState) {
  thenableIndexCounter = 0;
  thenableState = prevThenableState;
}
function getThenableStateAfterSuspending() {
  var state = thenableState;
  thenableState = null;
  return state;
}

function readContext$1(context) {
  {
    if (context.$$typeof !== REACT_SERVER_CONTEXT_TYPE) {
      error('Only createServerContext is supported in Server Components.');
    }

    if (currentRequest === null) {
      error('Context can only be read while React is rendering. ' + 'In classes, you can read it in the render method or getDerivedStateFromProps. ' + 'In function components, you can read it directly in the function body, but not ' + 'inside Hooks like useReducer() or useMemo().');
    }
  }

  return readContext(context);
}

var HooksDispatcher = {
  useMemo: function (nextCreate) {
    return nextCreate();
  },
  useCallback: function (callback) {
    return callback;
  },
  useDebugValue: function () {},
  useDeferredValue: unsupportedHook,
  useTransition: unsupportedHook,
  readContext: readContext$1,
  useContext: readContext$1,
  useReducer: unsupportedHook,
  useRef: unsupportedHook,
  useState: unsupportedHook,
  useInsertionEffect: unsupportedHook,
  useLayoutEffect: unsupportedHook,
  useImperativeHandle: unsupportedHook,
  useEffect: unsupportedHook,
  useId: useId,
  useMutableSource: unsupportedHook,
  useSyncExternalStore: unsupportedHook,
  useCacheRefresh: function () {
    return unsupportedRefresh;
  },
  useMemoCache: function (size) {
    return new Array(size);
  },
  use:  use 
};

function unsupportedHook() {
  throw new Error('This Hook is not supported in Server Components.');
}

function unsupportedRefresh() {
  throw new Error('Refreshing the cache is not supported in Server Components.');
}

function useId() {
  if (currentRequest === null) {
    throw new Error('useId can only be used while React is rendering');
  }

  var id = currentRequest.identifierCount++; // use 'S' for Flight components to distinguish from 'R' and 'r' in Fizz/Client

  return ':' + currentRequest.identifierPrefix + 'S' + id.toString(32) + ':';
}

function use(usable) {
  if (usable !== null && typeof usable === 'object') {
    // $FlowFixMe[method-unbinding]
    if (typeof usable.then === 'function') {
      // This is a thenable.
      var thenable = usable; // Track the position of the thenable within this fiber.

      var index = thenableIndexCounter;
      thenableIndexCounter += 1;

      switch (thenable.status) {
        case 'fulfilled':
          {
            var fulfilledValue = thenable.value;
            return fulfilledValue;
          }

        case 'rejected':
          {
            var rejectedError = thenable.reason;
            throw rejectedError;
          }

        default:
          {
            var prevThenableAtIndex = getPreviouslyUsedThenableAtIndex(thenableState, index);

            if (prevThenableAtIndex !== null) {
              switch (prevThenableAtIndex.status) {
                case 'fulfilled':
                  {
                    var _fulfilledValue = prevThenableAtIndex.value;
                    return _fulfilledValue;
                  }

                case 'rejected':
                  {
                    var _rejectedError = prevThenableAtIndex.reason;
                    throw _rejectedError;
                  }

                default:
                  {
                    // The thenable still hasn't resolved. Suspend with the same
                    // thenable as last time to avoid redundant listeners.
                    throw prevThenableAtIndex;
                  }
              }
            } else {
              // This is the first time something has been used at this index.
              // Stash the thenable at the current index so we can reuse it during
              // the next attempt.
              if (thenableState === null) {
                thenableState = createThenableState();
              }

              trackUsedThenable(thenableState, thenable, index); // Suspend.
              // TODO: Throwing here is an implementation detail that allows us to
              // unwind the call stack. But we shouldn't allow it to leak into
              // userspace. Throw an opaque placeholder value instead of the
              // actual thenable. If it doesn't get captured by the work loop, log
              // a warning, because that means something in userspace must have
              // caught it.

              throw thenable;
            }
          }
      }
    } else if (usable.$$typeof === REACT_SERVER_CONTEXT_TYPE) {
      var context = usable;
      return readContext$1(context);
    }
  } // eslint-disable-next-line react-internal/safe-string-coercion


  throw new Error('An unsupported type was passed to use(): ' + String(usable));
}

var DefaultCacheDispatcher = {
  getCacheSignal: function () {
    throw new Error('Not implemented.');
  },
  getCacheForType: function (resourceType) {
    if (!currentCache) {
      throw new Error('Reading the cache is only supported while rendering.');
    }

    var entry = currentCache.get(resourceType);

    if (entry === undefined) {
      entry = resourceType(); // TODO: Warn if undefined?
      // $FlowFixMe[incompatible-use] found when upgrading Flow

      currentCache.set(resourceType, entry);
    }

    return entry;
  }
};
var currentCache = null;
function setCurrentCache(cache) {
  currentCache = cache;
  return currentCache;
}
function getCurrentCache() {
  return currentCache;
}

var ContextRegistry = ReactSharedInternals.ContextRegistry;
function getOrCreateServerContext(globalName) {
  if (!ContextRegistry[globalName]) {
    ContextRegistry[globalName] = React.createServerContext(globalName, // $FlowFixMe function signature doesn't reflect the symbol value
    REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED);
  }

  return ContextRegistry[globalName];
}

var PENDING = 0;
var COMPLETED = 1;
var ABORTED = 3;
var ERRORED = 4;
var ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher;
var ReactCurrentCache = ReactSharedInternals.ReactCurrentCache;

function defaultErrorHandler(error) {
  console['error'](error); // Don't transform to our wrapper
}

var OPEN = 0;
var CLOSING = 1;
var CLOSED = 2;
function createRequest(model, bundlerConfig, onError, context, identifierPrefix) {
  var abortSet = new Set();
  var pingedTasks = [];
  var request = {
    status: OPEN,
    fatalError: null,
    destination: null,
    bundlerConfig: bundlerConfig,
    cache: new Map(),
    nextChunkId: 0,
    pendingChunks: 0,
    abortableTasks: abortSet,
    pingedTasks: pingedTasks,
    completedModuleChunks: [],
    completedJSONChunks: [],
    completedErrorChunks: [],
    writtenSymbols: new Map(),
    writtenModules: new Map(),
    writtenProviders: new Map(),
    identifierPrefix: identifierPrefix || '',
    identifierCount: 1,
    onError: onError === undefined ? defaultErrorHandler : onError,
    toJSON: function (key, value) {
      return resolveModelToJSON(request, this, key, value);
    }
  };
  request.pendingChunks++;
  var rootContext = createRootContext(context);
  var rootTask = createTask(request, model, rootContext, abortSet);
  pingedTasks.push(rootTask);
  return request;
}

function createRootContext(reqContext) {
  return importServerContexts(reqContext);
}

var POP = {};

function attemptResolveElement(type, key, ref, props, prevThenableState) {
  if (ref !== null && ref !== undefined) {
    // When the ref moves to the regular props object this will implicitly
    // throw for functions. We could probably relax it to a DEV warning for other
    // cases.
    throw new Error('Refs cannot be used in server components, nor passed to client components.');
  }

  if (typeof type === 'function') {
    if (isModuleReference(type)) {
      // This is a reference to a client component.
      return [REACT_ELEMENT_TYPE, type, key, props];
    } // This is a server-side component.


    prepareToUseHooksForComponent(prevThenableState);
    return type(props);
  } else if (typeof type === 'string') {
    // This is a host element. E.g. HTML.
    return [REACT_ELEMENT_TYPE, type, key, props];
  } else if (typeof type === 'symbol') {
    if (type === REACT_FRAGMENT_TYPE) {
      // For key-less fragments, we add a small optimization to avoid serializing
      // it as a wrapper.
      // TODO: If a key is specified, we should propagate its key to any children.
      // Same as if a server component has a key.
      return props.children;
    } // This might be a built-in React component. We'll let the client decide.
    // Any built-in works as long as its props are serializable.


    return [REACT_ELEMENT_TYPE, type, key, props];
  } else if (type != null && typeof type === 'object') {
    if (isModuleReference(type)) {
      // This is a reference to a client component.
      return [REACT_ELEMENT_TYPE, type, key, props];
    }

    switch (type.$$typeof) {
      case REACT_LAZY_TYPE:
        {
          var payload = type._payload;
          var init = type._init;
          var wrappedType = init(payload);
          return attemptResolveElement(wrappedType, key, ref, props, prevThenableState);
        }

      case REACT_FORWARD_REF_TYPE:
        {
          var render = type.render;
          prepareToUseHooksForComponent(prevThenableState);
          return render(props, undefined);
        }

      case REACT_MEMO_TYPE:
        {
          return attemptResolveElement(type.type, key, ref, props, prevThenableState);
        }

      case REACT_PROVIDER_TYPE:
        {
          pushProvider(type._context, props.value);

          {
            var extraKeys = Object.keys(props).filter(function (value) {
              if (value === 'children' || value === 'value') {
                return false;
              }

              return true;
            });

            if (extraKeys.length !== 0) {
              error('ServerContext can only have a value prop and children. Found: %s', JSON.stringify(extraKeys));
            }
          }

          return [REACT_ELEMENT_TYPE, type, key, // Rely on __popProvider being serialized last to pop the provider.
          {
            value: props.value,
            children: props.children,
            __pop: POP
          }];
        }
    }
  }

  throw new Error("Unsupported server component type: " + describeValueForErrorMessage(type));
}

function pingTask(request, task) {
  var pingedTasks = request.pingedTasks;
  pingedTasks.push(task);

  if (pingedTasks.length === 1) {
    scheduleWork(function () {
      return performWork(request);
    });
  }
}

function createTask(request, model, context, abortSet) {
  var id = request.nextChunkId++;
  var task = {
    id: id,
    status: PENDING,
    model: model,
    context: context,
    ping: function () {
      return pingTask(request, task);
    },
    thenableState: null
  };
  abortSet.add(task);
  return task;
}

function serializeByValueID(id) {
  return '$' + id.toString(16);
}

function serializeByRefID(id) {
  return '@' + id.toString(16);
}

function serializeModuleReference(request, parent, key, moduleReference) {
  var moduleKey = getModuleKey(moduleReference);
  var writtenModules = request.writtenModules;
  var existingId = writtenModules.get(moduleKey);

  if (existingId !== undefined) {
    if (parent[0] === REACT_ELEMENT_TYPE && key === '1') {
      // If we're encoding the "type" of an element, we can refer
      // to that by a lazy reference instead of directly since React
      // knows how to deal with lazy values. This lets us suspend
      // on this component rather than its parent until the code has
      // loaded.
      return serializeByRefID(existingId);
    }

    return serializeByValueID(existingId);
  }

  try {
    var moduleMetaData = resolveModuleMetaData(request.bundlerConfig, moduleReference);
    request.pendingChunks++;
    var moduleId = request.nextChunkId++;
    emitModuleChunk(request, moduleId, moduleMetaData);
    writtenModules.set(moduleKey, moduleId);

    if (parent[0] === REACT_ELEMENT_TYPE && key === '1') {
      // If we're encoding the "type" of an element, we can refer
      // to that by a lazy reference instead of directly since React
      // knows how to deal with lazy values. This lets us suspend
      // on this component rather than its parent until the code has
      // loaded.
      return serializeByRefID(moduleId);
    }

    return serializeByValueID(moduleId);
  } catch (x) {
    request.pendingChunks++;
    var errorId = request.nextChunkId++;
    var digest = logRecoverableError(request, x);

    {
      var _getErrorMessageAndSt = getErrorMessageAndStackDev(x),
          message = _getErrorMessageAndSt.message,
          stack = _getErrorMessageAndSt.stack;

      emitErrorChunkDev(request, errorId, digest, message, stack);
    }

    return serializeByValueID(errorId);
  }
}

function escapeStringValue(value) {
  if (value[0] === '$' || value[0] === '@') {
    // We need to escape $ or @ prefixed strings since we use those to encode
    // references to IDs and as special symbol values.
    return '$' + value;
  } else {
    return value;
  }
}

function isObjectPrototype(object) {
  if (!object) {
    return false;
  }

  var ObjectPrototype = Object.prototype;

  if (object === ObjectPrototype) {
    return true;
  } // It might be an object from a different Realm which is
  // still just a plain simple object.


  if (Object.getPrototypeOf(object)) {
    return false;
  }

  var names = Object.getOwnPropertyNames(object);

  for (var i = 0; i < names.length; i++) {
    if (!(names[i] in ObjectPrototype)) {
      return false;
    }
  }

  return true;
}

function isSimpleObject(object) {
  if (!isObjectPrototype(Object.getPrototypeOf(object))) {
    return false;
  }

  var names = Object.getOwnPropertyNames(object);

  for (var i = 0; i < names.length; i++) {
    var descriptor = Object.getOwnPropertyDescriptor(object, names[i]);

    if (!descriptor) {
      return false;
    }

    if (!descriptor.enumerable) {
      if ((names[i] === 'key' || names[i] === 'ref') && typeof descriptor.get === 'function') {
        // React adds key and ref getters to props objects to issue warnings.
        // Those getters will not be transferred to the client, but that's ok,
        // so we'll special case them.
        continue;
      }

      return false;
    }
  }

  return true;
}

function objectName(object) {
  // $FlowFixMe[method-unbinding]
  var name = Object.prototype.toString.call(object);
  return name.replace(/^\[object (.*)\]$/, function (m, p0) {
    return p0;
  });
}

function describeKeyForErrorMessage(key) {
  var encodedKey = JSON.stringify(key);
  return '"' + key + '"' === encodedKey ? key : encodedKey;
}

function describeValueForErrorMessage(value) {
  switch (typeof value) {
    case 'string':
      {
        return JSON.stringify(value.length <= 10 ? value : value.substr(0, 10) + '...');
      }

    case 'object':
      {
        if (isArray(value)) {
          return '[...]';
        }

        var name = objectName(value);

        if (name === 'Object') {
          return '{...}';
        }

        return name;
      }

    case 'function':
      return 'function';

    default:
      // eslint-disable-next-line react-internal/safe-string-coercion
      return String(value);
  }
}

function describeObjectForErrorMessage(objectOrArray, expandedName) {
  if (isArray(objectOrArray)) {
    var str = '[';
    var array = objectOrArray;

    for (var i = 0; i < array.length; i++) {
      if (i > 0) {
        str += ', ';
      }

      if (i > 6) {
        str += '...';
        break;
      }

      var _value = array[i];

      if ('' + i === expandedName && typeof _value === 'object' && _value !== null) {
        // $FlowFixMe[incompatible-call] found when upgrading Flow
        str += describeObjectForErrorMessage(_value);
      } else {
        str += describeValueForErrorMessage(_value);
      }
    }

    str += ']';
    return str;
  } else {
    var _str = '{';
    var object = objectOrArray;
    var names = Object.keys(object);

    for (var _i = 0; _i < names.length; _i++) {
      if (_i > 0) {
        _str += ', ';
      }

      if (_i > 6) {
        _str += '...';
        break;
      }

      var name = names[_i];
      _str += describeKeyForErrorMessage(name) + ': ';
      var _value2 = object[name];

      if (name === expandedName && typeof _value2 === 'object' && _value2 !== null) {
        // $FlowFixMe[incompatible-call] found when upgrading Flow
        _str += describeObjectForErrorMessage(_value2);
      } else {
        _str += describeValueForErrorMessage(_value2);
      }
    }

    _str += '}';
    return _str;
  }
}

var insideContextProps = null;
var isInsideContextValue = false;
function resolveModelToJSON(request, parent, key, value) {
  {
    // $FlowFixMe
    var originalValue = parent[key];

    if (typeof originalValue === 'object' && originalValue !== value) {
      error('Only plain objects can be passed to client components from server components. ' + 'Objects with toJSON methods are not supported. Convert it manually ' + 'to a simple value before passing it to props. ' + 'Remove %s from these props: %s', describeKeyForErrorMessage(key), describeObjectForErrorMessage(parent));
    }
  } // Special Symbols


  switch (value) {
    case REACT_ELEMENT_TYPE:
      return '$';
  }

  {
    if (parent[0] === REACT_ELEMENT_TYPE && parent[1] && parent[1].$$typeof === REACT_PROVIDER_TYPE && key === '3') {
      insideContextProps = value;
    } else if (insideContextProps === parent && key === 'value') {
      isInsideContextValue = true;
    } else if (insideContextProps === parent && key === 'children') {
      isInsideContextValue = false;
    }
  } // Resolve server components.


  while (typeof value === 'object' && value !== null && (value.$$typeof === REACT_ELEMENT_TYPE || value.$$typeof === REACT_LAZY_TYPE)) {
    {
      if (isInsideContextValue) {
        error('React elements are not allowed in ServerContext');
      }
    }

    try {
      switch (value.$$typeof) {
        case REACT_ELEMENT_TYPE:
          {
            // TODO: Concatenate keys of parents onto children.
            var element = value; // Attempt to render the server component.

            value = attemptResolveElement(element.type, element.key, element.ref, element.props, null);
            break;
          }

        case REACT_LAZY_TYPE:
          {
            var payload = value._payload;
            var init = value._init;
            value = init(payload);
            break;
          }
      }
    } catch (x) {
      if (typeof x === 'object' && x !== null && typeof x.then === 'function') {
        // Something suspended, we'll need to create a new task and resolve it later.
        request.pendingChunks++;
        var newTask = createTask(request, value, getActiveContext(), request.abortableTasks);
        var ping = newTask.ping;
        x.then(ping, ping);
        var wakeable = x;
        trackSuspendedWakeable(wakeable);
        newTask.thenableState = getThenableStateAfterSuspending();
        return serializeByRefID(newTask.id);
      } else {
        logRecoverableError(request, x); // Something errored. We'll still send everything we have up until this point.
        // We'll replace this element with a lazy reference that throws on the client
        // once it gets rendered.

        request.pendingChunks++;
        var errorId = request.nextChunkId++;
        var digest = logRecoverableError(request, x);

        {
          var _getErrorMessageAndSt2 = getErrorMessageAndStackDev(x),
              message = _getErrorMessageAndSt2.message,
              stack = _getErrorMessageAndSt2.stack;

          emitErrorChunkDev(request, errorId, digest, message, stack);
        }

        return serializeByRefID(errorId);
      }
    }
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'object') {
    if (isModuleReference(value)) {
      return serializeModuleReference(request, parent, key, value);
    } else if (value.$$typeof === REACT_PROVIDER_TYPE) {
      var providerKey = value._context._globalName;
      var writtenProviders = request.writtenProviders;
      var providerId = writtenProviders.get(key);

      if (providerId === undefined) {
        request.pendingChunks++;
        providerId = request.nextChunkId++;
        writtenProviders.set(providerKey, providerId);
        emitProviderChunk(request, providerId, providerKey);
      }

      return serializeByValueID(providerId);
    } else if (value === POP) {
      popProvider();

      {
        insideContextProps = null;
        isInsideContextValue = false;
      }

      return undefined;
    }

    {
      if (value !== null && !isArray(value)) {
        // Verify that this is a simple plain object.
        if (objectName(value) !== 'Object') {
          error('Only plain objects can be passed to client components from server components. ' + 'Built-ins like %s are not supported. ' + 'Remove %s from these props: %s', objectName(value), describeKeyForErrorMessage(key), describeObjectForErrorMessage(parent));
        } else if (!isSimpleObject(value)) {
          error('Only plain objects can be passed to client components from server components. ' + 'Classes or other objects with methods are not supported. ' + 'Remove %s from these props: %s', describeKeyForErrorMessage(key), describeObjectForErrorMessage(parent, key));
        } else if (Object.getOwnPropertySymbols) {
          var symbols = Object.getOwnPropertySymbols(value);

          if (symbols.length > 0) {
            error('Only plain objects can be passed to client components from server components. ' + 'Objects with symbol properties like %s are not supported. ' + 'Remove %s from these props: %s', symbols[0].description, describeKeyForErrorMessage(key), describeObjectForErrorMessage(parent, key));
          }
        }
      }
    } // $FlowFixMe


    return value;
  }

  if (typeof value === 'string') {
    return escapeStringValue(value);
  }

  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'undefined') {
    return value;
  }

  if (typeof value === 'function') {
    if (isModuleReference(value)) {
      return serializeModuleReference(request, parent, key, value);
    }

    if (/^on[A-Z]/.test(key)) {
      throw new Error('Event handlers cannot be passed to client component props. ' + ("Remove " + describeKeyForErrorMessage(key) + " from these props if possible: " + describeObjectForErrorMessage(parent) + "\n") + 'If you need interactivity, consider converting part of this to a client component.');
    } else {
      throw new Error('Functions cannot be passed directly to client components ' + "because they're not serializable. " + ("Remove " + describeKeyForErrorMessage(key) + " (" + (value.displayName || value.name || 'function') + ") from this object, or avoid the entire object: " + describeObjectForErrorMessage(parent)));
    }
  }

  if (typeof value === 'symbol') {
    var writtenSymbols = request.writtenSymbols;
    var existingId = writtenSymbols.get(value);

    if (existingId !== undefined) {
      return serializeByValueID(existingId);
    } // $FlowFixMe `description` might be undefined


    var name = value.description;

    if (Symbol.for(name) !== value) {
      throw new Error('Only global symbols received from Symbol.for(...) can be passed to client components. ' + ("The symbol Symbol.for(" + // $FlowFixMe `description` might be undefined
      value.description + ") cannot be found among global symbols. ") + ("Remove " + describeKeyForErrorMessage(key) + " from this object, or avoid the entire object: " + describeObjectForErrorMessage(parent)));
    }

    request.pendingChunks++;
    var symbolId = request.nextChunkId++;
    emitSymbolChunk(request, symbolId, name);
    writtenSymbols.set(value, symbolId);
    return serializeByValueID(symbolId);
  } // $FlowFixMe: bigint isn't added to Flow yet.


  if (typeof value === 'bigint') {
    throw new Error("BigInt (" + value + ") is not yet supported in client component props. " + ("Remove " + describeKeyForErrorMessage(key) + " from this object or use a plain number instead: " + describeObjectForErrorMessage(parent)));
  }

  throw new Error("Type " + typeof value + " is not supported in client component props. " + ("Remove " + describeKeyForErrorMessage(key) + " from this object, or avoid the entire object: " + describeObjectForErrorMessage(parent)));
}

function logRecoverableError(request, error) {
  var onError = request.onError;
  var errorDigest = onError(error);

  if (errorDigest != null && typeof errorDigest !== 'string') {
    // eslint-disable-next-line react-internal/prod-error-codes
    throw new Error("onError returned something with a type other than \"string\". onError should return a string and may return null or undefined but must not return anything else. It received something of type \"" + typeof errorDigest + "\" instead");
  }

  return errorDigest || '';
}

function getErrorMessageAndStackDev(error) {
  {
    var message;
    var stack = '';

    try {
      if (error instanceof Error) {
        // eslint-disable-next-line react-internal/safe-string-coercion
        message = String(error.message); // eslint-disable-next-line react-internal/safe-string-coercion

        stack = String(error.stack);
      } else {
        message = 'Error: ' + error;
      }
    } catch (x) {
      message = 'An error occurred but serializing the error message failed.';
    }

    return {
      message: message,
      stack: stack
    };
  }
}

function fatalError(request, error) {
  // This is called outside error handling code such as if an error happens in React internals.
  if (request.destination !== null) {
    request.status = CLOSED;
    closeWithError(request.destination, error);
  } else {
    request.status = CLOSING;
    request.fatalError = error;
  }
}

function emitErrorChunkProd(request, id, digest) {
  var processedChunk = processErrorChunkProd(request, id, digest);
  request.completedErrorChunks.push(processedChunk);
}

function emitErrorChunkDev(request, id, digest, message, stack) {
  var processedChunk = processErrorChunkDev(request, id, digest, message, stack);
  request.completedErrorChunks.push(processedChunk);
}

function emitModuleChunk(request, id, moduleMetaData) {
  var processedChunk = processModuleChunk(request, id, moduleMetaData);
  request.completedModuleChunks.push(processedChunk);
}

function emitSymbolChunk(request, id, name) {
  var processedChunk = processSymbolChunk(request, id, name);
  request.completedModuleChunks.push(processedChunk);
}

function emitProviderChunk(request, id, contextName) {
  var processedChunk = processProviderChunk(request, id, contextName);
  request.completedJSONChunks.push(processedChunk);
}

function retryTask(request, task) {
  if (task.status !== PENDING) {
    // We completed this by other means before we had a chance to retry it.
    return;
  }

  switchContext(task.context);

  try {
    var _value3 = task.model;

    if (typeof _value3 === 'object' && _value3 !== null && _value3.$$typeof === REACT_ELEMENT_TYPE) {
      // TODO: Concatenate keys of parents onto children.
      var element = _value3; // When retrying a component, reuse the thenableState from the
      // previous attempt.

      var prevThenableState = task.thenableState; // Attempt to render the server component.
      // Doing this here lets us reuse this same task if the next component
      // also suspends.

      task.model = _value3;
      _value3 = attemptResolveElement(element.type, element.key, element.ref, element.props, prevThenableState); // Successfully finished this component. We're going to keep rendering
      // using the same task, but we reset its thenable state before continuing.

      task.thenableState = null; // Keep rendering and reuse the same task. This inner loop is separate
      // from the render above because we don't need to reset the thenable state
      // until the next time something suspends and retries.

      while (typeof _value3 === 'object' && _value3 !== null && _value3.$$typeof === REACT_ELEMENT_TYPE) {
        // TODO: Concatenate keys of parents onto children.
        var nextElement = _value3;
        task.model = _value3;
        _value3 = attemptResolveElement(nextElement.type, nextElement.key, nextElement.ref, nextElement.props, null);
      }
    }

    var processedChunk = processModelChunk(request, task.id, _value3);
    request.completedJSONChunks.push(processedChunk);
    request.abortableTasks.delete(task);
    task.status = COMPLETED;
  } catch (x) {
    if (typeof x === 'object' && x !== null && typeof x.then === 'function') {
      // Something suspended again, let's pick it back up later.
      var ping = task.ping;
      x.then(ping, ping);
      var wakeable = x;
      trackSuspendedWakeable(wakeable);
      task.thenableState = getThenableStateAfterSuspending();
      return;
    } else {
      request.abortableTasks.delete(task);
      task.status = ERRORED;
      var digest = logRecoverableError(request, x);

      {
        var _getErrorMessageAndSt3 = getErrorMessageAndStackDev(x),
            message = _getErrorMessageAndSt3.message,
            stack = _getErrorMessageAndSt3.stack;

        emitErrorChunkDev(request, task.id, digest, message, stack);
      }
    }
  }
}

function performWork(request) {
  var prevDispatcher = ReactCurrentDispatcher.current;
  var prevCacheDispatcher = ReactCurrentCache.current;
  var prevCache = getCurrentCache();
  ReactCurrentDispatcher.current = HooksDispatcher;
  ReactCurrentCache.current = DefaultCacheDispatcher;
  setCurrentCache(request.cache);
  prepareToUseHooksForRequest(request);

  try {
    var pingedTasks = request.pingedTasks;
    request.pingedTasks = [];

    for (var i = 0; i < pingedTasks.length; i++) {
      var task = pingedTasks[i];
      retryTask(request, task);
    }

    if (request.destination !== null) {
      flushCompletedChunks(request, request.destination);
    }
  } catch (error) {
    logRecoverableError(request, error);
    fatalError(request, error);
  } finally {
    ReactCurrentDispatcher.current = prevDispatcher;
    ReactCurrentCache.current = prevCacheDispatcher;
    setCurrentCache(prevCache);
    resetHooksForRequest();
  }
}

function abortTask(task, request, errorId) {
  task.status = ABORTED; // Instead of emitting an error per task.id, we emit a model that only
  // has a single value referencing the error.

  var ref = serializeByValueID(errorId);
  var processedChunk = processReferenceChunk(request, task.id, ref);
  request.completedErrorChunks.push(processedChunk);
}

function flushCompletedChunks(request, destination) {
  beginWriting();

  try {
    // We emit module chunks first in the stream so that
    // they can be preloaded as early as possible.
    var moduleChunks = request.completedModuleChunks;
    var i = 0;

    for (; i < moduleChunks.length; i++) {
      request.pendingChunks--;
      var chunk = moduleChunks[i];
      var keepWriting = writeChunkAndReturn(destination, chunk);

      if (!keepWriting) {
        request.destination = null;
        i++;
        break;
      }
    }

    moduleChunks.splice(0, i); // Next comes model data.

    var jsonChunks = request.completedJSONChunks;
    i = 0;

    for (; i < jsonChunks.length; i++) {
      request.pendingChunks--;
      var _chunk = jsonChunks[i];

      var _keepWriting = writeChunkAndReturn(destination, _chunk);

      if (!_keepWriting) {
        request.destination = null;
        i++;
        break;
      }
    }

    jsonChunks.splice(0, i); // Finally, errors are sent. The idea is that it's ok to delay
    // any error messages and prioritize display of other parts of
    // the page.

    var errorChunks = request.completedErrorChunks;
    i = 0;

    for (; i < errorChunks.length; i++) {
      request.pendingChunks--;
      var _chunk2 = errorChunks[i];

      var _keepWriting2 = writeChunkAndReturn(destination, _chunk2);

      if (!_keepWriting2) {
        request.destination = null;
        i++;
        break;
      }
    }

    errorChunks.splice(0, i);
  } finally {
    completeWriting(destination);
  }

  if (request.pendingChunks === 0) {
    // We're done.
    close(destination);
  }
}

function startWork(request) {
  scheduleWork(function () {
    return performWork(request);
  });
}
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
    flushCompletedChunks(request, destination);
  } catch (error) {
    logRecoverableError(request, error);
    fatalError(request, error);
  }
} // This is called to early terminate a request. It creates an error at all pending tasks.

function abort(request, reason) {
  try {
    var abortableTasks = request.abortableTasks;

    if (abortableTasks.size > 0) {
      // We have tasks to abort. We'll emit one error row and then emit a reference
      // to that row from every row that's still remaining.
      var _error = reason === undefined ? new Error('The render was aborted by the server without a reason.') : reason;

      var digest = logRecoverableError(request, _error);
      request.pendingChunks++;
      var errorId = request.nextChunkId++;

      if (true) {
        var _getErrorMessageAndSt4 = getErrorMessageAndStackDev(_error),
            message = _getErrorMessageAndSt4.message,
            stack = _getErrorMessageAndSt4.stack;

        emitErrorChunkDev(request, errorId, digest, message, stack);
      } else {}

      abortableTasks.forEach(function (task) {
        return abortTask(task, request, errorId);
      });
      abortableTasks.clear();
    }

    if (request.destination !== null) {
      flushCompletedChunks(request, request.destination);
    }
  } catch (error) {
    logRecoverableError(request, error);
    fatalError(request, error);
  }
}

function importServerContexts(contexts) {
  if (contexts) {
    var prevContext = getActiveContext();
    switchContext(rootContextSnapshot);

    for (var i = 0; i < contexts.length; i++) {
      var _contexts$i = contexts[i],
          name = _contexts$i[0],
          _value4 = _contexts$i[1];
      var context = getOrCreateServerContext(name);
      pushProvider(context, _value4);
    }

    var importedContext = getActiveContext();
    switchContext(prevContext);
    return importedContext;
  }

  return rootContextSnapshot;
}

function renderToReadableStream(model, webpackMap, options) {
  var request = createRequest(model, webpackMap, options ? options.onError : undefined, options ? options.context : undefined, options ? options.identifierPrefix : undefined);

  if (options && options.signal) {
    var signal = options.signal;

    if (signal.aborted) {
      abort(request, signal.reason);
    } else {
      var listener = function () {
        abort(request, signal.reason);
        signal.removeEventListener('abort', listener);
      };

      signal.addEventListener('abort', listener);
    }
  }

  var stream = new ReadableStream({
    type: 'bytes',
    start: function (controller) {
      startWork(request);
    },
    pull: function (controller) {
      startFlowing(request, controller);
    },
    cancel: function (reason) {}
  }, // $FlowFixMe size() methods are not allowed on byte streams.
  {
    highWaterMark: 0
  });
  return stream;
}

exports.renderToReadableStream = renderToReadableStream;
  })();
}


/***/ }),

/***/ 396:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

/**
 * @license React
 * react-server-dom-webpack-writer.browser.production.min.server.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var aa=__nccwpck_require__(522);var e=null,l=0;function p(a,b){if(0!==b.length)if(512<b.length)0<l&&(a.enqueue(new Uint8Array(e.buffer,0,l)),e=new Uint8Array(512),l=0),a.enqueue(b);else{var d=e.length-l;d<b.length&&(0===d?a.enqueue(e):(e.set(b.subarray(0,d),l),a.enqueue(e),b=b.subarray(d)),e=new Uint8Array(512),l=0);e.set(b,l);l+=b.length}return!0}var q=new TextEncoder;function r(a){return q.encode(a)}function ba(a,b){"function"===typeof a.error?a.error(b):a.close()}
var t=JSON.stringify,u=Symbol.for("react.module.reference"),v=Symbol.for("react.element"),ca=Symbol.for("react.fragment"),da=Symbol.for("react.provider"),ea=Symbol.for("react.server_context"),fa=Symbol.for("react.forward_ref"),ha=Symbol.for("react.memo"),x=Symbol.for("react.lazy"),ia=Symbol.for("react.default_value");
function y(a,b,d,c,f,h,g){this.acceptsBooleans=2===b||3===b||4===b;this.attributeName=c;this.attributeNamespace=f;this.mustUseProperty=d;this.propertyName=a;this.type=b;this.sanitizeURL=h;this.removeEmptyString=g}var ja="children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ");ja.push("innerText","textContent");ja.forEach(function(a){new y(a,0,!1,a,null,!1,!1)});
[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(a){new y(a[0],1,!1,a[1],null,!1,!1)});["contentEditable","draggable","spellCheck","value"].forEach(function(a){new y(a,2,!1,a.toLowerCase(),null,!1,!1)});["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(a){new y(a,2,!1,a,null,!1,!1)});
"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(a){new y(a,3,!1,a.toLowerCase(),null,!1,!1)});["checked","multiple","muted","selected"].forEach(function(a){new y(a,3,!0,a,null,!1,!1)});["capture","download"].forEach(function(a){new y(a,4,!1,a,null,!1,!1)});
["cols","rows","size","span"].forEach(function(a){new y(a,6,!1,a,null,!1,!1)});["rowSpan","start"].forEach(function(a){new y(a,5,!1,a.toLowerCase(),null,!1,!1)});var z=/[\-:]([a-z])/g;function A(a){return a[1].toUpperCase()}
"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(a){var b=a.replace(z,
A);new y(b,1,!1,a,null,!1,!1)});"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(a){var b=a.replace(z,A);new y(b,1,!1,a,"http://www.w3.org/1999/xlink",!1,!1)});["xml:base","xml:lang","xml:space"].forEach(function(a){var b=a.replace(z,A);new y(b,1,!1,a,"http://www.w3.org/XML/1998/namespace",!1,!1)});["tabIndex","crossOrigin"].forEach(function(a){new y(a,1,!1,a.toLowerCase(),null,!1,!1)});
new y("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1);["src","href","action","formAction"].forEach(function(a){new y(a,1,!1,a.toLowerCase(),null,!0,!0)});
var B={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,
fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},ka=["Webkit","ms","Moz","O"];Object.keys(B).forEach(function(a){ka.forEach(function(b){b=b+a.charAt(0).toUpperCase()+a.substring(1);B[b]=B[a]})});var la=Array.isArray;r("<script>");r("\x3c/script>");r('<script src="');r('<script type="module" src="');r('" integrity="');r('" async="">\x3c/script>');r("\x3c!-- --\x3e");r(' style="');r(":");r(";");r(" ");r('="');r('"');
r('=""');r(">");r("/>");r(' selected=""');r("\n");r("<!DOCTYPE html>");r("</");r(">");r('<template id="');r('"></template>');r("\x3c!--$--\x3e");r('\x3c!--$?--\x3e<template id="');r('"></template>');r("\x3c!--$!--\x3e");r("\x3c!--/$--\x3e");r("<template");r('"');r(' data-dgst="');r(' data-msg="');r(' data-stck="');r("></template>");r('<div hidden id="');r('">');r("</div>");r('<svg aria-hidden="true" style="display:none" id="');r('">');r("</svg>");r('<math aria-hidden="true" style="display:none" id="');
r('">');r("</math>");r('<table hidden id="');r('">');r("</table>");r('<table hidden><tbody id="');r('">');r("</tbody></table>");r('<table hidden><tr id="');r('">');r("</tr></table>");r('<table hidden><colgroup id="');r('">');r("</colgroup></table>");r('function $RS(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("');r('$RS("');r('","');r('")\x3c/script>');r('function $RC(b,c,d){c=document.getElementById(c);c.parentNode.removeChild(c);var a=document.getElementById(b);if(a){b=a.previousSibling;if(d)b.data="$!",a.setAttribute("data-dgst",d);else{d=b.parentNode;a=b.nextSibling;var e=0;do{if(a&&a.nodeType===8){var h=a.data;if(h==="/$")if(0===e)break;else e--;else h!=="$"&&h!=="$?"&&h!=="$!"||e++}h=a.nextSibling;d.removeChild(a);a=h}while(a);for(;c.firstChild;)d.insertBefore(c.firstChild,a);b.data="$"}b._reactRetry&&b._reactRetry()}};$RC("');
r('$RC("');r('function $RC(b,c,d){c=document.getElementById(c);c.parentNode.removeChild(c);var a=document.getElementById(b);if(a){b=a.previousSibling;if(d)b.data="$!",a.setAttribute("data-dgst",d);else{d=b.parentNode;a=b.nextSibling;var e=0;do{if(a&&a.nodeType===8){var h=a.data;if(h==="/$")if(0===e)break;else e--;else h!=="$"&&h!=="$?"&&h!=="$!"||e++}h=a.nextSibling;d.removeChild(a);a=h}while(a);for(;c.firstChild;)d.insertBefore(c.firstChild,a);b.data="$"}b._reactRetry&&b._reactRetry()}};$RM=new Map;function $RR(p,q,t){function r(l){this.s=l}for(var m=new Map,n=document,g,e,f=n.querySelectorAll("link[data-rprec]"),d=0;e=f[d++];)m.set(e.dataset.rprec,g=e);e=0;f=[];for(var c,h,b,a;c=t[e++];){var k=0;h=c[k++];if(b=$RM.get(h))"l"!==b.s&&f.push(b);else{a=n.createElement("link");a.href=h;a.rel="stylesheet";for(a.dataset.rprec=d=c[k++];b=c[k++];)a.setAttribute(b,c[k++]);b=a._p=new Promise(function(l,u){a.onload=l;a.onerror=u});b.then(r.bind(b,"l"),r.bind(b,"e"));$RM.set(h,b);f.push(b);c=m.get(d)||g;c===g&&(g=a);m.set(d,a);c?c.parentNode.insertBefore(a,c.nextSibling):(d=n.head,d.insertBefore(a,d.firstChild))}}Promise.all(f).then($RC.bind(null,p,q,""),$RC.bind(null,p,q,"Resource failed to load"))};$RR("');
r('$RM=new Map;function $RR(p,q,t){function r(l){this.s=l}for(var m=new Map,n=document,g,e,f=n.querySelectorAll("link[data-rprec]"),d=0;e=f[d++];)m.set(e.dataset.rprec,g=e);e=0;f=[];for(var c,h,b,a;c=t[e++];){var k=0;h=c[k++];if(b=$RM.get(h))"l"!==b.s&&f.push(b);else{a=n.createElement("link");a.href=h;a.rel="stylesheet";for(a.dataset.rprec=d=c[k++];b=c[k++];)a.setAttribute(b,c[k++]);b=a._p=new Promise(function(l,u){a.onload=l;a.onerror=u});b.then(r.bind(b,"l"),r.bind(b,"e"));$RM.set(h,b);f.push(b);c=m.get(d)||g;c===g&&(g=a);m.set(d,a);c?c.parentNode.insertBefore(a,c.nextSibling):(d=n.head,d.insertBefore(a,d.firstChild))}}Promise.all(f).then($RC.bind(null,p,q,""),$RC.bind(null,p,q,"Resource failed to load"))};$RR("');
r('$RR("');r('","');r('",');r('"');r(")\x3c/script>");r('function $RX(b,c,d,e){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),b._reactRetry&&b._reactRetry())};$RX("');r('$RX("');r('"');r(")\x3c/script>");r(",");r("[");r(",[");r(",");r("]");var C=null;
function D(a,b){if(a!==b){a.context._currentValue=a.parentValue;a=a.parent;var d=b.parent;if(null===a){if(null!==d)throw Error("The stacks must reach the root at the same time. This is a bug in React.");}else{if(null===d)throw Error("The stacks must reach the root at the same time. This is a bug in React.");D(a,d);b.context._currentValue=b.value}}}function ma(a){a.context._currentValue=a.parentValue;a=a.parent;null!==a&&ma(a)}
function na(a){var b=a.parent;null!==b&&na(b);a.context._currentValue=a.value}function oa(a,b){a.context._currentValue=a.parentValue;a=a.parent;if(null===a)throw Error("The depth must equal at least at zero before reaching the root. This is a bug in React.");a.depth===b.depth?D(a,b):oa(a,b)}
function pa(a,b){var d=b.parent;if(null===d)throw Error("The depth must equal at least at zero before reaching the root. This is a bug in React.");a.depth===d.depth?D(a,d):pa(a,d);b.context._currentValue=b.value}function E(a){var b=C;b!==a&&(null===b?na(a):null===a?ma(b):b.depth===a.depth?D(b,a):b.depth>a.depth?oa(b,a):pa(b,a),C=a)}function qa(a,b){var d=a._currentValue;a._currentValue=b;var c=C;return C=a={parent:c,depth:null===c?0:c.depth+1,context:a,parentValue:d,value:b}}
function ra(a){switch(a.status){case "fulfilled":case "rejected":break;default:"string"!==typeof a.status&&(a.status="pending",a.then(function(b){"pending"===a.status&&(a.status="fulfilled",a.value=b)},function(b){"pending"===a.status&&(a.status="rejected",a.reason=b)}))}}var F=null,G=0,H=null;function sa(){var a=H;H=null;return a}function ua(a){return a._currentValue}
var ya={useMemo:function(a){return a()},useCallback:function(a){return a},useDebugValue:function(){},useDeferredValue:I,useTransition:I,readContext:ua,useContext:ua,useReducer:I,useRef:I,useState:I,useInsertionEffect:I,useLayoutEffect:I,useImperativeHandle:I,useEffect:I,useId:va,useMutableSource:I,useSyncExternalStore:I,useCacheRefresh:function(){return wa},useMemoCache:function(a){return Array(a)},use:xa};function I(){throw Error("This Hook is not supported in Server Components.");}
function wa(){throw Error("Refreshing the cache is not supported in Server Components.");}function va(){if(null===F)throw Error("useId can only be used while React is rendering");var a=F.identifierCount++;return":"+F.identifierPrefix+"S"+a.toString(32)+":"}
function xa(a){if(null!==a&&"object"===typeof a)if("function"===typeof a.then){var b=G;G+=1;switch(a.status){case "fulfilled":return a.value;case "rejected":throw a.reason;default:a:{if(null!==H){var d=H[b];if(void 0!==d)break a}d=null}if(null!==d)switch(d.status){case "fulfilled":return d.value;case "rejected":throw d.reason;default:throw d;}else throw null===H&&(H=[]),H[b]=a,a;}}else if(a.$$typeof===ea)return a._currentValue;throw Error("An unsupported type was passed to use(): "+String(a));}
var za={getCacheSignal:function(){throw Error("Not implemented.");},getCacheForType:function(a){if(!J)throw Error("Reading the cache is only supported while rendering.");var b=J.get(a);void 0===b&&(b=a(),J.set(a,b));return b}},J=null,K=aa.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,L=K.ContextRegistry,M=K.ReactCurrentDispatcher,N=K.ReactCurrentCache;function Aa(a){console.error(a)}
function Ba(a,b,d,c,f){var h=new Set,g=[],k={status:0,fatalError:null,destination:null,bundlerConfig:b,cache:new Map,nextChunkId:0,pendingChunks:0,abortableTasks:h,pingedTasks:g,completedModuleChunks:[],completedJSONChunks:[],completedErrorChunks:[],writtenSymbols:new Map,writtenModules:new Map,writtenProviders:new Map,identifierPrefix:f||"",identifierCount:1,onError:void 0===d?Aa:d,toJSON:function(a,b){return Ca(k,this,a,b)}};k.pendingChunks++;b=Da(c);a=Ea(k,a,b,h);g.push(a);return k}var Fa={};
function O(a,b,d,c,f){if(null!==d&&void 0!==d)throw Error("Refs cannot be used in server components, nor passed to client components.");if("function"===typeof a){if(a.$$typeof===u)return[v,a,b,c];G=0;H=f;return a(c)}if("string"===typeof a)return[v,a,b,c];if("symbol"===typeof a)return a===ca?c.children:[v,a,b,c];if(null!=a&&"object"===typeof a){if(a.$$typeof===u)return[v,a,b,c];switch(a.$$typeof){case x:var h=a._init;a=h(a._payload);return O(a,b,d,c,f);case fa:return b=a.render,G=0,H=f,b(c,void 0);
case ha:return O(a.type,b,d,c,f);case da:return qa(a._context,c.value),[v,a,b,{value:c.value,children:c.children,__pop:Fa}]}}throw Error("Unsupported server component type: "+P(a));}function Ea(a,b,d,c){var f={id:a.nextChunkId++,status:0,model:b,context:d,ping:function(){var b=a.pingedTasks;b.push(f);1===b.length&&Ga(a)},thenableState:null};c.add(f);return f}
function Ha(a,b,d,c){var f=c.filepath+"#"+c.name+(c.async?"#async":""),h=a.writtenModules,g=h.get(f);if(void 0!==g)return b[0]===v&&"1"===d?"@"+g.toString(16):"$"+g.toString(16);try{var k=a.bundlerConfig[c.filepath][c.name];var m=c.async?{id:k.id,chunks:k.chunks,name:k.name,async:!0}:k;a.pendingChunks++;var n=a.nextChunkId++,U=t(m),V="M"+n.toString(16)+":"+U+"\n";var W=q.encode(V);a.completedModuleChunks.push(W);h.set(f,n);return b[0]===v&&"1"===d?"@"+n.toString(16):"$"+n.toString(16)}catch(X){return a.pendingChunks++,
b=a.nextChunkId++,d=Q(a,X),R(a,b,d),"$"+b.toString(16)}}function Ia(a){return Object.prototype.toString.call(a).replace(/^\[object (.*)\]$/,function(a,d){return d})}function S(a){var b=JSON.stringify(a);return'"'+a+'"'===b?a:b}function P(a){switch(typeof a){case "string":return JSON.stringify(10>=a.length?a:a.substr(0,10)+"...");case "object":if(la(a))return"[...]";a=Ia(a);return"Object"===a?"{...}":a;case "function":return"function";default:return String(a)}}
function T(a,b){if(la(a)){for(var d="[",c=0;c<a.length;c++){0<c&&(d+=", ");if(6<c){d+="...";break}var f=a[c];d=""+c===b&&"object"===typeof f&&null!==f?d+T(f):d+P(f)}return d+"]"}d="{";c=Object.keys(a);for(f=0;f<c.length;f++){0<f&&(d+=", ");if(6<f){d+="...";break}var h=c[f];d+=S(h)+": ";var g=a[h];d=h===b&&"object"===typeof g&&null!==g?d+T(g):d+P(g)}return d+"}"}
function Ca(a,b,d,c){switch(c){case v:return"$"}for(;"object"===typeof c&&null!==c&&(c.$$typeof===v||c.$$typeof===x);)try{switch(c.$$typeof){case v:var f=c;c=O(f.type,f.key,f.ref,f.props,null);break;case x:var h=c._init;c=h(c._payload)}}catch(g){if("object"===typeof g&&null!==g&&"function"===typeof g.then)return a.pendingChunks++,a=Ea(a,c,C,a.abortableTasks),c=a.ping,g.then(c,c),ra(g),a.thenableState=sa(),"@"+a.id.toString(16);Q(a,g);a.pendingChunks++;c=a.nextChunkId++;d=Q(a,g);R(a,c,d);return"@"+
c.toString(16)}if(null===c)return null;if("object"===typeof c){if(c.$$typeof===u)return Ha(a,b,d,c);if(c.$$typeof===da)return f=c._context._globalName,b=a.writtenProviders,c=b.get(d),void 0===c&&(a.pendingChunks++,c=a.nextChunkId++,b.set(f,c),d="P"+c.toString(16)+":"+f+"\n",d=q.encode(d),a.completedJSONChunks.push(d)),"$"+c.toString(16);if(c===Fa){a=C;if(null===a)throw Error("Tried to pop a Context at the root of the app. This is a bug in React.");c=a.parentValue;a.context._currentValue=c===ia?a.context._defaultValue:
c;C=a.parent;return}return c}if("string"===typeof c)return a="$"===c[0]||"@"===c[0]?"$"+c:c,a;if("boolean"===typeof c||"number"===typeof c||"undefined"===typeof c)return c;if("function"===typeof c){if(c.$$typeof===u)return Ha(a,b,d,c);if(/^on[A-Z]/.test(d))throw Error("Event handlers cannot be passed to client component props. Remove "+(S(d)+" from these props if possible: "+T(b)+"\nIf you need interactivity, consider converting part of this to a client component."));throw Error("Functions cannot be passed directly to client components because they're not serializable. Remove "+
(S(d)+" ("+(c.displayName||c.name||"function")+") from this object, or avoid the entire object: "+T(b)));}if("symbol"===typeof c){f=a.writtenSymbols;h=f.get(c);if(void 0!==h)return"$"+h.toString(16);h=c.description;if(Symbol.for(h)!==c)throw Error("Only global symbols received from Symbol.for(...) can be passed to client components. The symbol Symbol.for("+(c.description+") cannot be found among global symbols. Remove ")+(S(d)+" from this object, or avoid the entire object: "+T(b)));a.pendingChunks++;
d=a.nextChunkId++;b=t(h);b="S"+d.toString(16)+":"+b+"\n";b=q.encode(b);a.completedModuleChunks.push(b);f.set(c,d);return"$"+d.toString(16)}if("bigint"===typeof c)throw Error("BigInt ("+c+") is not yet supported in client component props. Remove "+(S(d)+" from this object or use a plain number instead: "+T(b)));throw Error("Type "+typeof c+" is not supported in client component props. Remove "+(S(d)+" from this object, or avoid the entire object: "+T(b)));}
function Q(a,b){a=a.onError;b=a(b);if(null!=b&&"string"!==typeof b)throw Error('onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "'+typeof b+'" instead');return b||""}function Y(a,b){null!==a.destination?(a.status=2,ba(a.destination,b)):(a.status=1,a.fatalError=b)}
function R(a,b,d){d={digest:d};b="E"+b.toString(16)+":"+t(d)+"\n";b=q.encode(b);a.completedErrorChunks.push(b)}
function Ga(a){var b=M.current,d=N.current,c=J;M.current=ya;N.current=za;J=a.cache;F=a;try{var f=a.pingedTasks;a.pingedTasks=[];for(var h=0;h<f.length;h++){var g=f[h];var k=a;if(0===g.status){E(g.context);try{var m=g.model;if("object"===typeof m&&null!==m&&m.$$typeof===v){var n=m,U=g.thenableState;g.model=m;m=O(n.type,n.key,n.ref,n.props,U);for(g.thenableState=null;"object"===typeof m&&null!==m&&m.$$typeof===v;)n=m,g.model=m,m=O(n.type,n.key,n.ref,n.props,null)}var V=g.id,W=t(m,k.toJSON),X="J"+V.toString(16)+
":"+W+"\n";var Ka=q.encode(X);k.completedJSONChunks.push(Ka);k.abortableTasks.delete(g);g.status=1}catch(w){if("object"===typeof w&&null!==w&&"function"===typeof w.then){var ta=g.ping;w.then(ta,ta);ra(w);g.thenableState=sa()}else{k.abortableTasks.delete(g);g.status=4;var La=Q(k,w);R(k,g.id,La)}}}}null!==a.destination&&Z(a,a.destination)}catch(w){Q(a,w),Y(a,w)}finally{M.current=b,N.current=d,J=c,F=null}}
function Z(a,b){e=new Uint8Array(512);l=0;try{for(var d=a.completedModuleChunks,c=0;c<d.length;c++)if(a.pendingChunks--,!p(b,d[c])){a.destination=null;c++;break}d.splice(0,c);var f=a.completedJSONChunks;for(c=0;c<f.length;c++)if(a.pendingChunks--,!p(b,f[c])){a.destination=null;c++;break}f.splice(0,c);var h=a.completedErrorChunks;for(c=0;c<h.length;c++)if(a.pendingChunks--,!p(b,h[c])){a.destination=null;c++;break}h.splice(0,c)}finally{e&&0<l&&(b.enqueue(new Uint8Array(e.buffer,0,l)),e=null,l=0)}0===
a.pendingChunks&&b.close()}function Ja(a,b){try{var d=a.abortableTasks;if(0<d.size){var c=Q(a,void 0===b?Error("The render was aborted by the server without a reason."):b);a.pendingChunks++;var f=a.nextChunkId++;R(a,f,c);d.forEach(function(b){b.status=3;var c="$"+f.toString(16);b=b.id;c=t(c);c="J"+b.toString(16)+":"+c+"\n";c=q.encode(c);a.completedErrorChunks.push(c)});d.clear()}null!==a.destination&&Z(a,a.destination)}catch(h){Q(a,h),Y(a,h)}}
function Da(a){if(a){var b=C;E(null);for(var d=0;d<a.length;d++){var c=a[d],f=c[0];c=c[1];L[f]||(L[f]=aa.createServerContext(f,ia));qa(L[f],c)}a=C;E(b);return a}return null}
exports.renderToReadableStream=function(a,b,d){var c=Ba(a,b,d?d.onError:void 0,d?d.context:void 0,d?d.identifierPrefix:void 0);if(d&&d.signal){var f=d.signal;if(f.aborted)Ja(c,f.reason);else{var h=function(){Ja(c,f.reason);f.removeEventListener("abort",h)};f.addEventListener("abort",h)}}return new ReadableStream({type:"bytes",start:function(){Ga(c)},pull:function(a){if(1===c.status)c.status=2,ba(a,c.fatalError);else if(2!==c.status&&null===c.destination){c.destination=a;try{Z(c,a)}catch(k){Q(c,k),
Y(c,k)}}},cancel:function(){}},{highWaterMark:0})};


/***/ }),

/***/ 784:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



if (process.env.NODE_ENV === 'production') {
  module.exports = __nccwpck_require__(396);
} else {
  module.exports = __nccwpck_require__(997);
}


/***/ }),

/***/ 522:
/***/ ((module) => {

module.exports = require("react");

/***/ }),

/***/ 255:
/***/ ((module) => {

module.exports = require("react-dom");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
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
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module used 'module' so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(784);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;