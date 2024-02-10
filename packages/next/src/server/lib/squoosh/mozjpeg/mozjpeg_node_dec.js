/* eslint-disable */
var Module = (function () {
  return function (Module) {
    Module = Module || {}

    var Module = typeof Module !== 'undefined' ? Module : {}
    var readyPromiseResolve, readyPromiseReject
    Module['ready'] = new Promise(function (resolve, reject) {
      readyPromiseResolve = resolve
      readyPromiseReject = reject
    })
    var moduleOverrides = {}
    var key
    for (key in Module) {
      if (Module.hasOwnProperty(key)) {
        moduleOverrides[key] = Module[key]
      }
    }
    var arguments_ = []
    var thisProgram = './this.program'
    var quit_ = function (status, toThrow) {
      throw toThrow
    }
    var ENVIRONMENT_IS_WEB = false
    var ENVIRONMENT_IS_WORKER = false
    var ENVIRONMENT_IS_NODE = true
    var scriptDirectory = ''
    function locateFile(path) {
      if (Module['locateFile']) {
        return Module['locateFile'](path, scriptDirectory)
      }
      return scriptDirectory + path
    }
    var read_, readBinary
    var nodeFS
    var nodePath
    if (ENVIRONMENT_IS_NODE) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = require('path').dirname(scriptDirectory) + '/'
      } else {
        scriptDirectory = __dirname + '/'
      }
      read_ = function shell_read(filename, binary) {
        if (!nodeFS) nodeFS = require('fs')
        if (!nodePath) nodePath = require('path')
        filename = nodePath['normalize'](filename)
        return nodeFS['readFileSync'](filename, binary ? null : 'utf8')
      }
      readBinary = function readBinary(filename) {
        var ret = read_(filename, true)
        if (!ret.buffer) {
          ret = new Uint8Array(ret)
        }
        assert(ret.buffer)
        return ret
      }
      if (process['argv'].length > 1) {
        thisProgram = process['argv'][1].replace(/\\/g, '/')
      }
      arguments_ = process['argv'].slice(2)
      quit_ = function (status) {
        process['exit'](status)
      }
      Module['inspect'] = function () {
        return '[Emscripten Module object]'
      }
    } else {
    }
    var out = Module['print'] || console.log.bind(console)
    var err = Module['printErr'] || console.warn.bind(console)
    for (key in moduleOverrides) {
      if (moduleOverrides.hasOwnProperty(key)) {
        Module[key] = moduleOverrides[key]
      }
    }
    moduleOverrides = null
    if (Module['arguments']) arguments_ = Module['arguments']
    if (Module['thisProgram']) thisProgram = Module['thisProgram']
    if (Module['quit']) quit_ = Module['quit']
    var tempRet0 = 0
    var setTempRet0 = function (value) {
      tempRet0 = value
    }
    var wasmBinary
    if (Module['wasmBinary']) wasmBinary = Module['wasmBinary']
    var noExitRuntime = Module['noExitRuntime'] || true
    if (typeof WebAssembly !== 'object') {
      abort('no native wasm support detected')
    }
    var wasmMemory
    var ABORT = false
    var EXITSTATUS
    function assert(condition, text) {
      if (!condition) {
        abort('Assertion failed: ' + text)
      }
    }
    var UTF8Decoder = new TextDecoder('utf8')
    function UTF8ArrayToString(heap, idx, maxBytesToRead) {
      var endIdx = idx + maxBytesToRead
      var endPtr = idx
      while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr
      return UTF8Decoder.decode(
        heap.subarray
          ? heap.subarray(idx, endPtr)
          : new Uint8Array(heap.slice(idx, endPtr))
      )
    }
    function UTF8ToString(ptr, maxBytesToRead) {
      if (!ptr) return ''
      var maxPtr = ptr + maxBytesToRead
      for (var end = ptr; !(end >= maxPtr) && HEAPU8[end]; ) ++end
      return UTF8Decoder.decode(HEAPU8.subarray(ptr, end))
    }
    function stringToUTF8Array(str, heap, outIdx, maxBytesToWrite) {
      if (!(maxBytesToWrite > 0)) return 0
      var startIdx = outIdx
      var endIdx = outIdx + maxBytesToWrite - 1
      for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i)
        if (u >= 55296 && u <= 57343) {
          var u1 = str.charCodeAt(++i)
          u = (65536 + ((u & 1023) << 10)) | (u1 & 1023)
        }
        if (u <= 127) {
          if (outIdx >= endIdx) break
          heap[outIdx++] = u
        } else if (u <= 2047) {
          if (outIdx + 1 >= endIdx) break
          heap[outIdx++] = 192 | (u >> 6)
          heap[outIdx++] = 128 | (u & 63)
        } else if (u <= 65535) {
          if (outIdx + 2 >= endIdx) break
          heap[outIdx++] = 224 | (u >> 12)
          heap[outIdx++] = 128 | ((u >> 6) & 63)
          heap[outIdx++] = 128 | (u & 63)
        } else {
          if (outIdx + 3 >= endIdx) break
          heap[outIdx++] = 240 | (u >> 18)
          heap[outIdx++] = 128 | ((u >> 12) & 63)
          heap[outIdx++] = 128 | ((u >> 6) & 63)
          heap[outIdx++] = 128 | (u & 63)
        }
      }
      heap[outIdx] = 0
      return outIdx - startIdx
    }
    function stringToUTF8(str, outPtr, maxBytesToWrite) {
      return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite)
    }
    function lengthBytesUTF8(str) {
      var len = 0
      for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i)
        if (u >= 55296 && u <= 57343)
          u = (65536 + ((u & 1023) << 10)) | (str.charCodeAt(++i) & 1023)
        if (u <= 127) ++len
        else if (u <= 2047) len += 2
        else if (u <= 65535) len += 3
        else len += 4
      }
      return len
    }
    var UTF16Decoder = new TextDecoder('utf-16le')
    function UTF16ToString(ptr, maxBytesToRead) {
      var endPtr = ptr
      var idx = endPtr >> 1
      var maxIdx = idx + maxBytesToRead / 2
      while (!(idx >= maxIdx) && HEAPU16[idx]) ++idx
      endPtr = idx << 1
      return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr))
      var str = ''
      for (var i = 0; !(i >= maxBytesToRead / 2); ++i) {
        var codeUnit = HEAP16[(ptr + i * 2) >> 1]
        if (codeUnit == 0) break
        str += String.fromCharCode(codeUnit)
      }
      return str
    }
    function stringToUTF16(str, outPtr, maxBytesToWrite) {
      if (maxBytesToWrite === undefined) {
        maxBytesToWrite = 2147483647
      }
      if (maxBytesToWrite < 2) return 0
      maxBytesToWrite -= 2
      var startPtr = outPtr
      var numCharsToWrite =
        maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length
      for (var i = 0; i < numCharsToWrite; ++i) {
        var codeUnit = str.charCodeAt(i)
        HEAP16[outPtr >> 1] = codeUnit
        outPtr += 2
      }
      HEAP16[outPtr >> 1] = 0
      return outPtr - startPtr
    }
    function lengthBytesUTF16(str) {
      return str.length * 2
    }
    function UTF32ToString(ptr, maxBytesToRead) {
      var i = 0
      var str = ''
      while (!(i >= maxBytesToRead / 4)) {
        var utf32 = HEAP32[(ptr + i * 4) >> 2]
        if (utf32 == 0) break
        ++i
        if (utf32 >= 65536) {
          var ch = utf32 - 65536
          str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023))
        } else {
          str += String.fromCharCode(utf32)
        }
      }
      return str
    }
    function stringToUTF32(str, outPtr, maxBytesToWrite) {
      if (maxBytesToWrite === undefined) {
        maxBytesToWrite = 2147483647
      }
      if (maxBytesToWrite < 4) return 0
      var startPtr = outPtr
      var endPtr = startPtr + maxBytesToWrite - 4
      for (var i = 0; i < str.length; ++i) {
        var codeUnit = str.charCodeAt(i)
        if (codeUnit >= 55296 && codeUnit <= 57343) {
          var trailSurrogate = str.charCodeAt(++i)
          codeUnit =
            (65536 + ((codeUnit & 1023) << 10)) | (trailSurrogate & 1023)
        }
        HEAP32[outPtr >> 2] = codeUnit
        outPtr += 4
        if (outPtr + 4 > endPtr) break
      }
      HEAP32[outPtr >> 2] = 0
      return outPtr - startPtr
    }
    function lengthBytesUTF32(str) {
      var len = 0
      for (var i = 0; i < str.length; ++i) {
        var codeUnit = str.charCodeAt(i)
        if (codeUnit >= 55296 && codeUnit <= 57343) ++i
        len += 4
      }
      return len
    }
    function writeAsciiToMemory(str, buffer, dontAddNull) {
      for (var i = 0; i < str.length; ++i) {
        HEAP8[buffer++ >> 0] = str.charCodeAt(i)
      }
      if (!dontAddNull) HEAP8[buffer >> 0] = 0
    }
    function alignUp(x, multiple) {
      if (x % multiple > 0) {
        x += multiple - (x % multiple)
      }
      return x
    }
    var buffer,
      HEAP8,
      HEAPU8,
      HEAP16,
      HEAPU16,
      HEAP32,
      HEAPU32,
      HEAPF32,
      HEAPF64
    function updateGlobalBufferAndViews(buf) {
      buffer = buf
      Module['HEAP8'] = HEAP8 = new Int8Array(buf)
      Module['HEAP16'] = HEAP16 = new Int16Array(buf)
      Module['HEAP32'] = HEAP32 = new Int32Array(buf)
      Module['HEAPU8'] = HEAPU8 = new Uint8Array(buf)
      Module['HEAPU16'] = HEAPU16 = new Uint16Array(buf)
      Module['HEAPU32'] = HEAPU32 = new Uint32Array(buf)
      Module['HEAPF32'] = HEAPF32 = new Float32Array(buf)
      Module['HEAPF64'] = HEAPF64 = new Float64Array(buf)
    }
    var INITIAL_MEMORY = Module['INITIAL_MEMORY'] || 16777216
    var wasmTable
    var __ATPRERUN__ = []
    var __ATINIT__ = []
    var __ATPOSTRUN__ = []
    var runtimeInitialized = false
    var runtimeExited = false
    function preRun() {
      if (Module['preRun']) {
        if (typeof Module['preRun'] == 'function')
          Module['preRun'] = [Module['preRun']]
        while (Module['preRun'].length) {
          addOnPreRun(Module['preRun'].shift())
        }
      }
      callRuntimeCallbacks(__ATPRERUN__)
    }
    function initRuntime() {
      runtimeInitialized = true
      callRuntimeCallbacks(__ATINIT__)
    }
    function exitRuntime() {
      runtimeExited = true
    }
    function postRun() {
      if (Module['postRun']) {
        if (typeof Module['postRun'] == 'function')
          Module['postRun'] = [Module['postRun']]
        while (Module['postRun'].length) {
          addOnPostRun(Module['postRun'].shift())
        }
      }
      callRuntimeCallbacks(__ATPOSTRUN__)
    }
    function addOnPreRun(cb) {
      __ATPRERUN__.unshift(cb)
    }
    function addOnInit(cb) {
      __ATINIT__.unshift(cb)
    }
    function addOnPostRun(cb) {
      __ATPOSTRUN__.unshift(cb)
    }
    var runDependencies = 0
    var runDependencyWatcher = null
    var dependenciesFulfilled = null
    function addRunDependency(id) {
      runDependencies++
      if (Module['monitorRunDependencies']) {
        Module['monitorRunDependencies'](runDependencies)
      }
    }
    function removeRunDependency(id) {
      runDependencies--
      if (Module['monitorRunDependencies']) {
        Module['monitorRunDependencies'](runDependencies)
      }
      if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher)
          runDependencyWatcher = null
        }
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled
          dependenciesFulfilled = null
          callback()
        }
      }
    }
    Module['preloadedImages'] = {}
    Module['preloadedAudios'] = {}
    function abort(what) {
      if (Module['onAbort']) {
        Module['onAbort'](what)
      }
      what += ''
      err(what)
      ABORT = true
      EXITSTATUS = 1
      what = 'abort(' + what + '). Build with -s ASSERTIONS=1 for more info.'
      var e = new WebAssembly.RuntimeError(what)
      readyPromiseReject(e)
      throw e
    }
    var dataURIPrefix = 'data:application/octet-stream;base64,'
    function isDataURI(filename) {
      return filename.startsWith(dataURIPrefix)
    }
    if (Module['locateFile']) {
      var wasmBinaryFile = 'mozjpeg_node_dec.wasm'
      if (!isDataURI(wasmBinaryFile)) {
        wasmBinaryFile = locateFile(wasmBinaryFile)
      }
    } else {
      throw new Error('invariant')
    }
    function getBinary(file) {
      try {
        if (file == wasmBinaryFile && wasmBinary) {
          return new Uint8Array(wasmBinary)
        }
        if (readBinary) {
          return readBinary(file)
        } else {
          throw 'both async and sync fetching of the wasm failed'
        }
      } catch (err) {
        abort(err)
      }
    }
    function getBinaryPromise() {
      return Promise.resolve().then(function () {
        return getBinary(wasmBinaryFile)
      })
    }
    function createWasm() {
      var info = { a: asmLibraryArg }
      function receiveInstance(instance, module) {
        var exports = instance.exports
        Module['asm'] = exports
        wasmMemory = Module['asm']['z']
        updateGlobalBufferAndViews(wasmMemory.buffer)
        wasmTable = Module['asm']['F']
        addOnInit(Module['asm']['A'])
        removeRunDependency('wasm-instantiate')
      }
      addRunDependency('wasm-instantiate')
      function receiveInstantiationResult(result) {
        receiveInstance(result['instance'])
      }
      function instantiateArrayBuffer(receiver) {
        return getBinaryPromise()
          .then(function (binary) {
            var result = WebAssembly.instantiate(binary, info)
            return result
          })
          .then(receiver, function (reason) {
            err('failed to asynchronously prepare wasm: ' + reason)
            abort(reason)
          })
      }
      function instantiateAsync() {
        return instantiateArrayBuffer(receiveInstantiationResult)
      }
      if (Module['instantiateWasm']) {
        try {
          var exports = Module['instantiateWasm'](info, receiveInstance)
          return exports
        } catch (e) {
          err('Module.instantiateWasm callback failed with error: ' + e)
          return false
        }
      }
      instantiateAsync().catch(readyPromiseReject)
      return {}
    }
    function callRuntimeCallbacks(callbacks) {
      while (callbacks.length > 0) {
        var callback = callbacks.shift()
        if (typeof callback == 'function') {
          callback(Module)
          continue
        }
        var func = callback.func
        if (typeof func === 'number') {
          if (callback.arg === undefined) {
            wasmTable.get(func)()
          } else {
            wasmTable.get(func)(callback.arg)
          }
        } else {
          func(callback.arg === undefined ? null : callback.arg)
        }
      }
    }
    var runtimeKeepaliveCounter = 0
    function keepRuntimeAlive() {
      return noExitRuntime || runtimeKeepaliveCounter > 0
    }
    function _atexit(func, arg) {}
    function ___cxa_thread_atexit(a0, a1) {
      return _atexit(a0, a1)
    }
    function __embind_register_bigint(
      primitiveType,
      name,
      size,
      minRange,
      maxRange
    ) {}
    function getShiftFromSize(size) {
      switch (size) {
        case 1:
          return 0
        case 2:
          return 1
        case 4:
          return 2
        case 8:
          return 3
        default:
          throw new TypeError('Unknown type size: ' + size)
      }
    }
    function embind_init_charCodes() {
      var codes = new Array(256)
      for (var i = 0; i < 256; ++i) {
        codes[i] = String.fromCharCode(i)
      }
      embind_charCodes = codes
    }
    var embind_charCodes = undefined
    function readLatin1String(ptr) {
      var ret = ''
      var c = ptr
      while (HEAPU8[c]) {
        ret += embind_charCodes[HEAPU8[c++]]
      }
      return ret
    }
    var awaitingDependencies = {}
    var registeredTypes = {}
    var typeDependencies = {}
    var char_0 = 48
    var char_9 = 57
    function makeLegalFunctionName(name) {
      if (undefined === name) {
        return '_unknown'
      }
      name = name.replace(/[^a-zA-Z0-9_]/g, '$')
      var f = name.charCodeAt(0)
      if (f >= char_0 && f <= char_9) {
        return '_' + name
      } else {
        return name
      }
    }
    function createNamedFunction(name, body) {
      name = makeLegalFunctionName(name)
      return new Function(
        'body',
        'return function ' +
          name +
          '() {\n' +
          '    "use strict";' +
          '    return body.apply(this, arguments);\n' +
          '};\n'
      )(body)
    }
    function extendError(baseErrorType, errorName) {
      var errorClass = createNamedFunction(errorName, function (message) {
        this.name = errorName
        this.message = message
        var stack = new Error(message).stack
        if (stack !== undefined) {
          this.stack =
            this.toString() + '\n' + stack.replace(/^Error(:[^\n]*)?\n/, '')
        }
      })
      errorClass.prototype = Object.create(baseErrorType.prototype)
      errorClass.prototype.constructor = errorClass
      errorClass.prototype.toString = function () {
        if (this.message === undefined) {
          return this.name
        } else {
          return this.name + ': ' + this.message
        }
      }
      return errorClass
    }
    var BindingError = undefined
    function throwBindingError(message) {
      throw new BindingError(message)
    }
    var InternalError = undefined
    function throwInternalError(message) {
      throw new InternalError(message)
    }
    function whenDependentTypesAreResolved(
      myTypes,
      dependentTypes,
      getTypeConverters
    ) {
      myTypes.forEach(function (type) {
        typeDependencies[type] = dependentTypes
      })
      function onComplete(typeConverters) {
        var myTypeConverters = getTypeConverters(typeConverters)
        if (myTypeConverters.length !== myTypes.length) {
          throwInternalError('Mismatched type converter count')
        }
        for (var i = 0; i < myTypes.length; ++i) {
          registerType(myTypes[i], myTypeConverters[i])
        }
      }
      var typeConverters = new Array(dependentTypes.length)
      var unregisteredTypes = []
      var registered = 0
      dependentTypes.forEach(function (dt, i) {
        if (registeredTypes.hasOwnProperty(dt)) {
          typeConverters[i] = registeredTypes[dt]
        } else {
          unregisteredTypes.push(dt)
          if (!awaitingDependencies.hasOwnProperty(dt)) {
            awaitingDependencies[dt] = []
          }
          awaitingDependencies[dt].push(function () {
            typeConverters[i] = registeredTypes[dt]
            ++registered
            if (registered === unregisteredTypes.length) {
              onComplete(typeConverters)
            }
          })
        }
      })
      if (0 === unregisteredTypes.length) {
        onComplete(typeConverters)
      }
    }
    function registerType(rawType, registeredInstance, options) {
      options = options || {}
      if (!('argPackAdvance' in registeredInstance)) {
        throw new TypeError(
          'registerType registeredInstance requires argPackAdvance'
        )
      }
      var name = registeredInstance.name
      if (!rawType) {
        throwBindingError(
          'type "' + name + '" must have a positive integer typeid pointer'
        )
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
        if (options.ignoreDuplicateRegistrations) {
          return
        } else {
          throwBindingError("Cannot register type '" + name + "' twice")
        }
      }
      registeredTypes[rawType] = registeredInstance
      delete typeDependencies[rawType]
      if (awaitingDependencies.hasOwnProperty(rawType)) {
        var callbacks = awaitingDependencies[rawType]
        delete awaitingDependencies[rawType]
        callbacks.forEach(function (cb) {
          cb()
        })
      }
    }
    function __embind_register_bool(
      rawType,
      name,
      size,
      trueValue,
      falseValue
    ) {
      var shift = getShiftFromSize(size)
      name = readLatin1String(name)
      registerType(rawType, {
        name: name,
        fromWireType: function (wt) {
          return !!wt
        },
        toWireType: function (destructors, o) {
          return o ? trueValue : falseValue
        },
        argPackAdvance: 8,
        readValueFromPointer: function (pointer) {
          var heap
          if (size === 1) {
            heap = HEAP8
          } else if (size === 2) {
            heap = HEAP16
          } else if (size === 4) {
            heap = HEAP32
          } else {
            throw new TypeError('Unknown boolean type size: ' + name)
          }
          return this['fromWireType'](heap[pointer >> shift])
        },
        destructorFunction: null,
      })
    }
    var emval_free_list = []
    var emval_handle_array = [
      {},
      { value: undefined },
      { value: null },
      { value: true },
      { value: false },
    ]
    function __emval_decref(handle) {
      if (handle > 4 && 0 === --emval_handle_array[handle].refcount) {
        emval_handle_array[handle] = undefined
        emval_free_list.push(handle)
      }
    }
    function count_emval_handles() {
      var count = 0
      for (var i = 5; i < emval_handle_array.length; ++i) {
        if (emval_handle_array[i] !== undefined) {
          ++count
        }
      }
      return count
    }
    function get_first_emval() {
      for (var i = 5; i < emval_handle_array.length; ++i) {
        if (emval_handle_array[i] !== undefined) {
          return emval_handle_array[i]
        }
      }
      return null
    }
    function init_emval() {
      Module['count_emval_handles'] = count_emval_handles
      Module['get_first_emval'] = get_first_emval
    }
    function __emval_register(value) {
      switch (value) {
        case undefined: {
          return 1
        }
        case null: {
          return 2
        }
        case true: {
          return 3
        }
        case false: {
          return 4
        }
        default: {
          var handle = emval_free_list.length
            ? emval_free_list.pop()
            : emval_handle_array.length
          emval_handle_array[handle] = { refcount: 1, value: value }
          return handle
        }
      }
    }
    function simpleReadValueFromPointer(pointer) {
      return this['fromWireType'](HEAPU32[pointer >> 2])
    }
    function __embind_register_emval(rawType, name) {
      name = readLatin1String(name)
      registerType(rawType, {
        name: name,
        fromWireType: function (handle) {
          var rv = emval_handle_array[handle].value
          __emval_decref(handle)
          return rv
        },
        toWireType: function (destructors, value) {
          return __emval_register(value)
        },
        argPackAdvance: 8,
        readValueFromPointer: simpleReadValueFromPointer,
        destructorFunction: null,
      })
    }
    function _embind_repr(v) {
      if (v === null) {
        return 'null'
      }
      var t = typeof v
      if (t === 'object' || t === 'array' || t === 'function') {
        return v.toString()
      } else {
        return '' + v
      }
    }
    function floatReadValueFromPointer(name, shift) {
      switch (shift) {
        case 2:
          return function (pointer) {
            return this['fromWireType'](HEAPF32[pointer >> 2])
          }
        case 3:
          return function (pointer) {
            return this['fromWireType'](HEAPF64[pointer >> 3])
          }
        default:
          throw new TypeError('Unknown float type: ' + name)
      }
    }
    function __embind_register_float(rawType, name, size) {
      var shift = getShiftFromSize(size)
      name = readLatin1String(name)
      registerType(rawType, {
        name: name,
        fromWireType: function (value) {
          return value
        },
        toWireType: function (destructors, value) {
          if (typeof value !== 'number' && typeof value !== 'boolean') {
            throw new TypeError(
              'Cannot convert "' + _embind_repr(value) + '" to ' + this.name
            )
          }
          return value
        },
        argPackAdvance: 8,
        readValueFromPointer: floatReadValueFromPointer(name, shift),
        destructorFunction: null,
      })
    }
    function new_(constructor, argumentList) {
      if (!(constructor instanceof Function)) {
        throw new TypeError(
          'new_ called with constructor type ' +
            typeof constructor +
            ' which is not a function'
        )
      }
      var dummy = createNamedFunction(
        constructor.name || 'unknownFunctionName',
        function () {}
      )
      dummy.prototype = constructor.prototype
      var obj = new dummy()
      var r = constructor.apply(obj, argumentList)
      return r instanceof Object ? r : obj
    }
    function runDestructors(destructors) {
      while (destructors.length) {
        var ptr = destructors.pop()
        var del = destructors.pop()
        del(ptr)
      }
    }
    function craftInvokerFunction(
      humanName,
      argTypes,
      classType,
      cppInvokerFunc,
      cppTargetFunc
    ) {
      var argCount = argTypes.length
      if (argCount < 2) {
        throwBindingError(
          "argTypes array size mismatch! Must at least get return value and 'this' types!"
        )
      }
      var isClassMethodFunc = argTypes[1] !== null && classType !== null
      var needsDestructorStack = false
      for (var i = 1; i < argTypes.length; ++i) {
        if (
          argTypes[i] !== null &&
          argTypes[i].destructorFunction === undefined
        ) {
          needsDestructorStack = true
          break
        }
      }
      var returns = argTypes[0].name !== 'void'
      var argsList = ''
      var argsListWired = ''
      for (var i = 0; i < argCount - 2; ++i) {
        argsList += (i !== 0 ? ', ' : '') + 'arg' + i
        argsListWired += (i !== 0 ? ', ' : '') + 'arg' + i + 'Wired'
      }
      var invokerFnBody =
        'return function ' +
        makeLegalFunctionName(humanName) +
        '(' +
        argsList +
        ') {\n' +
        'if (arguments.length !== ' +
        (argCount - 2) +
        ') {\n' +
        "throwBindingError('function " +
        humanName +
        " called with ' + arguments.length + ' arguments, expected " +
        (argCount - 2) +
        " args!');\n" +
        '}\n'
      if (needsDestructorStack) {
        invokerFnBody += 'var destructors = [];\n'
      }
      var dtorStack = needsDestructorStack ? 'destructors' : 'null'
      var args1 = [
        'throwBindingError',
        'invoker',
        'fn',
        'runDestructors',
        'retType',
        'classParam',
      ]
      var args2 = [
        throwBindingError,
        cppInvokerFunc,
        cppTargetFunc,
        runDestructors,
        argTypes[0],
        argTypes[1],
      ]
      if (isClassMethodFunc) {
        invokerFnBody +=
          'var thisWired = classParam.toWireType(' + dtorStack + ', this);\n'
      }
      for (var i = 0; i < argCount - 2; ++i) {
        invokerFnBody +=
          'var arg' +
          i +
          'Wired = argType' +
          i +
          '.toWireType(' +
          dtorStack +
          ', arg' +
          i +
          '); // ' +
          argTypes[i + 2].name +
          '\n'
        args1.push('argType' + i)
        args2.push(argTypes[i + 2])
      }
      if (isClassMethodFunc) {
        argsListWired =
          'thisWired' + (argsListWired.length > 0 ? ', ' : '') + argsListWired
      }
      invokerFnBody +=
        (returns ? 'var rv = ' : '') +
        'invoker(fn' +
        (argsListWired.length > 0 ? ', ' : '') +
        argsListWired +
        ');\n'
      if (needsDestructorStack) {
        invokerFnBody += 'runDestructors(destructors);\n'
      } else {
        for (var i = isClassMethodFunc ? 1 : 2; i < argTypes.length; ++i) {
          var paramName = i === 1 ? 'thisWired' : 'arg' + (i - 2) + 'Wired'
          if (argTypes[i].destructorFunction !== null) {
            invokerFnBody +=
              paramName +
              '_dtor(' +
              paramName +
              '); // ' +
              argTypes[i].name +
              '\n'
            args1.push(paramName + '_dtor')
            args2.push(argTypes[i].destructorFunction)
          }
        }
      }
      if (returns) {
        invokerFnBody +=
          'var ret = retType.fromWireType(rv);\n' + 'return ret;\n'
      } else {
      }
      invokerFnBody += '}\n'
      args1.push(invokerFnBody)
      var invokerFunction = new_(Function, args1).apply(null, args2)
      return invokerFunction
    }
    function ensureOverloadTable(proto, methodName, humanName) {
      if (undefined === proto[methodName].overloadTable) {
        var prevFunc = proto[methodName]
        proto[methodName] = function () {
          if (
            !proto[methodName].overloadTable.hasOwnProperty(arguments.length)
          ) {
            throwBindingError(
              "Function '" +
                humanName +
                "' called with an invalid number of arguments (" +
                arguments.length +
                ') - expects one of (' +
                proto[methodName].overloadTable +
                ')!'
            )
          }
          return proto[methodName].overloadTable[arguments.length].apply(
            this,
            arguments
          )
        }
        proto[methodName].overloadTable = []
        proto[methodName].overloadTable[prevFunc.argCount] = prevFunc
      }
    }
    function exposePublicSymbol(name, value, numArguments) {
      if (Module.hasOwnProperty(name)) {
        if (
          undefined === numArguments ||
          (undefined !== Module[name].overloadTable &&
            undefined !== Module[name].overloadTable[numArguments])
        ) {
          throwBindingError("Cannot register public name '" + name + "' twice")
        }
        ensureOverloadTable(Module, name, name)
        if (Module.hasOwnProperty(numArguments)) {
          throwBindingError(
            'Cannot register multiple overloads of a function with the same number of arguments (' +
              numArguments +
              ')!'
          )
        }
        Module[name].overloadTable[numArguments] = value
      } else {
        Module[name] = value
        if (undefined !== numArguments) {
          Module[name].numArguments = numArguments
        }
      }
    }
    function heap32VectorToArray(count, firstElement) {
      var array = []
      for (var i = 0; i < count; i++) {
        array.push(HEAP32[(firstElement >> 2) + i])
      }
      return array
    }
    function replacePublicSymbol(name, value, numArguments) {
      if (!Module.hasOwnProperty(name)) {
        throwInternalError('Replacing nonexistent public symbol')
      }
      if (
        undefined !== Module[name].overloadTable &&
        undefined !== numArguments
      ) {
        Module[name].overloadTable[numArguments] = value
      } else {
        Module[name] = value
        Module[name].argCount = numArguments
      }
    }
    function dynCallLegacy(sig, ptr, args) {
      var f = Module['dynCall_' + sig]
      return args && args.length
        ? f.apply(null, [ptr].concat(args))
        : f.call(null, ptr)
    }
    function dynCall(sig, ptr, args) {
      if (sig.includes('j')) {
        return dynCallLegacy(sig, ptr, args)
      }
      return wasmTable.get(ptr).apply(null, args)
    }
    function getDynCaller(sig, ptr) {
      var argCache = []
      return function () {
        argCache.length = arguments.length
        for (var i = 0; i < arguments.length; i++) {
          argCache[i] = arguments[i]
        }
        return dynCall(sig, ptr, argCache)
      }
    }
    function embind__requireFunction(signature, rawFunction) {
      signature = readLatin1String(signature)
      function makeDynCaller() {
        if (signature.includes('j')) {
          return getDynCaller(signature, rawFunction)
        }
        return wasmTable.get(rawFunction)
      }
      var fp = makeDynCaller()
      if (typeof fp !== 'function') {
        throwBindingError(
          'unknown function pointer with signature ' +
            signature +
            ': ' +
            rawFunction
        )
      }
      return fp
    }
    var UnboundTypeError = undefined
    function getTypeName(type) {
      var ptr = ___getTypeName(type)
      var rv = readLatin1String(ptr)
      _free(ptr)
      return rv
    }
    function throwUnboundTypeError(message, types) {
      var unboundTypes = []
      var seen = {}
      function visit(type) {
        if (seen[type]) {
          return
        }
        if (registeredTypes[type]) {
          return
        }
        if (typeDependencies[type]) {
          typeDependencies[type].forEach(visit)
          return
        }
        unboundTypes.push(type)
        seen[type] = true
      }
      types.forEach(visit)
      throw new UnboundTypeError(
        message + ': ' + unboundTypes.map(getTypeName).join([', '])
      )
    }
    function __embind_register_function(
      name,
      argCount,
      rawArgTypesAddr,
      signature,
      rawInvoker,
      fn
    ) {
      var argTypes = heap32VectorToArray(argCount, rawArgTypesAddr)
      name = readLatin1String(name)
      rawInvoker = embind__requireFunction(signature, rawInvoker)
      exposePublicSymbol(
        name,
        function () {
          throwUnboundTypeError(
            'Cannot call ' + name + ' due to unbound types',
            argTypes
          )
        },
        argCount - 1
      )
      whenDependentTypesAreResolved([], argTypes, function (argTypes) {
        var invokerArgsArray = [argTypes[0], null].concat(argTypes.slice(1))
        replacePublicSymbol(
          name,
          craftInvokerFunction(name, invokerArgsArray, null, rawInvoker, fn),
          argCount - 1
        )
        return []
      })
    }
    function integerReadValueFromPointer(name, shift, signed) {
      switch (shift) {
        case 0:
          return signed
            ? function readS8FromPointer(pointer) {
                return HEAP8[pointer]
              }
            : function readU8FromPointer(pointer) {
                return HEAPU8[pointer]
              }
        case 1:
          return signed
            ? function readS16FromPointer(pointer) {
                return HEAP16[pointer >> 1]
              }
            : function readU16FromPointer(pointer) {
                return HEAPU16[pointer >> 1]
              }
        case 2:
          return signed
            ? function readS32FromPointer(pointer) {
                return HEAP32[pointer >> 2]
              }
            : function readU32FromPointer(pointer) {
                return HEAPU32[pointer >> 2]
              }
        default:
          throw new TypeError('Unknown integer type: ' + name)
      }
    }
    function __embind_register_integer(
      primitiveType,
      name,
      size,
      minRange,
      maxRange
    ) {
      name = readLatin1String(name)
      if (maxRange === -1) {
        maxRange = 4294967295
      }
      var shift = getShiftFromSize(size)
      var fromWireType = function (value) {
        return value
      }
      if (minRange === 0) {
        var bitshift = 32 - 8 * size
        fromWireType = function (value) {
          return (value << bitshift) >>> bitshift
        }
      }
      var isUnsignedType = name.includes('unsigned')
      registerType(primitiveType, {
        name: name,
        fromWireType: fromWireType,
        toWireType: function (destructors, value) {
          if (typeof value !== 'number' && typeof value !== 'boolean') {
            throw new TypeError(
              'Cannot convert "' + _embind_repr(value) + '" to ' + this.name
            )
          }
          if (value < minRange || value > maxRange) {
            throw new TypeError(
              'Passing a number "' +
                _embind_repr(value) +
                '" from JS side to C/C++ side to an argument of type "' +
                name +
                '", which is outside the valid range [' +
                minRange +
                ', ' +
                maxRange +
                ']!'
            )
          }
          return isUnsignedType ? value >>> 0 : value | 0
        },
        argPackAdvance: 8,
        readValueFromPointer: integerReadValueFromPointer(
          name,
          shift,
          minRange !== 0
        ),
        destructorFunction: null,
      })
    }
    function __embind_register_memory_view(rawType, dataTypeIndex, name) {
      var typeMapping = [
        Int8Array,
        Uint8Array,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array,
      ]
      var TA = typeMapping[dataTypeIndex]
      function decodeMemoryView(handle) {
        handle = handle >> 2
        var heap = HEAPU32
        var size = heap[handle]
        var data = heap[handle + 1]
        return new TA(buffer, data, size)
      }
      name = readLatin1String(name)
      registerType(
        rawType,
        {
          name: name,
          fromWireType: decodeMemoryView,
          argPackAdvance: 8,
          readValueFromPointer: decodeMemoryView,
        },
        { ignoreDuplicateRegistrations: true }
      )
    }
    function __embind_register_std_string(rawType, name) {
      name = readLatin1String(name)
      var stdStringIsUTF8 = name === 'std::string'
      registerType(rawType, {
        name: name,
        fromWireType: function (value) {
          var length = HEAPU32[value >> 2]
          var str
          if (stdStringIsUTF8) {
            var decodeStartPtr = value + 4
            for (var i = 0; i <= length; ++i) {
              var currentBytePtr = value + 4 + i
              if (i == length || HEAPU8[currentBytePtr] == 0) {
                var maxRead = currentBytePtr - decodeStartPtr
                var stringSegment = UTF8ToString(decodeStartPtr, maxRead)
                if (str === undefined) {
                  str = stringSegment
                } else {
                  str += String.fromCharCode(0)
                  str += stringSegment
                }
                decodeStartPtr = currentBytePtr + 1
              }
            }
          } else {
            var a = new Array(length)
            for (var i = 0; i < length; ++i) {
              a[i] = String.fromCharCode(HEAPU8[value + 4 + i])
            }
            str = a.join('')
          }
          _free(value)
          return str
        },
        toWireType: function (destructors, value) {
          if (value instanceof ArrayBuffer) {
            value = new Uint8Array(value)
          }
          var getLength
          var valueIsOfTypeString = typeof value === 'string'
          if (
            !(
              valueIsOfTypeString ||
              value instanceof Uint8Array ||
              value instanceof Uint8ClampedArray ||
              value instanceof Int8Array
            )
          ) {
            throwBindingError('Cannot pass non-string to std::string')
          }
          if (stdStringIsUTF8 && valueIsOfTypeString) {
            getLength = function () {
              return lengthBytesUTF8(value)
            }
          } else {
            getLength = function () {
              return value.length
            }
          }
          var length = getLength()
          var ptr = _malloc(4 + length + 1)
          HEAPU32[ptr >> 2] = length
          if (stdStringIsUTF8 && valueIsOfTypeString) {
            stringToUTF8(value, ptr + 4, length + 1)
          } else {
            if (valueIsOfTypeString) {
              for (var i = 0; i < length; ++i) {
                var charCode = value.charCodeAt(i)
                if (charCode > 255) {
                  _free(ptr)
                  throwBindingError(
                    'String has UTF-16 code units that do not fit in 8 bits'
                  )
                }
                HEAPU8[ptr + 4 + i] = charCode
              }
            } else {
              for (var i = 0; i < length; ++i) {
                HEAPU8[ptr + 4 + i] = value[i]
              }
            }
          }
          if (destructors !== null) {
            destructors.push(_free, ptr)
          }
          return ptr
        },
        argPackAdvance: 8,
        readValueFromPointer: simpleReadValueFromPointer,
        destructorFunction: function (ptr) {
          _free(ptr)
        },
      })
    }
    function __embind_register_std_wstring(rawType, charSize, name) {
      name = readLatin1String(name)
      var decodeString, encodeString, getHeap, lengthBytesUTF, shift
      if (charSize === 2) {
        decodeString = UTF16ToString
        encodeString = stringToUTF16
        lengthBytesUTF = lengthBytesUTF16
        getHeap = function () {
          return HEAPU16
        }
        shift = 1
      } else if (charSize === 4) {
        decodeString = UTF32ToString
        encodeString = stringToUTF32
        lengthBytesUTF = lengthBytesUTF32
        getHeap = function () {
          return HEAPU32
        }
        shift = 2
      }
      registerType(rawType, {
        name: name,
        fromWireType: function (value) {
          var length = HEAPU32[value >> 2]
          var HEAP = getHeap()
          var str
          var decodeStartPtr = value + 4
          for (var i = 0; i <= length; ++i) {
            var currentBytePtr = value + 4 + i * charSize
            if (i == length || HEAP[currentBytePtr >> shift] == 0) {
              var maxReadBytes = currentBytePtr - decodeStartPtr
              var stringSegment = decodeString(decodeStartPtr, maxReadBytes)
              if (str === undefined) {
                str = stringSegment
              } else {
                str += String.fromCharCode(0)
                str += stringSegment
              }
              decodeStartPtr = currentBytePtr + charSize
            }
          }
          _free(value)
          return str
        },
        toWireType: function (destructors, value) {
          if (!(typeof value === 'string')) {
            throwBindingError(
              'Cannot pass non-string to C++ string type ' + name
            )
          }
          var length = lengthBytesUTF(value)
          var ptr = _malloc(4 + length + charSize)
          HEAPU32[ptr >> 2] = length >> shift
          encodeString(value, ptr + 4, length + charSize)
          if (destructors !== null) {
            destructors.push(_free, ptr)
          }
          return ptr
        },
        argPackAdvance: 8,
        readValueFromPointer: simpleReadValueFromPointer,
        destructorFunction: function (ptr) {
          _free(ptr)
        },
      })
    }
    function __embind_register_void(rawType, name) {
      name = readLatin1String(name)
      registerType(rawType, {
        isVoid: true,
        name: name,
        argPackAdvance: 0,
        fromWireType: function () {
          return undefined
        },
        toWireType: function (destructors, o) {
          return undefined
        },
      })
    }
    var emval_symbols = {}
    function getStringOrSymbol(address) {
      var symbol = emval_symbols[address]
      if (symbol === undefined) {
        return readLatin1String(address)
      } else {
        return symbol
      }
    }
    function emval_get_global() {
      if (typeof globalThis === 'object') {
        return globalThis
      }
      return (function () {
        return Function
      })()('return this')()
    }
    function __emval_get_global(name) {
      if (name === 0) {
        return __emval_register(emval_get_global())
      } else {
        name = getStringOrSymbol(name)
        return __emval_register(emval_get_global()[name])
      }
    }
    function __emval_incref(handle) {
      if (handle > 4) {
        emval_handle_array[handle].refcount += 1
      }
    }
    function requireRegisteredType(rawType, humanName) {
      var impl = registeredTypes[rawType]
      if (undefined === impl) {
        throwBindingError(
          humanName + ' has unknown type ' + getTypeName(rawType)
        )
      }
      return impl
    }
    function craftEmvalAllocator(argCount) {
      var argsList = ''
      for (var i = 0; i < argCount; ++i) {
        argsList += (i !== 0 ? ', ' : '') + 'arg' + i
      }
      var functionBody =
        'return function emval_allocator_' +
        argCount +
        '(constructor, argTypes, args) {\n'
      for (var i = 0; i < argCount; ++i) {
        functionBody +=
          'var argType' +
          i +
          " = requireRegisteredType(Module['HEAP32'][(argTypes >>> 2) + " +
          i +
          '], "parameter ' +
          i +
          '");\n' +
          'var arg' +
          i +
          ' = argType' +
          i +
          '.readValueFromPointer(args);\n' +
          'args += argType' +
          i +
          "['argPackAdvance'];\n"
      }
      functionBody +=
        'var obj = new constructor(' +
        argsList +
        ');\n' +
        'return __emval_register(obj);\n' +
        '}\n'
      return new Function(
        'requireRegisteredType',
        'Module',
        '__emval_register',
        functionBody
      )(requireRegisteredType, Module, __emval_register)
    }
    var emval_newers = {}
    function requireHandle(handle) {
      if (!handle) {
        throwBindingError('Cannot use deleted val. handle = ' + handle)
      }
      return emval_handle_array[handle].value
    }
    function __emval_new(handle, argCount, argTypes, args) {
      handle = requireHandle(handle)
      var newer = emval_newers[argCount]
      if (!newer) {
        newer = craftEmvalAllocator(argCount)
        emval_newers[argCount] = newer
      }
      return newer(handle, argTypes, args)
    }
    function _abort() {
      abort()
    }
    function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.copyWithin(dest, src, src + num)
    }
    function emscripten_realloc_buffer(size) {
      try {
        wasmMemory.grow((size - buffer.byteLength + 65535) >>> 16)
        updateGlobalBufferAndViews(wasmMemory.buffer)
        return 1
      } catch (e) {}
    }
    function _emscripten_resize_heap(requestedSize) {
      var oldSize = HEAPU8.length
      requestedSize = requestedSize >>> 0
      var maxHeapSize = 2147483648
      if (requestedSize > maxHeapSize) {
        return false
      }
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown)
        overGrownHeapSize = Math.min(
          overGrownHeapSize,
          requestedSize + 100663296
        )
        var newSize = Math.min(
          maxHeapSize,
          alignUp(Math.max(requestedSize, overGrownHeapSize), 65536)
        )
        var replacement = emscripten_realloc_buffer(newSize)
        if (replacement) {
          return true
        }
      }
      return false
    }
    var ENV = {}
    function getExecutableName() {
      return thisProgram || './this.program'
    }
    function getEnvStrings() {
      if (!getEnvStrings.strings) {
        var lang =
          (
            (typeof navigator === 'object' &&
              navigator.languages &&
              navigator.languages[0]) ||
            'C'
          ).replace('-', '_') + '.UTF-8'
        var env = {
          USER: 'web_user',
          LOGNAME: 'web_user',
          PATH: '/',
          PWD: '/',
          HOME: '/home/web_user',
          LANG: lang,
          _: getExecutableName(),
        }
        for (var x in ENV) {
          env[x] = ENV[x]
        }
        var strings = []
        for (var x in env) {
          strings.push(x + '=' + env[x])
        }
        getEnvStrings.strings = strings
      }
      return getEnvStrings.strings
    }
    var SYSCALLS = {
      mappings: {},
      buffers: [null, [], []],
      printChar: function (stream, curr) {
        var buffer = SYSCALLS.buffers[stream]
        if (curr === 0 || curr === 10) {
          ;(stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0))
          buffer.length = 0
        } else {
          buffer.push(curr)
        }
      },
      varargs: undefined,
      get: function () {
        SYSCALLS.varargs += 4
        var ret = HEAP32[(SYSCALLS.varargs - 4) >> 2]
        return ret
      },
      getStr: function (ptr) {
        var ret = UTF8ToString(ptr)
        return ret
      },
      get64: function (low, high) {
        return low
      },
    }
    function _environ_get(__environ, environ_buf) {
      var bufSize = 0
      getEnvStrings().forEach(function (string, i) {
        var ptr = environ_buf + bufSize
        HEAP32[(__environ + i * 4) >> 2] = ptr
        writeAsciiToMemory(string, ptr)
        bufSize += string.length + 1
      })
      return 0
    }
    function _environ_sizes_get(penviron_count, penviron_buf_size) {
      var strings = getEnvStrings()
      HEAP32[penviron_count >> 2] = strings.length
      var bufSize = 0
      strings.forEach(function (string) {
        bufSize += string.length + 1
      })
      HEAP32[penviron_buf_size >> 2] = bufSize
      return 0
    }
    function _exit(status) {
      exit(status)
    }
    function _fd_close(fd) {
      return 0
    }
    function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {}
    function _fd_write(fd, iov, iovcnt, pnum) {
      var num = 0
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(iov + i * 8) >> 2]
        var len = HEAP32[(iov + (i * 8 + 4)) >> 2]
        for (var j = 0; j < len; j++) {
          SYSCALLS.printChar(fd, HEAPU8[ptr + j])
        }
        num += len
      }
      HEAP32[pnum >> 2] = num
      return 0
    }
    function _setTempRet0(val) {
      setTempRet0(val)
    }
    embind_init_charCodes()
    BindingError = Module['BindingError'] = extendError(Error, 'BindingError')
    InternalError = Module['InternalError'] = extendError(
      Error,
      'InternalError'
    )
    init_emval()
    UnboundTypeError = Module['UnboundTypeError'] = extendError(
      Error,
      'UnboundTypeError'
    )
    var asmLibraryArg = {
      e: ___cxa_thread_atexit,
      q: __embind_register_bigint,
      m: __embind_register_bool,
      x: __embind_register_emval,
      l: __embind_register_float,
      o: __embind_register_function,
      b: __embind_register_integer,
      a: __embind_register_memory_view,
      h: __embind_register_std_string,
      g: __embind_register_std_wstring,
      n: __embind_register_void,
      c: __emval_decref,
      d: __emval_get_global,
      i: __emval_incref,
      j: __emval_new,
      k: _abort,
      s: _emscripten_memcpy_big,
      f: _emscripten_resize_heap,
      t: _environ_get,
      u: _environ_sizes_get,
      y: _exit,
      w: _fd_close,
      p: _fd_seek,
      v: _fd_write,
      r: _setTempRet0,
    }
    var asm = createWasm()
    var ___wasm_call_ctors = (Module['___wasm_call_ctors'] = function () {
      return (___wasm_call_ctors = Module['___wasm_call_ctors'] =
        Module['asm']['A']).apply(null, arguments)
    })
    var _malloc = (Module['_malloc'] = function () {
      return (_malloc = Module['_malloc'] = Module['asm']['B']).apply(
        null,
        arguments
      )
    })
    var _free = (Module['_free'] = function () {
      return (_free = Module['_free'] = Module['asm']['C']).apply(
        null,
        arguments
      )
    })
    var ___getTypeName = (Module['___getTypeName'] = function () {
      return (___getTypeName = Module['___getTypeName'] =
        Module['asm']['D']).apply(null, arguments)
    })
    var ___embind_register_native_and_builtin_types = (Module[
      '___embind_register_native_and_builtin_types'
    ] = function () {
      return (___embind_register_native_and_builtin_types = Module[
        '___embind_register_native_and_builtin_types'
      ] =
        Module['asm']['E']).apply(null, arguments)
    })
    var dynCall_jiji = (Module['dynCall_jiji'] = function () {
      return (dynCall_jiji = Module['dynCall_jiji'] = Module['asm']['G']).apply(
        null,
        arguments
      )
    })
    var calledRun
    function ExitStatus(status) {
      this.name = 'ExitStatus'
      this.message = 'Program terminated with exit(' + status + ')'
      this.status = status
    }
    dependenciesFulfilled = function runCaller() {
      if (!calledRun) run()
      if (!calledRun) dependenciesFulfilled = runCaller
    }
    function run(args) {
      args = args || arguments_
      if (runDependencies > 0) {
        return
      }
      preRun()
      if (runDependencies > 0) {
        return
      }
      function doRun() {
        if (calledRun) return
        calledRun = true
        Module['calledRun'] = true
        if (ABORT) return
        initRuntime()
        readyPromiseResolve(Module)
        if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']()
        postRun()
      }
      if (Module['setStatus']) {
        Module['setStatus']('Running...')
        setTimeout(function () {
          setTimeout(function () {
            Module['setStatus']('')
          }, 1)
          doRun()
        }, 1)
      } else {
        doRun()
      }
    }
    Module['run'] = run
    function exit(status, implicit) {
      EXITSTATUS = status
      if (implicit && keepRuntimeAlive() && status === 0) {
        return
      }
      if (keepRuntimeAlive()) {
      } else {
        exitRuntime()
        if (Module['onExit']) Module['onExit'](status)
        ABORT = true
      }
      quit_(status, new ExitStatus(status))
    }
    if (Module['preInit']) {
      if (typeof Module['preInit'] == 'function')
        Module['preInit'] = [Module['preInit']]
      while (Module['preInit'].length > 0) {
        Module['preInit'].pop()()
      }
    }
    run()

    return Module.ready
  }
})()
export default Module
