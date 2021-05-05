/* eslint-disable */
// Improved version of https://github.com/Yaffle/EventSource/
// Available under MIT License (MIT)
// Only tries to support IE11 and nothing below
var document = window.document
var Response = window.Response
var TextDecoder = window.TextDecoder
var TextEncoder = window.TextEncoder
var AbortController = window.AbortController

if (AbortController == undefined) {
  AbortController = function () {
    this.signal = null
    this.abort = function () {}
  }
}

function TextDecoderPolyfill() {
  this.bitsNeeded = 0
  this.codePoint = 0
}

TextDecoderPolyfill.prototype.decode = function (octets) {
  function valid(codePoint, shift, octetsCount) {
    if (octetsCount === 1) {
      return codePoint >= 0x0080 >> shift && codePoint << shift <= 0x07ff
    }
    if (octetsCount === 2) {
      return (
        (codePoint >= 0x0800 >> shift && codePoint << shift <= 0xd7ff) ||
        (codePoint >= 0xe000 >> shift && codePoint << shift <= 0xffff)
      )
    }
    if (octetsCount === 3) {
      return codePoint >= 0x010000 >> shift && codePoint << shift <= 0x10ffff
    }
    throw new Error()
  }
  function octetsCount(bitsNeeded, codePoint) {
    if (bitsNeeded === 6 * 1) {
      return codePoint >> 6 > 15 ? 3 : codePoint > 31 ? 2 : 1
    }
    if (bitsNeeded === 6 * 2) {
      return codePoint > 15 ? 3 : 2
    }
    if (bitsNeeded === 6 * 3) {
      return 3
    }
    throw new Error()
  }
  var REPLACER = 0xfffd
  var string = ''
  var bitsNeeded = this.bitsNeeded
  var codePoint = this.codePoint
  for (var i = 0; i < octets.length; i += 1) {
    var octet = octets[i]
    if (bitsNeeded !== 0) {
      if (
        octet < 128 ||
        octet > 191 ||
        !valid(
          (codePoint << 6) | (octet & 63),
          bitsNeeded - 6,
          octetsCount(bitsNeeded, codePoint)
        )
      ) {
        bitsNeeded = 0
        codePoint = REPLACER
        string += String.fromCharCode(codePoint)
      }
    }
    if (bitsNeeded === 0) {
      if (octet >= 0 && octet <= 127) {
        bitsNeeded = 0
        codePoint = octet
      } else if (octet >= 192 && octet <= 223) {
        bitsNeeded = 6 * 1
        codePoint = octet & 31
      } else if (octet >= 224 && octet <= 239) {
        bitsNeeded = 6 * 2
        codePoint = octet & 15
      } else if (octet >= 240 && octet <= 247) {
        bitsNeeded = 6 * 3
        codePoint = octet & 7
      } else {
        bitsNeeded = 0
        codePoint = REPLACER
      }
      if (
        bitsNeeded !== 0 &&
        !valid(codePoint, bitsNeeded, octetsCount(bitsNeeded, codePoint))
      ) {
        bitsNeeded = 0
        codePoint = REPLACER
      }
    } else {
      bitsNeeded -= 6
      codePoint = (codePoint << 6) | (octet & 63)
    }
    if (bitsNeeded === 0) {
      if (codePoint <= 0xffff) {
        string += String.fromCharCode(codePoint)
      } else {
        string += String.fromCharCode(0xd800 + ((codePoint - 0xffff - 1) >> 10))
        string += String.fromCharCode(
          0xdc00 + ((codePoint - 0xffff - 1) & 0x3ff)
        )
      }
    }
  }
  this.bitsNeeded = bitsNeeded
  this.codePoint = codePoint
  return string
}

// Firefox < 38 throws an error with stream option
var supportsStreamOption = function () {
  try {
    return (
      new TextDecoder().decode(new TextEncoder().encode('test'), {
        stream: true,
      }) === 'test'
    )
  } catch (error) {
    console.log(error)
  }
  return false
}

// IE, Edge
if (
  TextDecoder == undefined ||
  TextEncoder == undefined ||
  !supportsStreamOption()
) {
  TextDecoder = TextDecoderPolyfill
}

var k = function () {}

function XHRWrapper(xhr) {
  this.withCredentials = false
  this.responseType = ''
  this.readyState = 0
  this.status = 0
  this.statusText = ''
  this.responseText = ''
  this.onprogress = k
  this.onreadystatechange = k
  this._contentType = ''
  this._xhr = xhr
  this._sendTimeout = 0
  this._abort = k
}

XHRWrapper.prototype.open = function (method, url) {
  this._abort(true)

  var that = this
  var xhr = this._xhr
  var state = 1
  var timeout = 0

  this._abort = function (silent) {
    if (that._sendTimeout !== 0) {
      clearTimeout(that._sendTimeout)
      that._sendTimeout = 0
    }
    if (state === 1 || state === 2 || state === 3) {
      state = 4
      xhr.onload = k
      xhr.onerror = k
      xhr.onabort = k
      xhr.onprogress = k
      xhr.onreadystatechange = k
      // IE 8 - 9: XDomainRequest#abort() does not fire any event
      // Opera < 10: XMLHttpRequest#abort() does not fire any event
      xhr.abort()
      if (timeout !== 0) {
        clearTimeout(timeout)
        timeout = 0
      }
      if (!silent) {
        that.readyState = 4
        that.onreadystatechange()
      }
    }
    state = 0
  }

  var onStart = function () {
    if (state === 1) {
      // state = 2;
      var status = 0
      var statusText = ''
      var contentType = undefined
      if (!('contentType' in xhr)) {
        try {
          status = xhr.status
          statusText = xhr.statusText
          contentType = xhr.getResponseHeader('Content-Type')
        } catch (error) {
          // IE < 10 throws exception for `xhr.status` when xhr.readyState === 2 || xhr.readyState === 3
          // Opera < 11 throws exception for `xhr.status` when xhr.readyState === 2
          // https://bugs.webkit.org/show_bug.cgi?id=29121
          status = 0
          statusText = ''
          contentType = undefined
          // Firefox < 14, Chrome ?, Safari ?
          // https://bugs.webkit.org/show_bug.cgi?id=29658
          // https://bugs.webkit.org/show_bug.cgi?id=77854
        }
      } else {
        status = 200
        statusText = 'OK'
        contentType = xhr.contentType
      }
      if (status !== 0) {
        state = 2
        that.readyState = 2
        that.status = status
        that.statusText = statusText
        that._contentType = contentType
        that.onreadystatechange()
      }
    }
  }
  var onProgress = function () {
    onStart()
    if (state === 2 || state === 3) {
      state = 3
      var responseText = ''
      try {
        responseText = xhr.responseText
      } catch (error) {
        // IE 8 - 9 with XMLHttpRequest
      }
      that.readyState = 3
      that.responseText = responseText
      that.onprogress()
    }
  }
  var onFinish = function () {
    // Firefox 52 fires "readystatechange" (xhr.readyState === 4) without final "readystatechange" (xhr.readyState === 3)
    // IE 8 fires "onload" without "onprogress"
    onProgress()
    if (state === 1 || state === 2 || state === 3) {
      state = 4
      if (timeout !== 0) {
        clearTimeout(timeout)
        timeout = 0
      }
      that.readyState = 4
      that.onreadystatechange()
    }
  }
  var onReadyStateChange = function () {
    if (xhr != undefined) {
      // Opera 12
      if (xhr.readyState === 4) {
        onFinish()
      } else if (xhr.readyState === 3) {
        onProgress()
      } else if (xhr.readyState === 2) {
        onStart()
      }
    }
  }
  var onTimeout = function () {
    timeout = setTimeout(function () {
      onTimeout()
    }, 500)
    if (xhr.readyState === 3) {
      onProgress()
    }
  }

  // XDomainRequest#abort removes onprogress, onerror, onload
  xhr.onload = onFinish
  xhr.onerror = onFinish
  // improper fix to match Firefox behavior, but it is better than just ignore abort
  // see https://bugzilla.mozilla.org/show_bug.cgi?id=768596
  // https://bugzilla.mozilla.org/show_bug.cgi?id=880200
  // https://code.google.com/p/chromium/issues/detail?id=153570
  // IE 8 fires "onload" without "onprogress
  xhr.onabort = onFinish

  // https://bugzilla.mozilla.org/show_bug.cgi?id=736723
  if (
    !('sendAsBinary' in XMLHttpRequest.prototype) &&
    !('mozAnon' in XMLHttpRequest.prototype)
  ) {
    xhr.onprogress = onProgress
  }

  // IE 8 - 9 (XMLHTTPRequest)
  // Opera < 12
  // Firefox < 3.5
  // Firefox 3.5 - 3.6 - ? < 9.0
  // onprogress is not fired sometimes or delayed
  // see also #64
  xhr.onreadystatechange = onReadyStateChange

  if ('contentType' in xhr) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + 'padding=true'
  }
  xhr.open(method, url, true)

  if ('readyState' in xhr) {
    // workaround for Opera 12 issue with "progress" events
    // #91
    timeout = setTimeout(function () {
      onTimeout()
    }, 0)
  }
}
XHRWrapper.prototype.abort = function () {
  this._abort(false)
}
XHRWrapper.prototype.getResponseHeader = function (name) {
  return this._contentType
}
XHRWrapper.prototype.setRequestHeader = function (name, value) {
  var xhr = this._xhr
  if ('setRequestHeader' in xhr) {
    xhr.setRequestHeader(name, value)
  }
}
XHRWrapper.prototype.getAllResponseHeaders = function () {
  return this._xhr.getAllResponseHeaders != undefined
    ? this._xhr.getAllResponseHeaders()
    : ''
}
XHRWrapper.prototype.send = function () {
  // loading indicator in Safari < ? (6), Chrome < 14, Firefox
  if (
    !('ontimeout' in XMLHttpRequest.prototype) &&
    document != undefined &&
    document.readyState != undefined &&
    document.readyState !== 'complete'
  ) {
    var that = this
    that._sendTimeout = setTimeout(function () {
      that._sendTimeout = 0
      that.send()
    }, 4)
    return
  }

  var xhr = this._xhr
  // withCredentials should be set after "open" for Safari and Chrome (< 19 ?)
  xhr.withCredentials = this.withCredentials
  xhr.responseType = this.responseType
  try {
    // xhr.send(); throws "Not enough arguments" in Firefox 3.0
    xhr.send(undefined)
  } catch (error1) {
    // Safari 5.1.7, Opera 12
    throw error1
  }
}

function toLowerCase(name) {
  return name.replace(/[A-Z]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) + 0x20)
  })
}

function HeadersPolyfill(all) {
  // Get headers: implemented according to mozilla's example code: https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/getAllResponseHeaders#Example
  var map = Object.create(null)
  var array = all.split('\r\n')
  for (var i = 0; i < array.length; i += 1) {
    var line = array[i]
    var parts = line.split(': ')
    var name = parts.shift()
    var value = parts.join(': ')
    map[toLowerCase(name)] = value
  }
  this._map = map
}
HeadersPolyfill.prototype.get = function (name) {
  return this._map[toLowerCase(name)]
}

function XHRTransport() {}

XHRTransport.prototype.open = function (
  xhr,
  onStartCallback,
  onProgressCallback,
  onFinishCallback,
  url,
  withCredentials,
  headers
) {
  xhr.open('GET', url)
  var offset = 0
  xhr.onprogress = function () {
    var responseText = xhr.responseText
    var chunk = responseText.slice(offset)
    offset += chunk.length
    onProgressCallback(chunk)
  }
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 2) {
      var status = xhr.status
      var statusText = xhr.statusText
      var contentType = xhr.getResponseHeader('Content-Type')
      var headers = xhr.getAllResponseHeaders()
      onStartCallback(
        status,
        statusText,
        contentType,
        new HeadersPolyfill(headers),
        function () {
          xhr.abort()
        }
      )
    } else if (xhr.readyState === 4) {
      onFinishCallback()
    }
  }
  xhr.withCredentials = withCredentials
  xhr.responseType = 'text'
  for (var name in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, name)) {
      xhr.setRequestHeader(name, headers[name])
    }
  }
  xhr.send()
}

function HeadersWrapper(headers) {
  this._headers = headers
}
HeadersWrapper.prototype.get = function (name) {
  return this._headers.get(name)
}

function FetchTransport() {}

FetchTransport.prototype.open = function (
  xhr,
  onStartCallback,
  onProgressCallback,
  onFinishCallback,
  url,
  withCredentials,
  headers
) {
  var controller = new AbortController()
  var signal = controller.signal // see #120
  var textDecoder = new TextDecoder()
  fetch(url, {
    headers: headers,
    credentials: withCredentials ? 'include' : 'same-origin',
    signal: signal,
    cache: 'no-store',
  })
    .then(function (response) {
      var reader = response.body.getReader()
      onStartCallback(
        response.status,
        response.statusText,
        response.headers.get('Content-Type'),
        new HeadersWrapper(response.headers),
        function () {
          controller.abort()
          reader.cancel()
        }
      )
      return new Promise(function (resolve, reject) {
        var readNextChunk = function () {
          reader
            .read()
            .then(function (result) {
              if (result.done) {
                // Note: bytes in textDecoder are ignored
                resolve(undefined)
              } else {
                var chunk = textDecoder.decode(result.value, { stream: true })
                onProgressCallback(chunk)
                readNextChunk()
              }
            })
            ['catch'](function (error) {
              reject(error)
            })
        }
        readNextChunk()
      })
    })
    .then(
      function (result) {
        onFinishCallback()
        return result
      },
      function (error) {
        onFinishCallback()
        return Promise.reject(error)
      }
    )
}

function EventTarget() {
  this._listeners = Object.create(null)
}

function throwError(e) {
  setTimeout(function () {
    throw e
  }, 0)
}

EventTarget.prototype.dispatchEvent = function (event) {
  event.target = this
  var typeListeners = this._listeners[event.type]
  if (typeListeners != undefined) {
    var length = typeListeners.length
    for (var i = 0; i < length; i += 1) {
      var listener = typeListeners[i]
      try {
        if (typeof listener.handleEvent === 'function') {
          listener.handleEvent(event)
        } else {
          listener.call(this, event)
        }
      } catch (e) {
        throwError(e)
      }
    }
  }
}
EventTarget.prototype.addEventListener = function (type, listener) {
  type = String(type)
  var listeners = this._listeners
  var typeListeners = listeners[type]
  if (typeListeners == undefined) {
    typeListeners = []
    listeners[type] = typeListeners
  }
  var found = false
  for (var i = 0; i < typeListeners.length; i += 1) {
    if (typeListeners[i] === listener) {
      found = true
    }
  }
  if (!found) {
    typeListeners.push(listener)
  }
}
EventTarget.prototype.removeEventListener = function (type, listener) {
  type = String(type)
  var listeners = this._listeners
  var typeListeners = listeners[type]
  if (typeListeners != undefined) {
    var filtered = []
    for (var i = 0; i < typeListeners.length; i += 1) {
      if (typeListeners[i] !== listener) {
        filtered.push(typeListeners[i])
      }
    }
    if (filtered.length === 0) {
      delete listeners[type]
    } else {
      listeners[type] = filtered
    }
  }
}

function Event(type) {
  this.type = type
  this.target = undefined
}

function MessageEvent(type, options) {
  Event.call(this, type)
  this.data = options.data
  this.lastEventId = options.lastEventId
}

MessageEvent.prototype = Object.create(Event.prototype)

function ConnectionEvent(type, options) {
  Event.call(this, type)
  this.status = options.status
  this.statusText = options.statusText
  this.headers = options.headers
}

ConnectionEvent.prototype = Object.create(Event.prototype)

var WAITING = -1
var CONNECTING = 0
var OPEN = 1
var CLOSED = 2

var AFTER_CR = -1
var FIELD_START = 0
var FIELD = 1
var VALUE_START = 2
var VALUE = 3

var contentTypeRegExp = /^text\/event\-stream;?(\s*charset\=utf\-8)?$/i

var MINIMUM_DURATION = 1000
var MAXIMUM_DURATION = 18000000

var parseDuration = function (value, def) {
  var n = parseInt(value, 10)
  if (n !== n) {
    n = def
  }
  return clampDuration(n)
}
var clampDuration = function (n) {
  return Math.min(Math.max(n, MINIMUM_DURATION), MAXIMUM_DURATION)
}

var fire = function (that, f, event) {
  try {
    if (typeof f === 'function') {
      f.call(that, event)
    }
  } catch (e) {
    throwError(e)
  }
}

function EventSourcePolyfill(url, options) {
  EventTarget.call(this)

  this.onopen = undefined
  this.onmessage = undefined
  this.onerror = undefined

  this.url = undefined
  this.readyState = undefined
  this.withCredentials = undefined

  this._close = undefined

  start(this, url, options)
}

var isFetchSupported =
  fetch != undefined && Response != undefined && 'body' in Response.prototype

function start(es, url, options) {
  url = String(url)
  var withCredentials = options != undefined && Boolean(options.withCredentials)

  var initialRetry = clampDuration(1000)
  var heartbeatTimeout =
    options != undefined && options.heartbeatTimeout != undefined
      ? parseDuration(options.heartbeatTimeout, 45000)
      : clampDuration(45000)

  var lastEventId = ''
  var retry = initialRetry
  var wasActivity = false
  var headers =
    options != undefined && options.headers != undefined
      ? JSON.parse(JSON.stringify(options.headers))
      : undefined
  var CurrentTransport =
    options != undefined && options.Transport != undefined
      ? options.Transport
      : XMLHttpRequest
  var xhr =
    isFetchSupported &&
    !(options != undefined && options.Transport != undefined)
      ? undefined
      : new XHRWrapper(new CurrentTransport())
  var transport = xhr == undefined ? new FetchTransport() : new XHRTransport()
  var cancelFunction = undefined
  var timeout = 0
  var currentState = WAITING
  var dataBuffer = ''
  var lastEventIdBuffer = ''
  var eventTypeBuffer = ''

  var textBuffer = ''
  var state = FIELD_START
  var fieldStart = 0
  var valueStart = 0

  var onStart = function (status, statusText, contentType, headers, cancel) {
    if (currentState === CONNECTING) {
      cancelFunction = cancel
      if (
        status === 200 &&
        contentType != undefined &&
        contentTypeRegExp.test(contentType)
      ) {
        currentState = OPEN
        wasActivity = true
        retry = initialRetry
        es.readyState = OPEN
        var event = new ConnectionEvent('open', {
          status: status,
          statusText: statusText,
          headers: headers,
        })
        es.dispatchEvent(event)
        fire(es, es.onopen, event)
      } else {
        var message = ''
        if (status !== 200) {
          if (statusText) {
            statusText = statusText.replace(/\s+/g, ' ')
          }
          message =
            "EventSource's response has a status " +
            status +
            ' ' +
            statusText +
            ' that is not 200. Aborting the connection.'
        } else {
          message =
            "EventSource's response has a Content-Type specifying an unsupported type: " +
            (contentType == undefined
              ? '-'
              : contentType.replace(/\s+/g, ' ')) +
            '. Aborting the connection.'
        }
        throwError(new Error(message))
        close()
        var event = new ConnectionEvent('error', {
          status: status,
          statusText: statusText,
          headers: headers,
        })
        es.dispatchEvent(event)
        fire(es, es.onerror, event)
      }
    }
  }

  var onProgress = function (textChunk) {
    if (currentState === OPEN) {
      var n = -1
      for (var i = 0; i < textChunk.length; i += 1) {
        var c = textChunk.charCodeAt(i)
        if (c === '\n'.charCodeAt(0) || c === '\r'.charCodeAt(0)) {
          n = i
        }
      }
      var chunk = (n !== -1 ? textBuffer : '') + textChunk.slice(0, n + 1)
      textBuffer = (n === -1 ? textBuffer : '') + textChunk.slice(n + 1)
      if (chunk !== '') {
        wasActivity = true
      }
      for (var position = 0; position < chunk.length; position += 1) {
        var c = chunk.charCodeAt(position)
        if (state === AFTER_CR && c === '\n'.charCodeAt(0)) {
          state = FIELD_START
        } else {
          if (state === AFTER_CR) {
            state = FIELD_START
          }
          if (c === '\r'.charCodeAt(0) || c === '\n'.charCodeAt(0)) {
            if (state !== FIELD_START) {
              if (state === FIELD) {
                valueStart = position + 1
              }
              var field = chunk.slice(fieldStart, valueStart - 1)
              var value = chunk.slice(
                valueStart +
                  (valueStart < position &&
                  chunk.charCodeAt(valueStart) === ' '.charCodeAt(0)
                    ? 1
                    : 0),
                position
              )
              if (field === 'data') {
                dataBuffer += '\n'
                dataBuffer += value
              } else if (field === 'id') {
                lastEventIdBuffer = value
              } else if (field === 'event') {
                eventTypeBuffer = value
              } else if (field === 'retry') {
                initialRetry = parseDuration(value, initialRetry)
                retry = initialRetry
              } else if (field === 'heartbeatTimeout') {
                heartbeatTimeout = parseDuration(value, heartbeatTimeout)
                if (timeout !== 0) {
                  clearTimeout(timeout)
                  timeout = setTimeout(function () {
                    onTimeout()
                  }, heartbeatTimeout)
                }
              }
            }
            if (state === FIELD_START) {
              if (dataBuffer !== '') {
                lastEventId = lastEventIdBuffer
                if (eventTypeBuffer === '') {
                  eventTypeBuffer = 'message'
                }
                var event = new MessageEvent(eventTypeBuffer, {
                  data: dataBuffer.slice(1),
                  lastEventId: lastEventIdBuffer,
                })
                es.dispatchEvent(event)
                if (eventTypeBuffer === 'message') {
                  fire(es, es.onmessage, event)
                }
                if (currentState === CLOSED) {
                  return
                }
              }
              dataBuffer = ''
              eventTypeBuffer = ''
            }
            state = c === '\r'.charCodeAt(0) ? AFTER_CR : FIELD_START
          } else {
            if (state === FIELD_START) {
              fieldStart = position
              state = FIELD
            }
            if (state === FIELD) {
              if (c === ':'.charCodeAt(0)) {
                valueStart = position + 1
                state = VALUE_START
              }
            } else if (state === VALUE_START) {
              state = VALUE
            }
          }
        }
      }
    }
  }

  var onFinish = function () {
    if (currentState === OPEN || currentState === CONNECTING) {
      currentState = WAITING
      if (timeout !== 0) {
        clearTimeout(timeout)
        timeout = 0
      }
      timeout = setTimeout(function () {
        onTimeout()
      }, retry)
      retry = clampDuration(Math.min(initialRetry * 16, retry * 2))

      es.readyState = CONNECTING
      var event = new Event('error')
      es.dispatchEvent(event)
      fire(es, es.onerror, event)
    }
  }

  var close = function () {
    currentState = CLOSED
    if (cancelFunction != undefined) {
      cancelFunction()
      cancelFunction = undefined
    }
    if (timeout !== 0) {
      clearTimeout(timeout)
      timeout = 0
    }
    es.readyState = CLOSED
  }

  var onTimeout = function () {
    timeout = 0

    if (currentState !== WAITING) {
      if (!wasActivity && cancelFunction != undefined) {
        throwError(
          new Error(
            'No activity within ' +
              heartbeatTimeout +
              ' milliseconds. Reconnecting.'
          )
        )
        cancelFunction()
        cancelFunction = undefined
      } else {
        wasActivity = false
        timeout = setTimeout(function () {
          onTimeout()
        }, heartbeatTimeout)
      }
      return
    }

    wasActivity = false
    timeout = setTimeout(function () {
      onTimeout()
    }, heartbeatTimeout)

    currentState = CONNECTING
    dataBuffer = ''
    eventTypeBuffer = ''
    lastEventIdBuffer = lastEventId
    textBuffer = ''
    fieldStart = 0
    valueStart = 0
    state = FIELD_START

    // https://bugzilla.mozilla.org/show_bug.cgi?id=428916
    // Request header field Last-Event-ID is not allowed by Access-Control-Allow-Headers.
    var requestURL = url
    if (url.slice(0, 5) !== 'data:' && url.slice(0, 5) !== 'blob:') {
      if (lastEventId !== '') {
        requestURL +=
          (url.indexOf('?') === -1 ? '?' : '&') +
          'lastEventId=' +
          encodeURIComponent(lastEventId)
      }
    }
    var requestHeaders = {}
    requestHeaders['Accept'] = 'text/event-stream'
    if (headers != undefined) {
      for (var name in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, name)) {
          requestHeaders[name] = headers[name]
        }
      }
    }
    try {
      transport.open(
        xhr,
        onStart,
        onProgress,
        onFinish,
        requestURL,
        withCredentials,
        requestHeaders
      )
    } catch (error) {
      close()
      throw error
    }
  }

  es.url = url
  es.readyState = CONNECTING
  es.withCredentials = withCredentials
  es._close = close

  onTimeout()
}

EventSourcePolyfill.prototype = Object.create(EventTarget.prototype)
EventSourcePolyfill.prototype.CONNECTING = CONNECTING
EventSourcePolyfill.prototype.OPEN = OPEN
EventSourcePolyfill.prototype.CLOSED = CLOSED
EventSourcePolyfill.prototype.close = function () {
  this._close()
}

EventSourcePolyfill.CONNECTING = CONNECTING
EventSourcePolyfill.OPEN = OPEN
EventSourcePolyfill.CLOSED = CLOSED
EventSourcePolyfill.prototype.withCredentials = undefined

export default EventSourcePolyfill
