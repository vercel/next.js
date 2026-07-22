/**
 * Verbatim copies of the React Flight pieces involved in creating fake stack
 * frames, so that their semantics can be exercised end-to-end without a
 * Flight wire, a renderer, or a bundler in between.
 *
 * Producer pieces are copied from
 * `packages/next/src/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.development.js`,
 * consumer pieces from
 * `packages/next/src/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.development.js`.
 *
 * Copies must not be "improved". The only permitted deviations are marked
 * with DEVIATION comments and are limited to module plumbing (e.g. the
 * `response` object is reduced to the properties the copied code reads).
 */

/* eslint-disable */

'use strict'

// ---------------------------------------------------------------------------
// Producer: stack capture and serialization
// ---------------------------------------------------------------------------

var identifierRegExp = /^[a-zA-Z_$][0-9a-zA-Z_$]*$/,
  frameRegExp =
    /^ {3} at (?:(.+) \((?:(.+):(\d+):(\d+)|<anonymous>)\)|(?:async )?(.+):(\d+):(\d+)|<anonymous>)$/,
  stackTraceCache = new WeakMap()

var collectedStackTrace = null
var framesToSkip = 0

function collectStackTracePrivate(error, structuredStackTrace) {
  error = []
  for (var i = framesToSkip; i < structuredStackTrace.length; i++) {
    var callSite = structuredStackTrace[i],
      name = callSite.getFunctionName() || '<anonymous>'
    if (name.includes('react_stack_bottom_frame')) break
    else if (callSite.isNative())
      (callSite = callSite.isAsync()),
        error.push([name, '', 0, 0, 0, 0, callSite])
    else {
      if (callSite.isConstructor()) name = 'new ' + name
      else if (!callSite.isToplevel()) {
        var callSite$jscomp$0 = callSite
        name = callSite$jscomp$0.getTypeName()
        var methodName = callSite$jscomp$0.getMethodName()
        callSite$jscomp$0 = callSite$jscomp$0.getFunctionName()
        var result = ''
        callSite$jscomp$0
          ? (name &&
              identifierRegExp.test(callSite$jscomp$0) &&
              callSite$jscomp$0 !== name &&
              (result += name + '.'),
            (result += callSite$jscomp$0),
            !methodName ||
              callSite$jscomp$0 === methodName ||
              callSite$jscomp$0.endsWith('.' + methodName) ||
              callSite$jscomp$0.endsWith(' ' + methodName) ||
              (result += ' [as ' + methodName + ']'))
          : (name && (result += name + '.'),
            (result = methodName
              ? result + methodName
              : result + '<anonymous>'))
        name = result
      }
      '<anonymous>' === name && (name = '')
      methodName = callSite.getScriptNameOrSourceURL() || '<anonymous>'
      '<anonymous>' === methodName &&
        ((methodName = ''),
        callSite.isEval() &&
          (callSite$jscomp$0 = callSite.getEvalOrigin()) &&
          (methodName = callSite$jscomp$0.toString() + ', <anonymous>'))
      callSite$jscomp$0 = callSite.getLineNumber() || 0
      result = callSite.getColumnNumber() || 0
      var enclosingLine =
          'function' === typeof callSite.getEnclosingLineNumber
            ? callSite.getEnclosingLineNumber() || 0
            : 0,
        enclosingCol =
          'function' === typeof callSite.getEnclosingColumnNumber
            ? callSite.getEnclosingColumnNumber() || 0
            : 0
      callSite = callSite.isAsync()
      error.push([
        name,
        methodName,
        callSite$jscomp$0,
        result,
        enclosingLine,
        enclosingCol,
        callSite,
      ])
    }
  }
  collectedStackTrace = error
  return ''
}

function collectStackTrace(error, structuredStackTrace) {
  collectStackTracePrivate(error, structuredStackTrace)
  error = (error.name || 'Error') + ': ' + (error.message || '')
  for (var i = 0; i < structuredStackTrace.length; i++)
    error += '\n    at ' + structuredStackTrace[i].toString()
  return error
}

function parseStackTrace(error, skipFrames) {
  var existing = stackTraceCache.get(error)
  if (void 0 !== existing) return existing
  collectedStackTrace = null
  framesToSkip = skipFrames
  existing = Error.prepareStackTrace
  Error.prepareStackTrace = collectStackTrace
  try {
    var stack = String(error.stack)
  } finally {
    Error.prepareStackTrace = existing
  }
  if (null !== collectedStackTrace)
    return (
      (stack = collectedStackTrace),
      (collectedStackTrace = null),
      stackTraceCache.set(error, stack),
      stack
    )
  stack.startsWith('Error: react-stack-top-frame\n') &&
    (stack = stack.slice(29))
  existing = stack.indexOf('react_stack_bottom_frame')
  ;-1 !== existing && (existing = stack.lastIndexOf('\n', existing))
  ;-1 !== existing && (stack = stack.slice(0, existing))
  stack = stack.split('\n')
  for (existing = []; skipFrames < stack.length; skipFrames++) {
    var parsed = frameRegExp.exec(stack[skipFrames])
    if (parsed) {
      var name = parsed[1] || '',
        isAsync = 'async ' === parsed[8]
      '<anonymous>' === name
        ? (name = '')
        : name.startsWith('async ') && ((name = name.slice(5)), (isAsync = !0))
      var filename = parsed[2] || parsed[5] || ''
      '<anonymous>' === filename && (filename = '')
      existing.push([
        name,
        filename,
        +(parsed[3] || parsed[6]),
        +(parsed[4] || parsed[7]),
        0,
        0,
        isAsync,
      ])
    }
  }
  stackTraceCache.set(error, existing)
  return existing
}

function devirtualizeURL(url) {
  if (url.startsWith('about://React/')) {
    var envIdx = url.indexOf('/', 14),
      suffixIdx = url.lastIndexOf('?')
    if (-1 < envIdx && -1 < suffixIdx)
      return decodeURI(url.slice(envIdx + 1, suffixIdx))
  }
  return url
}

function filterStackTrace(request, stack) {
  request = request.filterStackFrame
  for (var filteredStack = [], i = 0; i < stack.length; i++) {
    var callsite = stack[i],
      functionName = callsite[0],
      url = devirtualizeURL(callsite[1])
    request(url, functionName, callsite[2], callsite[3]) &&
      ((callsite = callsite.slice(0)),
      (callsite[1] = url),
      filteredStack.push(callsite))
  }
  return filteredStack
}

// ---------------------------------------------------------------------------
// Producer: error serialization
// ---------------------------------------------------------------------------

var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"),
  REACT_LAZY_TYPE = Symbol.for("react.lazy"),
  REACT_MEMO_TYPE = Symbol.for("react.memo"),
  REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"),
  REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"),
  REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"),
  CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference"),
  stringify = JSON.stringify,
  jsxChildrenParents = new WeakMap(),
  jsxPropsParents = new WeakMap()

function objectName(object) {
  object = Object.prototype.toString.call(object);
  return object.slice(8, object.length - 1);
}
function describeKeyForErrorMessage(key) {
  var encodedKey = JSON.stringify(key);
  return '"' + key + '"' === encodedKey ? key : encodedKey;
}
function describeValueForErrorMessage(value) {
  switch (typeof value) {
    case "string":
      return JSON.stringify(
        10 >= value.length ? value : value.slice(0, 10) + "..."
      );
    case "object":
      if (isArrayImpl(value)) return "[...]";
      if (null !== value && value.$$typeof === CLIENT_REFERENCE_TAG)
        return "client";
      value = objectName(value);
      return "Object" === value ? "{...}" : value;
    case "function":
      return value.$$typeof === CLIENT_REFERENCE_TAG
        ? "client"
        : (value = value.displayName || value.name)
          ? "function " + value
          : "function";
    default:
      return String(value);
  }
}
function describeElementType(type) {
  if ("string" === typeof type) return type;
  switch (type) {
    case REACT_SUSPENSE_TYPE:
      return "Suspense";
    case REACT_SUSPENSE_LIST_TYPE:
      return "SuspenseList";
    case REACT_VIEW_TRANSITION_TYPE:
      return "ViewTransition";
  }
  if ("object" === typeof type)
    switch (type.$$typeof) {
      case REACT_FORWARD_REF_TYPE:
        return describeElementType(type.render);
      case REACT_MEMO_TYPE:
        return describeElementType(type.type);
      case REACT_LAZY_TYPE:
        var payload = type._payload;
        type = type._init;
        try {
          return describeElementType(type(payload));
        } catch (x) {}
    }
  return "";
}
function describeObjectForErrorMessage(objectOrArray, expandedName) {
  var objKind = objectName(objectOrArray);
  if ("Object" !== objKind && "Array" !== objKind) return objKind;
  var start = -1,
    length = 0;
  if (isArrayImpl(objectOrArray))
    if (jsxChildrenParents.has(objectOrArray)) {
      var type = jsxChildrenParents.get(objectOrArray);
      objKind = "<" + describeElementType(type) + ">";
      for (var i = 0; i < objectOrArray.length; i++) {
        var value = objectOrArray[i];
        value =
          "string" === typeof value
            ? value
            : "object" === typeof value && null !== value
              ? "{" + describeObjectForErrorMessage(value) + "}"
              : "{" + describeValueForErrorMessage(value) + "}";
        "" + i === expandedName
          ? ((start = objKind.length),
            (length = value.length),
            (objKind += value))
          : (objKind =
              15 > value.length && 40 > objKind.length + value.length
                ? objKind + value
                : objKind + "{...}");
      }
      objKind += "</" + describeElementType(type) + ">";
    } else {
      objKind = "[";
      for (type = 0; type < objectOrArray.length; type++)
        0 < type && (objKind += ", "),
          (i = objectOrArray[type]),
          (i =
            "object" === typeof i && null !== i
              ? describeObjectForErrorMessage(i)
              : describeValueForErrorMessage(i)),
          "" + type === expandedName
            ? ((start = objKind.length),
              (length = i.length),
              (objKind += i))
            : (objKind =
                10 > i.length && 40 > objKind.length + i.length
                  ? objKind + i
                  : objKind + "...");
      objKind += "]";
    }
  else if (objectOrArray.$$typeof === REACT_ELEMENT_TYPE)
    objKind = "<" + describeElementType(objectOrArray.type) + "/>";
  else {
    if (objectOrArray.$$typeof === CLIENT_REFERENCE_TAG) return "client";
    if (jsxPropsParents.has(objectOrArray)) {
      objKind = jsxPropsParents.get(objectOrArray);
      objKind = "<" + (describeElementType(objKind) || "...");
      type = Object.keys(objectOrArray);
      for (i = 0; i < type.length; i++) {
        objKind += " ";
        value = type[i];
        objKind += describeKeyForErrorMessage(value) + "=";
        var _value2 = objectOrArray[value];
        var _substr2 =
          value === expandedName &&
          "object" === typeof _value2 &&
          null !== _value2
            ? describeObjectForErrorMessage(_value2)
            : describeValueForErrorMessage(_value2);
        "string" !== typeof _value2 && (_substr2 = "{" + _substr2 + "}");
        value === expandedName
          ? ((start = objKind.length),
            (length = _substr2.length),
            (objKind += _substr2))
          : (objKind =
              10 > _substr2.length && 40 > objKind.length + _substr2.length
                ? objKind + _substr2
                : objKind + "...");
      }
      objKind += ">";
    } else {
      objKind = "{";
      type = Object.keys(objectOrArray);
      for (i = 0; i < type.length; i++)
        0 < i && (objKind += ", "),
          (value = type[i]),
          (objKind += describeKeyForErrorMessage(value) + ": "),
          (_value2 = objectOrArray[value]),
          (_value2 =
            "object" === typeof _value2 && null !== _value2
              ? describeObjectForErrorMessage(_value2)
              : describeValueForErrorMessage(_value2)),
          value === expandedName
            ? ((start = objKind.length),
              (length = _value2.length),
              (objKind += _value2))
            : (objKind =
                10 > _value2.length && 40 > objKind.length + _value2.length
                  ? objKind + _value2
                  : objKind + "...");
      objKind += "}";
    }
  }
  return void 0 === expandedName
    ? objKind
    : -1 < start && 0 < length
      ? ((objectOrArray = " ".repeat(start) + "^".repeat(length)),
        "\n  " + objKind + "\n  " + objectOrArray)
      : "\n  " + objKind;
}

function serializeByValueID(id) {
  return "$" + id.toString(16);
}

function serializeErrorValue(request, error) {
  var name = "Error",
    env = (0, request.environmentName)();
  try {
    name = error.name;
    var message = String(error.message);
    var stack = filterStackTrace(request, parseStackTrace(error, 0));
    var errorEnv = error.environmentName;
    "string" === typeof errorEnv && (env = errorEnv);
  } catch (x) {
    (message =
      "An error occurred but serializing the error message failed."),
      (stack = []);
  }
  name = { name: name, message: message, stack: stack, env: env };
  "cause" in error &&
    ((message = outlineModel(request, error.cause)),
    (name.cause = serializeByValueID(message)));
  "undefined" !== typeof AggregateError &&
    error instanceof AggregateError &&
    ((error = outlineModel(request, error.errors)),
    (name.errors = serializeByValueID(error)));
  return "$Z" + outlineModel(request, name).toString(16);
}

function emitErrorChunk(request, id, digest, error, debug, owner) {
  var name = "Error",
    env = (0, request.environmentName)(),
    causeReference = null,
    errorsReference = null;
  try {
    if (error instanceof Error) {
      name = error.name;
      var message = String(error.message);
      var stack = filterStackTrace(request, parseStackTrace(error, 0));
      var errorEnv = error.environmentName;
      "string" === typeof errorEnv && (env = errorEnv);
      if ("cause" in error) {
        var cause = error.cause,
          causeId = debug
            ? outlineDebugModel(request, { objectLimit: 5 }, cause)
            : outlineModel(request, cause);
        causeReference = serializeByValueID(causeId);
      }
      if (
        "undefined" !== typeof AggregateError &&
        error instanceof AggregateError
      ) {
        var errors = error.errors,
          errorsId = debug
            ? outlineDebugModel(request, { objectLimit: 5 }, errors)
            : outlineModel(request, errors);
        errorsReference = serializeByValueID(errorsId);
      }
    } else
      (message =
        "object" === typeof error && null !== error
          ? describeObjectForErrorMessage(error)
          : String(error)),
        (stack = []);
  } catch (x) {
    (message =
      "An error occurred but serializing the error message failed."),
      (stack = []);
  }
  error = null == owner ? null : outlineComponentInfo(request, owner);
  digest = {
    digest: digest,
    name: name,
    message: message,
    stack: stack,
    env: env,
    owner: error
  };
  null !== causeReference && (digest.cause = causeReference);
  null !== errorsReference && (digest.errors = errorsReference);
  id = id.toString(16) + ":E" + stringify(digest) + "\n";
  debug
    ? request.completedDebugChunks.push(id)
    : request.completedErrorChunks.push(id);
}

function outlineComponentInfo(request, componentInfo) {
  var existingRef = request.writtenDebugObjects.get(componentInfo);
  if (void 0 !== existingRef) return existingRef;
  null != componentInfo.owner &&
    outlineComponentInfo(request, componentInfo.owner);
  existingRef = 10;
  null != componentInfo.stack &&
    (existingRef += componentInfo.stack.length);
  existingRef = { objectLimit: existingRef };
  var componentDebugInfo = {
    name: componentInfo.name,
    key: componentInfo.key
  };
  null != componentInfo.env && (componentDebugInfo.env = componentInfo.env);
  null != componentInfo.owner &&
    (componentDebugInfo.owner = componentInfo.owner);
  null == componentInfo.stack && null != componentInfo.debugStack
    ? (componentDebugInfo.stack = filterStackTrace(
        request,
        parseStackTrace(componentInfo.debugStack, 1)
      ))
    : null != componentInfo.stack &&
      (componentDebugInfo.stack = componentInfo.stack);
  componentDebugInfo.props = componentInfo.props;
  existingRef = outlineDebugModel(request, existingRef, componentDebugInfo);
  existingRef = serializeByValueID(existingRef);
  request.writtenDebugObjects.set(componentInfo, existingRef);
  request.writtenObjects.set(componentInfo, existingRef);
  return existingRef;
}

// DEVIATION: Outlining enqueues a wire task that the streaming renderer
// serializes later; reduced to immediate serialization of the row text,
// covering the value shapes that reach the wire from the error path: error
// info objects, owner rows, and their stack arrays. Strings escape `$` and
// numbers use the renderer's encodings because both appear inside
// serialized stack frames. The rest of the renderer's value domain (dates,
// bigints, undefined, shared references, outlined text rows, class
// instances) is not modeled and throws. Objects already outlined are
// replaced with their reference, like the debug serializer's
// `writtenDebugObjects` check.
function serializeModelToRow(request, value) {
  if (typeof value === 'string') {
    return value[0] === '$' ? '$' + value : value
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value === 0 && 1 / value === -Infinity ? '$-0' : value
    }
    if (value === Infinity) return '$Infinity'
    if (value === -Infinity) return '$-Infinity'
    return '$NaN'
  }
  if (value instanceof Error) {
    return serializeErrorValue(request, value)
  }
  if (isArrayImpl(value)) {
    var array = []
    for (var i = 0; i < value.length; i++) {
      array.push(serializeModelToRow(request, value[i]))
    }
    return array
  }
  if ('object' === typeof value && null !== value) {
    var written = request.writtenDebugObjects.get(value)
    if (written !== undefined) {
      return written
    }
    var proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
      throw new Error('non-plain object values in models are not modeled')
    }
    var object = {}
    for (var key of Object.keys(value)) {
      object[key] = serializeModelToRow(request, value[key])
    }
    return object
  }
  if (typeof value === 'boolean' || value === null) {
    return value
  }
  throw new Error(`\`${typeof value}\` values in models are not modeled`)
}

function outlineModel(request, value) {
  var id = request.nextChunkId++
  request._outlinedRows[id.toString(16)] = stringify(
    serializeModelToRow(request, value)
  )
  return id
}

function outlineDebugModel(request, counter, model) {
  var id = request.nextChunkId++
  request._outlinedRows[id.toString(16)] = stringify(
    serializeModelToRow(request, model)
  )
  return id
}

// ---------------------------------------------------------------------------
// Consumer: fake stack frame creation
// ---------------------------------------------------------------------------

var fakeFunctionCache = new Map()
var fakeFunctionIdx = 0

function createFakeFunction(
  name,
  filename,
  sourceMap,
  line,
  col,
  enclosingLine,
  enclosingCol,
  environmentName
) {
  name || (name = '<anonymous>')
  var encodedName = JSON.stringify(name)
  1 > enclosingLine ? (enclosingLine = 0) : enclosingLine--
  1 > enclosingCol ? (enclosingCol = 0) : enclosingCol--
  1 > line ? (line = 0) : line--
  1 > col ? (col = 0) : col--
  if (line < enclosingLine || (line === enclosingLine && col < enclosingCol))
    enclosingCol = enclosingLine = 0
  1 > line
    ? ((line = encodedName.length + 3),
      (enclosingCol -= line),
      0 > enclosingCol && (enclosingCol = 0),
      (col = col - enclosingCol - line - 3),
      0 > col && (col = 0),
      (encodedName =
        '({' +
        encodedName +
        ':' +
        ' '.repeat(enclosingCol) +
        '_=>' +
        ' '.repeat(col) +
        '_()})'))
    : 1 > enclosingLine
      ? ((enclosingCol -= encodedName.length + 3),
        0 > enclosingCol && (enclosingCol = 0),
        (encodedName =
          '({' +
          encodedName +
          ':' +
          ' '.repeat(enclosingCol) +
          '_=>' +
          '\n'.repeat(line - enclosingLine) +
          ' '.repeat(col) +
          '_()})'))
      : enclosingLine === line
        ? ((col = col - enclosingCol - 3),
          0 > col && (col = 0),
          (encodedName =
            '\n'.repeat(enclosingLine - 1) +
            '({' +
            encodedName +
            ':\n' +
            ' '.repeat(enclosingCol) +
            '_=>' +
            ' '.repeat(col) +
            '_()})'))
        : (encodedName =
            '\n'.repeat(enclosingLine - 1) +
            '({' +
            encodedName +
            ':\n' +
            ' '.repeat(enclosingCol) +
            '_=>' +
            '\n'.repeat(line - enclosingLine) +
            ' '.repeat(col) +
            '_()})')
  encodedName =
    1 > enclosingLine
      ? encodedName +
        '\n/* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */'
      : '/* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */' +
        encodedName
  filename.startsWith('/') && (filename = 'file://' + filename)
  sourceMap
    ? ((encodedName +=
        '\n//# sourceURL=about://React/' +
        encodeURIComponent(environmentName) +
        '/' +
        encodeURI(filename) +
        '?' +
        fakeFunctionIdx++),
      (encodedName += '\n//# sourceMappingURL=' + sourceMap))
    : (encodedName = filename
        ? encodedName + ('\n//# sourceURL=' + encodeURI(filename))
        : encodedName + '\n//# sourceURL=<anonymous>')
  try {
    var fn = (0, eval)(encodedName)[name]
  } catch (x) {
    ;(fn = function (_) {
      return _()
    }),
      Object.defineProperty(fn, 'name', { value: name })
  }
  return fn
}

function buildFakeCallStack(
  response,
  stack,
  environmentName,
  useEnclosingLine,
  innerCall
) {
  for (var i = 0; i < stack.length; i++) {
    var frame = stack[i],
      frameKey =
        frame.join('-') +
        '-' +
        environmentName +
        (useEnclosingLine ? '-e' : '-n'),
      fn = fakeFunctionCache.get(frameKey)
    if (void 0 === fn) {
      fn = frame[0]
      var filename = frame[1],
        line = frame[2],
        col = frame[3],
        enclosingLine = frame[4]
      frame = frame[5]
      var findSourceMapURL = response._debugFindSourceMapURL
      findSourceMapURL = findSourceMapURL
        ? findSourceMapURL(filename, environmentName)
        : null
      fn = createFakeFunction(
        fn,
        filename,
        findSourceMapURL,
        line,
        col,
        useEnclosingLine ? line : enclosingLine,
        useEnclosingLine ? col : frame,
        environmentName
      )
      fakeFunctionCache.set(frameKey, fn)
    }
    innerCall = fn.bind(null, innerCall)
  }
  return innerCall
}

function getRootTask(response, childEnvironmentName) {
  var rootTask = response._debugRootTask
  return rootTask
    ? response._rootEnvironmentName !== childEnvironmentName
      ? ((response = console.createTask.bind(
          console,
          '"use ' + childEnvironmentName.toLowerCase() + '"'
        )),
        rootTask.run(response))
      : rootTask
    : null
}

var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
  ASYNC_ITERATOR = Symbol.asyncIterator,
  isArrayImpl = Array.isArray,
  mightHaveStaticConstructor = /\bclass\b.*\bstatic\b/,
  supportsCreateTask = !!console.createTask,
  initializingHandler = null,
  initializingChunk = null,
  isInitializingDebugInfo = !1

function nullRefGetter() {
  return null
}

// DEVIATION: These are reachable only through wire features the scenarios
// never serialize (chunk streaming, lazy and server references, typed
// collections, function values, the debug channel, elements). They throw if
// a scenario starts exercising one without modeling it.
function createLazyChunkWrapper() {
  throw new Error('lazy references are not modeled')
}
function defineLazyGetter() {
  throw new Error('the debug channel is not modeled')
}
function getInferredFunctionApproximate() {
  throw new Error('function values are not modeled')
}
function loadServerReference() {
  throw new Error('server references are not modeled')
}
function createMap() {
  throw new Error('Map values are not modeled')
}
function createSet() {
  throw new Error('Set values are not modeled')
}
function createBlob() {
  throw new Error('Blob values are not modeled')
}
function createFormData() {
  throw new Error('FormData values are not modeled')
}
function extractIterator() {
  throw new Error('iterator values are not modeled')
}
function applyConstructor() {
  throw new Error('class instance values are not modeled')
}
function initializeElement() {
  throw new Error('elements are not modeled')
}
function getComponentNameFromType() {
  throw new Error('elements are not modeled')
}
function initializeModuleChunk() {
  throw new Error('module references are not modeled')
}
function waitForReference() {
  throw new Error('pending wire chunks are not modeled')
}
function fulfillReference() {
  throw new Error('pending wire chunks are not modeled')
}
function triggerErrorOnChunk() {
  throw new Error('pending wire chunks are not modeled')
}
function initializeDebugInfo() {
  throw new Error('debug info rows are not modeled')
}

function ReactPromise(status, value, reason) {
  this.status = status;
  this.value = value;
  this.reason = reason;
  this._children = [];
  this._debugChunk = null;
  this._debugInfo = [];
}

function createPendingChunk(response) {
  0 === response._pendingChunks++ &&
    ((response._weakResponse.response = response),
    null !== response._pendingInitialRender &&
      (clearTimeout(response._pendingInitialRender),
      (response._pendingInitialRender = null)));
  return new ReactPromise("pending", null, null);
}

function createResolvedModelChunk(response, value) {
  return new ReactPromise("resolved_model", value, response);
}

function getChunk(response, id) {
  var chunks = response._chunks,
    chunk = chunks.get(id);
  chunk ||
    (response._closed
      ? response._allowPartialStream
        ? ((response = chunk = createPendingChunk(response)),
          (response.status = "halted"),
          (response.value = null),
          (response.reason = null))
        : (chunk = new ReactPromise(
            "rejected",
            null,
            response._closedReason
          ))
      : (chunk = createPendingChunk(response)),
    chunks.set(id, chunk));
  return chunk;
}

function parseModel(response, json) {
  json = JSON.parse(json);
  return reviveModel(response, json, { "": json }, "");
}

function initializeDebugChunk(response, chunk) {
  var debugChunk = chunk._debugChunk;
  if (null !== debugChunk) {
    var debugInfo = chunk._debugInfo,
      prevIsInitializingDebugInfo = isInitializingDebugInfo;
    isInitializingDebugInfo = !0;
    try {
      if ("resolved_model" === debugChunk.status) {
        for (
          var idx = debugInfo.length, c = debugChunk._debugChunk;
          null !== c;

        )
          "fulfilled" !== c.status && idx++, (c = c._debugChunk);
        initializeModelChunk(debugChunk);
        switch (debugChunk.status) {
          case "fulfilled":
            debugInfo[idx] = initializeDebugInfo(
              response,
              debugChunk.value
            );
            break;
          case "blocked":
          case "pending":
            waitForReference(
              debugChunk,
              debugInfo,
              "" + idx,
              response,
              initializeDebugInfo,
              [""],
              !0
            );
            break;
          default:
            throw debugChunk.reason;
        }
      } else
        switch (debugChunk.status) {
          case "fulfilled":
            break;
          case "blocked":
          case "pending":
            waitForReference(
              debugChunk,
              {},
              "debug",
              response,
              initializeDebugInfo,
              [""],
              !0
            );
            break;
          default:
            throw debugChunk.reason;
        }
    } catch (error) {
      triggerErrorOnChunk(response, chunk, error);
    } finally {
      isInitializingDebugInfo = prevIsInitializingDebugInfo;
    }
  }
}

function initializeModelChunk(chunk) {
  var prevHandler = initializingHandler,
    prevChunk = initializingChunk;
  initializingHandler = null;
  var resolvedModel = chunk.value,
    response = chunk.reason;
  chunk.status = "blocked";
  chunk.value = null;
  chunk.reason = null;
  initializingChunk = chunk;
  initializeDebugChunk(response, chunk);
  try {
    var value = parseModel(response, resolvedModel),
      resolveListeners = chunk.value;
    if (null !== resolveListeners)
      for (
        chunk.value = null, chunk.reason = null, resolvedModel = 0;
        resolvedModel < resolveListeners.length;
        resolvedModel++
      ) {
        var listener = resolveListeners[resolvedModel];
        "function" === typeof listener
          ? listener(value)
          : fulfillReference(response, listener, value, chunk);
      }
    if (null !== initializingHandler) {
      if (initializingHandler.errored) throw initializingHandler.reason;
      if (0 < initializingHandler.deps) {
        initializingHandler.value = value;
        initializingHandler.chunk = chunk;
        return;
      }
    }
    chunk.status = "fulfilled";
    chunk.value = value;
    chunk.reason = null;
    filterDebugInfo(response, chunk);
    moveDebugInfoFromChunkToInnerValue(chunk, value);
  } catch (error) {
    (chunk.status = "rejected"), (chunk.reason = error);
  } finally {
    (initializingHandler = prevHandler), (initializingChunk = prevChunk);
  }
}

function resolveLazy(value) {
  for (
    ;
    "object" === typeof value &&
    null !== value &&
    value.$$typeof === REACT_LAZY_TYPE;

  ) {
    var payload = value._payload;
    if ("fulfilled" === payload.status) value = payload.value;
    else break;
  }
  return value;
}

function filterDebugInfo(response, value) {
  if (null !== response._debugEndTime) {
    response = response._debugEndTime - performance.timeOrigin;
    for (var debugInfo = [], i = 0; i < value._debugInfo.length; i++) {
      var info = value._debugInfo[i];
      if ("number" === typeof info.time && info.time > response) break;
      debugInfo.push(info);
    }
    value._debugInfo = debugInfo;
  }
}

function moveDebugInfoFromChunkToInnerValue(chunk, value) {
  value = resolveLazy(value);
  "object" !== typeof value ||
    null === value ||
    (!isArrayImpl(value) &&
      "function" !== typeof value[ASYNC_ITERATOR] &&
      value.$$typeof !== REACT_ELEMENT_TYPE &&
      value.$$typeof !== REACT_LAZY_TYPE) ||
    ((chunk = chunk._debugInfo.splice(0)),
    isArrayImpl(value._debugInfo)
      ? value._debugInfo.unshift.apply(value._debugInfo, chunk)
      : Object.isFrozen(value) ||
        Object.defineProperty(value, "_debugInfo", {
          configurable: !1,
          enumerable: !1,
          writable: !0,
          value: chunk
        }));
}

function transferReferencedDebugInfo(parentChunk, referencedChunk) {
  if (null !== parentChunk) {
    referencedChunk = referencedChunk._debugInfo;
    parentChunk = parentChunk._debugInfo;
    for (var i = 0; i < referencedChunk.length; ++i) {
      var debugInfoEntry = referencedChunk[i];
      null == debugInfoEntry.name && parentChunk.push(debugInfoEntry);
    }
  }
}

function getOutlinedModel(response, reference, parentObject, key, map) {
  var path = reference.split(":");
  reference = parseInt(path[0], 16);
  reference = getChunk(response, reference);
  null !== initializingChunk &&
    isArrayImpl(initializingChunk._children) &&
    initializingChunk._children.push(reference);
  switch (reference.status) {
    case "resolved_model":
      initializeModelChunk(reference);
      break;
    case "resolved_module":
      initializeModuleChunk(reference);
  }
  switch (reference.status) {
    case "fulfilled":
      for (var value = reference.value, i = 1; i < path.length; i++) {
        for (
          ;
          "object" === typeof value &&
          null !== value &&
          value.$$typeof === REACT_LAZY_TYPE;

        ) {
          value = value._payload;
          switch (value.status) {
            case "resolved_model":
              initializeModelChunk(value);
              break;
            case "resolved_module":
              initializeModuleChunk(value);
          }
          switch (value.status) {
            case "fulfilled":
              value = value.value;
              break;
            case "blocked":
            case "pending":
              return waitForReference(
                value,
                parentObject,
                key,
                response,
                map,
                path.slice(i - 1),
                isInitializingDebugInfo
              );
            case "halted":
              return (
                initializingHandler
                  ? ((parentObject = initializingHandler),
                    parentObject.deps++)
                  : (initializingHandler = {
                      parent: null,
                      chunk: null,
                      value: null,
                      reason: null,
                      deps: 1,
                      errored: !1
                    }),
                null
              );
            default:
              return (
                initializingHandler
                  ? ((initializingHandler.errored = !0),
                    (initializingHandler.value = null),
                    (initializingHandler.reason = value.reason))
                  : (initializingHandler = {
                      parent: null,
                      chunk: null,
                      value: null,
                      reason: value.reason,
                      deps: 0,
                      errored: !0
                    }),
                null
              );
          }
        }
        value = value[path[i]];
      }
      for (
        ;
        "object" === typeof value &&
        null !== value &&
        value.$$typeof === REACT_LAZY_TYPE;

      ) {
        path = value._payload;
        switch (path.status) {
          case "resolved_model":
            initializeModelChunk(path);
            break;
          case "resolved_module":
            initializeModuleChunk(path);
        }
        switch (path.status) {
          case "fulfilled":
            value = path.value;
            continue;
        }
        break;
      }
      response = map(response, value, parentObject, key);
      if (
        parentObject[0] !== REACT_ELEMENT_TYPE ||
        ("4" !== key && "5" !== key)
      )
        isInitializingDebugInfo ||
          transferReferencedDebugInfo(initializingChunk, reference);
      return response;
    case "pending":
    case "blocked":
      return waitForReference(
        reference,
        parentObject,
        key,
        response,
        map,
        path,
        isInitializingDebugInfo
      );
    case "halted":
      return (
        initializingHandler
          ? ((parentObject = initializingHandler), parentObject.deps++)
          : (initializingHandler = {
              parent: null,
              chunk: null,
              value: null,
              reason: null,
              deps: 1,
              errored: !1
            }),
        null
      );
    default:
      return (
        initializingHandler
          ? ((initializingHandler.errored = !0),
            (initializingHandler.value = null),
            (initializingHandler.reason = reference.reason))
          : (initializingHandler = {
              parent: null,
              chunk: null,
              value: null,
              reason: reference.reason,
              deps: 0,
              errored: !0
            }),
        null
      );
  }
}

function createModel(response, model) {
  return model;
}

function parseModelString(response, parentObject, key, value) {
  if ("$" === value[0]) {
    if ("$" === value)
      return (
        null !== initializingHandler &&
          "0" === key &&
          (initializingHandler = {
            parent: initializingHandler,
            chunk: null,
            value: null,
            reason: null,
            deps: 0,
            errored: !1
          }),
        REACT_ELEMENT_TYPE
      );
    switch (value[1]) {
      case "$":
        return value.slice(1);
      case "L":
        return (
          (parentObject = parseInt(value.slice(2), 16)),
          (response = getChunk(response, parentObject)),
          null !== initializingChunk &&
            isArrayImpl(initializingChunk._children) &&
            initializingChunk._children.push(response),
          createLazyChunkWrapper(response, 0)
        );
      case "@":
        return (
          (parentObject = parseInt(value.slice(2), 16)),
          (response = getChunk(response, parentObject)),
          null !== initializingChunk &&
            isArrayImpl(initializingChunk._children) &&
            initializingChunk._children.push(response),
          response
        );
      case "S":
        return Symbol.for(value.slice(2));
      case "h":
        var ref = value.slice(2);
        return getOutlinedModel(
          response,
          ref,
          parentObject,
          key,
          loadServerReference
        );
      case "T":
        parentObject = "$" + value.slice(2);
        response = response._tempRefs;
        if (null == response)
          throw Error(
            "Missing a temporary reference set but the RSC response returned a temporary reference. Pass a temporaryReference option with the set that was used with the reply."
          );
        return response.get(parentObject);
      case "Q":
        return (
          (ref = value.slice(2)),
          getOutlinedModel(response, ref, parentObject, key, createMap)
        );
      case "W":
        return (
          (ref = value.slice(2)),
          getOutlinedModel(response, ref, parentObject, key, createSet)
        );
      case "B":
        return (
          (ref = value.slice(2)),
          getOutlinedModel(response, ref, parentObject, key, createBlob)
        );
      case "K":
        return (
          (ref = value.slice(2)),
          getOutlinedModel(response, ref, parentObject, key, createFormData)
        );
      case "Z":
        return (
          (ref = value.slice(2)),
          getOutlinedModel(
            response,
            ref,
            parentObject,
            key,
            resolveErrorDev
          )
        );
      case "i":
        return (
          (ref = value.slice(2)),
          getOutlinedModel(
            response,
            ref,
            parentObject,
            key,
            extractIterator
          )
        );
      case "I":
        return Infinity;
      case "-":
        return "$-0" === value ? -0 : -Infinity;
      case "N":
        return NaN;
      case "u":
        return;
      case "D":
        return new Date(Date.parse(value.slice(2)));
      case "n":
        return BigInt(value.slice(2));
      case "P":
        return (
          (ref = value.slice(2)),
          getOutlinedModel(
            response,
            ref,
            parentObject,
            key,
            applyConstructor
          )
        );
      case "E":
        response = value.slice(2);
        try {
          if (!mightHaveStaticConstructor.test(response))
            return (0, eval)(response);
        } catch (x) {}
        try {
          if (
            ((ref = getInferredFunctionApproximate(response)),
            response.startsWith("Object.defineProperty("))
          ) {
            var idx = response.lastIndexOf(',"name",{value:"');
            if (-1 !== idx) {
              var name = JSON.parse(
                response.slice(idx + 16 - 1, response.length - 2)
              );
              Object.defineProperty(ref, "name", { value: name });
            }
          }
        } catch (_) {
          ref = function () {};
        }
        return ref;
      case "Y":
        if (
          2 < value.length &&
          (ref = response._debugChannel && response._debugChannel.callback)
        ) {
          if ("@" === value[2])
            return (
              (parentObject = value.slice(3)),
              (key = parseInt(parentObject, 16)),
              response._chunks.has(key) || ref("P:" + parentObject),
              getChunk(response, key)
            );
          value = value.slice(2);
          idx = parseInt(value, 16);
          response._chunks.has(idx) || ref("Q:" + value);
          ref = getChunk(response, idx);
          return "fulfilled" === ref.status
            ? ref.value
            : defineLazyGetter(response, ref, parentObject, key);
        }
        "__proto__" !== key &&
          Object.defineProperty(parentObject, key, {
            get: function () {
              return "This object has been omitted by React in the console log to avoid sending too much data from the server. Try logging smaller or more specific objects.";
            },
            set: function () {},
            enumerable: !0,
            configurable: !1
          });
        return null;
      default:
        return (
          (ref = value.slice(1)),
          getOutlinedModel(response, ref, parentObject, key, createModel)
        );
    }
  }
  return value;
}

function reviveModel(response, value, parentObject, key) {
  if ("string" === typeof value)
    return "$" === value[0]
      ? parseModelString(response, parentObject, key, value)
      : value;
  if ("object" !== typeof value || null === value) return value;
  if (isArrayImpl(value)) {
    for (var i = 0; i < value.length; i++)
      value[i] = reviveModel(response, value[i], value, "" + i);
    if (value[0] === REACT_ELEMENT_TYPE) {
      if (value[0] === REACT_ELEMENT_TYPE)
        b: {
          key = value[4];
          parentObject = value[5];
          i = value[6];
          value = {
            $$typeof: REACT_ELEMENT_TYPE,
            type: value[1],
            key: value[2],
            props: value[3],
            _owner: void 0 === key ? null : key
          };
          Object.defineProperty(value, "ref", {
            enumerable: !1,
            get: nullRefGetter
          });
          value._store = {};
          Object.defineProperty(value._store, "validated", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: i
          });
          Object.defineProperty(value, "_debugInfo", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: null
          });
          Object.defineProperty(value, "_debugStack", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: void 0 === parentObject ? null : parentObject
          });
          Object.defineProperty(value, "_debugTask", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: null
          });
          if (null !== initializingHandler) {
            key = initializingHandler;
            initializingHandler = key.parent;
            if (key.errored) {
              parentObject = new ReactPromise("rejected", null, key.reason);
              initializeElement(response, value, null);
              response = {
                name: getComponentNameFromType(value.type) || "",
                owner: value._owner
              };
              response.debugStack = value._debugStack;
              supportsCreateTask && (response.debugTask = value._debugTask);
              parentObject._debugInfo = [response];
              response = createLazyChunkWrapper(parentObject, i);
              break b;
            }
            if (0 < key.deps) {
              parentObject = new ReactPromise("blocked", null, null);
              key.value = value;
              key.chunk = parentObject;
              i = createLazyChunkWrapper(parentObject, i);
              response = initializeElement.bind(null, response, value, i);
              parentObject.then(response, response);
              response = i;
              break b;
            }
          }
          initializeElement(response, value, null);
          response = value;
        }
      else response = value;
      return response;
    }
    return value;
  }
  for (i in value)
    "__proto__" === i
      ? delete value[i]
      : ((parentObject = reviveModel(response, value[i], value, i)),
        void 0 !== parentObject
          ? (value[i] = parentObject)
          : delete value[i]);
  return value;
}

function initializeFakeTask(response, debugInfo) {
  if (!supportsCreateTask || null == debugInfo.stack) return null;
  var cachedEntry = debugInfo.debugTask;
  if (void 0 !== cachedEntry) return cachedEntry;
  var useEnclosingLine = void 0 === debugInfo.key,
    stack = debugInfo.stack,
    env =
      null == debugInfo.env ? response._rootEnvironmentName : debugInfo.env;
  cachedEntry =
    null == debugInfo.owner || null == debugInfo.owner.env
      ? response._rootEnvironmentName
      : debugInfo.owner.env;
  var ownerTask =
    null == debugInfo.owner
      ? null
      : initializeFakeTask(response, debugInfo.owner);
  env =
    env !== cachedEntry
      ? '"use ' + env.toLowerCase() + '"'
      : void 0 !== debugInfo.key
        ? "<" + (debugInfo.name || "...") + ">"
        : void 0 !== debugInfo.name
          ? debugInfo.name || "unknown"
          : "await " + (debugInfo.awaited.name || "unknown");
  env = console.createTask.bind(console, env);
  useEnclosingLine = buildFakeCallStack(
    response,
    stack,
    cachedEntry,
    useEnclosingLine,
    env
  );
  null === ownerTask
    ? ((response = getRootTask(response, cachedEntry)),
      (response =
        null != response
          ? response.run(useEnclosingLine)
          : useEnclosingLine()))
    : (response = ownerTask.run(useEnclosingLine));
  return (debugInfo.debugTask = response);
}

function resolveErrorDev(response, errorInfo) {
  var name = errorInfo.name,
    message = errorInfo.message,
    stack = errorInfo.stack,
    env = errorInfo.env,
    errorOptions =
      'cause' in errorInfo
        ? {
            cause: reviveModel(response, errorInfo.cause, errorInfo, 'cause'),
          }
        : void 0,
    isAggregateError =
      'undefined' !== typeof AggregateError && 'errors' in errorInfo,
    revivedErrors = isAggregateError
      ? reviveModel(response, errorInfo.errors, errorInfo, 'errors')
      : null
  message = buildFakeCallStack(
    response,
    stack,
    env,
    !1,
    isAggregateError
      ? AggregateError.bind(
          null,
          revivedErrors,
          message ||
            'An error occurred in the Server Components render but no message was provided',
          errorOptions
        )
      : Error.bind(
          null,
          message ||
            'An error occurred in the Server Components render but no message was provided',
          errorOptions
        )
  )
  stack = null
  null != errorInfo.owner &&
    ((errorInfo = errorInfo.owner.slice(1)),
    (errorInfo = getOutlinedModel(response, errorInfo, {}, '', createModel)),
    null !== errorInfo && (stack = initializeFakeTask(response, errorInfo)))
  null === stack
    ? ((response = getRootTask(response, env)),
      (response = null != response ? response.run(message) : message()))
    : (response = stack.run(message))
  response.name = name
  response.environmentName = env
  return response
}

// DEVIATION: The root of a value payload initializes like a model chunk:
// the initializing state is saved and restored around the parse, like
// `initializeModelChunk` does.
function reviveRootModel(response, reference) {
  var prevHandler = initializingHandler
  var prevChunk = initializingChunk
  initializingHandler = null
  initializingChunk = null
  try {
    return reviveModel(response, reference, { '': reference }, '')
  } finally {
    initializingHandler = prevHandler
    initializingChunk = prevChunk
  }
}

module.exports = {
  parseStackTrace,
  filterStackTrace,
  devirtualizeURL,
  emitErrorChunk,
  outlineModel,
  buildFakeCallStack,
  createFakeFunction,
  createResolvedModelChunk,
  reviveRootModel,
  resolveErrorDev,
}
