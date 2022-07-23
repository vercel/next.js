var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/primitives/streams.js
var streams_exports = {};
__export(streams_exports, {
  ReadableStream: () => ReadableStream,
  ReadableStreamBYOBReader: () => ReadableStreamBYOBReader,
  ReadableStreamDefaultReader: () => ReadableStreamDefaultReader,
  TransformStream: () => TransformStream,
  WritableStream: () => WritableStream,
  WritableStreamDefaultWriter: () => WritableStreamDefaultWriter
});
module.exports = __toCommonJS(streams_exports);

// ../../node_modules/.pnpm/web-streams-polyfill@4.0.0-beta.1/node_modules/web-streams-polyfill/dist/ponyfill.mjs
var e = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? Symbol : (e2) => `Symbol(${e2})`;
function t() {
}
__name(t, "t");
function r(e2) {
  return typeof e2 == "object" && e2 !== null || typeof e2 == "function";
}
__name(r, "r");
var o = t;
var n = Promise;
var a = Promise.prototype.then;
var i = Promise.resolve.bind(n);
var l = Promise.reject.bind(n);
function s(e2) {
  return new n(e2);
}
__name(s, "s");
function u(e2) {
  return i(e2);
}
__name(u, "u");
function c(e2) {
  return l(e2);
}
__name(c, "c");
function d(e2, t2, r2) {
  return a.call(e2, t2, r2);
}
__name(d, "d");
function f(e2, t2, r2) {
  d(d(e2, t2, r2), void 0, o);
}
__name(f, "f");
function b(e2, t2) {
  f(e2, t2);
}
__name(b, "b");
function _(e2, t2) {
  f(e2, void 0, t2);
}
__name(_, "_");
function h(e2, t2, r2) {
  return d(e2, t2, r2);
}
__name(h, "h");
function m(e2) {
  d(e2, void 0, o);
}
__name(m, "m");
var p = /* @__PURE__ */ __name((e2) => {
  if (typeof queueMicrotask == "function")
    p = queueMicrotask;
  else {
    const e3 = u(void 0);
    p = /* @__PURE__ */ __name((t2) => d(e3, t2), "p");
  }
  return p(e2);
}, "p");
function y(e2, t2, r2) {
  if (typeof e2 != "function")
    throw new TypeError("Argument is not a function");
  return Function.prototype.apply.call(e2, t2, r2);
}
__name(y, "y");
function g(e2, t2, r2) {
  try {
    return u(y(e2, t2, r2));
  } catch (e3) {
    return c(e3);
  }
}
__name(g, "g");
var S = class {
  constructor() {
    this._cursor = 0, this._size = 0, this._front = { _elements: [], _next: void 0 }, this._back = this._front, this._cursor = 0, this._size = 0;
  }
  get length() {
    return this._size;
  }
  push(e2) {
    const t2 = this._back;
    let r2 = t2;
    t2._elements.length === 16383 && (r2 = { _elements: [], _next: void 0 }), t2._elements.push(e2), r2 !== t2 && (this._back = r2, t2._next = r2), ++this._size;
  }
  shift() {
    const e2 = this._front;
    let t2 = e2;
    const r2 = this._cursor;
    let o2 = r2 + 1;
    const n2 = e2._elements, a2 = n2[r2];
    return o2 === 16384 && (t2 = e2._next, o2 = 0), --this._size, this._cursor = o2, e2 !== t2 && (this._front = t2), n2[r2] = void 0, a2;
  }
  forEach(e2) {
    let t2 = this._cursor, r2 = this._front, o2 = r2._elements;
    for (; !(t2 === o2.length && r2._next === void 0 || t2 === o2.length && (r2 = r2._next, o2 = r2._elements, t2 = 0, o2.length === 0)); )
      e2(o2[t2]), ++t2;
  }
  peek() {
    const e2 = this._front, t2 = this._cursor;
    return e2._elements[t2];
  }
};
__name(S, "S");
function v(e2, t2) {
  e2._ownerReadableStream = t2, t2._reader = e2, t2._state === "readable" ? C(e2) : t2._state === "closed" ? function(e3) {
    C(e3), E(e3);
  }(e2) : q(e2, t2._storedError);
}
__name(v, "v");
function w(e2, t2) {
  return cr(e2._ownerReadableStream, t2);
}
__name(w, "w");
function R(e2) {
  e2._ownerReadableStream._state === "readable" ? P(e2, new TypeError("Reader was released and can no longer be used to monitor the stream's closedness")) : function(e3, t2) {
    q(e3, t2);
  }(e2, new TypeError("Reader was released and can no longer be used to monitor the stream's closedness")), e2._ownerReadableStream._reader = void 0, e2._ownerReadableStream = void 0;
}
__name(R, "R");
function T(e2) {
  return new TypeError("Cannot " + e2 + " a stream using a released reader");
}
__name(T, "T");
function C(e2) {
  e2._closedPromise = s((t2, r2) => {
    e2._closedPromise_resolve = t2, e2._closedPromise_reject = r2;
  });
}
__name(C, "C");
function q(e2, t2) {
  C(e2), P(e2, t2);
}
__name(q, "q");
function P(e2, t2) {
  e2._closedPromise_reject !== void 0 && (m(e2._closedPromise), e2._closedPromise_reject(t2), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0);
}
__name(P, "P");
function E(e2) {
  e2._closedPromise_resolve !== void 0 && (e2._closedPromise_resolve(void 0), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0);
}
__name(E, "E");
var W = e("[[AbortSteps]]");
var O = e("[[ErrorSteps]]");
var k = e("[[CancelSteps]]");
var B = e("[[PullSteps]]");
var j = Number.isFinite || function(e2) {
  return typeof e2 == "number" && isFinite(e2);
};
var A = Math.trunc || function(e2) {
  return e2 < 0 ? Math.ceil(e2) : Math.floor(e2);
};
function z(e2, t2) {
  if (e2 !== void 0 && (typeof (r2 = e2) != "object" && typeof r2 != "function"))
    throw new TypeError(`${t2} is not an object.`);
  var r2;
}
__name(z, "z");
function F(e2, t2) {
  if (typeof e2 != "function")
    throw new TypeError(`${t2} is not a function.`);
}
__name(F, "F");
function I(e2, t2) {
  if (!function(e3) {
    return typeof e3 == "object" && e3 !== null || typeof e3 == "function";
  }(e2))
    throw new TypeError(`${t2} is not an object.`);
}
__name(I, "I");
function L(e2, t2, r2) {
  if (e2 === void 0)
    throw new TypeError(`Parameter ${t2} is required in '${r2}'.`);
}
__name(L, "L");
function $(e2, t2, r2) {
  if (e2 === void 0)
    throw new TypeError(`${t2} is required in '${r2}'.`);
}
__name($, "$");
function D(e2) {
  return Number(e2);
}
__name(D, "D");
function M(e2) {
  return e2 === 0 ? 0 : e2;
}
__name(M, "M");
function Q(e2, t2) {
  const r2 = Number.MAX_SAFE_INTEGER;
  let o2 = Number(e2);
  if (o2 = M(o2), !j(o2))
    throw new TypeError(`${t2} is not a finite number`);
  if (o2 = function(e3) {
    return M(A(e3));
  }(o2), o2 < 0 || o2 > r2)
    throw new TypeError(`${t2} is outside the accepted range of 0 to ${r2}, inclusive`);
  return j(o2) && o2 !== 0 ? o2 : 0;
}
__name(Q, "Q");
function Y(e2, t2) {
  if (!sr(e2))
    throw new TypeError(`${t2} is not a ReadableStream.`);
}
__name(Y, "Y");
function x(e2) {
  return new ReadableStreamDefaultReader(e2);
}
__name(x, "x");
function N(e2, t2) {
  e2._reader._readRequests.push(t2);
}
__name(N, "N");
function H(e2, t2, r2) {
  const o2 = e2._reader._readRequests.shift();
  r2 ? o2._closeSteps() : o2._chunkSteps(t2);
}
__name(H, "H");
function V(e2) {
  return e2._reader._readRequests.length;
}
__name(V, "V");
function U(e2) {
  const t2 = e2._reader;
  return t2 !== void 0 && !!G(t2);
}
__name(U, "U");
var ReadableStreamDefaultReader = class {
  constructor(e2) {
    if (L(e2, 1, "ReadableStreamDefaultReader"), Y(e2, "First parameter"), ur(e2))
      throw new TypeError("This stream has already been locked for exclusive reading by another reader");
    v(this, e2), this._readRequests = new S();
  }
  get closed() {
    return G(this) ? this._closedPromise : c(J("closed"));
  }
  cancel(e2) {
    return G(this) ? this._ownerReadableStream === void 0 ? c(T("cancel")) : w(this, e2) : c(J("cancel"));
  }
  read() {
    if (!G(this))
      return c(J("read"));
    if (this._ownerReadableStream === void 0)
      return c(T("read from"));
    let e2, t2;
    const r2 = s((r3, o2) => {
      e2 = r3, t2 = o2;
    });
    return X(this, { _chunkSteps: (t3) => e2({ value: t3, done: false }), _closeSteps: () => e2({ value: void 0, done: true }), _errorSteps: (e3) => t2(e3) }), r2;
  }
  releaseLock() {
    if (!G(this))
      throw J("releaseLock");
    if (this._ownerReadableStream !== void 0) {
      if (this._readRequests.length > 0)
        throw new TypeError("Tried to release a reader lock when that reader has pending read() calls un-settled");
      R(this);
    }
  }
};
__name(ReadableStreamDefaultReader, "ReadableStreamDefaultReader");
function G(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_readRequests") && e2 instanceof ReadableStreamDefaultReader);
}
__name(G, "G");
function X(e2, t2) {
  const r2 = e2._ownerReadableStream;
  r2._disturbed = true, r2._state === "closed" ? t2._closeSteps() : r2._state === "errored" ? t2._errorSteps(r2._storedError) : r2._readableStreamController[B](t2);
}
__name(X, "X");
function J(e2) {
  return new TypeError(`ReadableStreamDefaultReader.prototype.${e2} can only be used on a ReadableStreamDefaultReader`);
}
__name(J, "J");
Object.defineProperties(ReadableStreamDefaultReader.prototype, { cancel: { enumerable: true }, read: { enumerable: true }, releaseLock: { enumerable: true }, closed: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(ReadableStreamDefaultReader.prototype, e.toStringTag, { value: "ReadableStreamDefaultReader", configurable: true });
var K = class {
  constructor(e2, t2) {
    this._ongoingPromise = void 0, this._isFinished = false, this._reader = e2, this._preventCancel = t2;
  }
  next() {
    const e2 = /* @__PURE__ */ __name(() => this._nextSteps(), "e");
    return this._ongoingPromise = this._ongoingPromise ? h(this._ongoingPromise, e2, e2) : e2(), this._ongoingPromise;
  }
  return(e2) {
    const t2 = /* @__PURE__ */ __name(() => this._returnSteps(e2), "t");
    return this._ongoingPromise ? h(this._ongoingPromise, t2, t2) : t2();
  }
  _nextSteps() {
    if (this._isFinished)
      return Promise.resolve({ value: void 0, done: true });
    const e2 = this._reader;
    if (e2._ownerReadableStream === void 0)
      return c(T("iterate"));
    let t2, r2;
    const o2 = s((e3, o3) => {
      t2 = e3, r2 = o3;
    });
    return X(e2, { _chunkSteps: (e3) => {
      this._ongoingPromise = void 0, p(() => t2({ value: e3, done: false }));
    }, _closeSteps: () => {
      this._ongoingPromise = void 0, this._isFinished = true, R(e2), t2({ value: void 0, done: true });
    }, _errorSteps: (t3) => {
      this._ongoingPromise = void 0, this._isFinished = true, R(e2), r2(t3);
    } }), o2;
  }
  _returnSteps(e2) {
    if (this._isFinished)
      return Promise.resolve({ value: e2, done: true });
    this._isFinished = true;
    const t2 = this._reader;
    if (t2._ownerReadableStream === void 0)
      return c(T("finish iterating"));
    if (!this._preventCancel) {
      const r2 = w(t2, e2);
      return R(t2), h(r2, () => ({ value: e2, done: true }));
    }
    return R(t2), u({ value: e2, done: true });
  }
};
__name(K, "K");
var Z = { next() {
  return ee(this) ? this._asyncIteratorImpl.next() : c(te("next"));
}, return(e2) {
  return ee(this) ? this._asyncIteratorImpl.return(e2) : c(te("return"));
} };
function ee(e2) {
  if (!r(e2))
    return false;
  if (!Object.prototype.hasOwnProperty.call(e2, "_asyncIteratorImpl"))
    return false;
  try {
    return e2._asyncIteratorImpl instanceof K;
  } catch (e3) {
    return false;
  }
}
__name(ee, "ee");
function te(e2) {
  return new TypeError(`ReadableStreamAsyncIterator.${e2} can only be used on a ReadableSteamAsyncIterator`);
}
__name(te, "te");
typeof e.asyncIterator == "symbol" && Object.defineProperty(Z, e.asyncIterator, { value() {
  return this;
}, writable: true, configurable: true });
var re = Number.isNaN || function(e2) {
  return e2 != e2;
};
function oe(e2) {
  return e2.slice();
}
__name(oe, "oe");
function ne(e2, t2, r2, o2, n2) {
  new Uint8Array(e2).set(new Uint8Array(r2, o2, n2), t2);
}
__name(ne, "ne");
function ae(e2, t2, r2) {
  if (e2.slice)
    return e2.slice(t2, r2);
  const o2 = r2 - t2, n2 = new ArrayBuffer(o2);
  return ne(n2, 0, e2, t2, o2), n2;
}
__name(ae, "ae");
function ie(e2) {
  const t2 = ae(e2.buffer, e2.byteOffset, e2.byteOffset + e2.byteLength);
  return new Uint8Array(t2);
}
__name(ie, "ie");
function le(e2) {
  const t2 = e2._queue.shift();
  return e2._queueTotalSize -= t2.size, e2._queueTotalSize < 0 && (e2._queueTotalSize = 0), t2.value;
}
__name(le, "le");
function se(e2, t2, r2) {
  if (typeof (o2 = r2) != "number" || re(o2) || o2 < 0 || r2 === 1 / 0)
    throw new RangeError("Size must be a finite, non-NaN, non-negative number.");
  var o2;
  e2._queue.push({ value: t2, size: r2 }), e2._queueTotalSize += r2;
}
__name(se, "se");
function ue(e2) {
  e2._queue = new S(), e2._queueTotalSize = 0;
}
__name(ue, "ue");
var ReadableStreamBYOBRequest = class {
  constructor() {
    throw new TypeError("Illegal constructor");
  }
  get view() {
    if (!de(this))
      throw je("view");
    return this._view;
  }
  respond(e2) {
    if (!de(this))
      throw je("respond");
    if (L(e2, 1, "respond"), e2 = Q(e2, "First parameter"), this._associatedReadableByteStreamController === void 0)
      throw new TypeError("This BYOB request has been invalidated");
    this._view.buffer, Oe(this._associatedReadableByteStreamController, e2);
  }
  respondWithNewView(e2) {
    if (!de(this))
      throw je("respondWithNewView");
    if (L(e2, 1, "respondWithNewView"), !ArrayBuffer.isView(e2))
      throw new TypeError("You can only respond with array buffer views");
    if (this._associatedReadableByteStreamController === void 0)
      throw new TypeError("This BYOB request has been invalidated");
    e2.buffer, ke(this._associatedReadableByteStreamController, e2);
  }
};
__name(ReadableStreamBYOBRequest, "ReadableStreamBYOBRequest");
Object.defineProperties(ReadableStreamBYOBRequest.prototype, { respond: { enumerable: true }, respondWithNewView: { enumerable: true }, view: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(ReadableStreamBYOBRequest.prototype, e.toStringTag, { value: "ReadableStreamBYOBRequest", configurable: true });
var ReadableByteStreamController = class {
  constructor() {
    throw new TypeError("Illegal constructor");
  }
  get byobRequest() {
    if (!ce(this))
      throw Ae("byobRequest");
    return Ee(this);
  }
  get desiredSize() {
    if (!ce(this))
      throw Ae("desiredSize");
    return We(this);
  }
  close() {
    if (!ce(this))
      throw Ae("close");
    if (this._closeRequested)
      throw new TypeError("The stream has already been closed; do not close it again!");
    const e2 = this._controlledReadableByteStream._state;
    if (e2 !== "readable")
      throw new TypeError(`The stream (in ${e2} state) is not in the readable state and cannot be closed`);
    Ce(this);
  }
  enqueue(e2) {
    if (!ce(this))
      throw Ae("enqueue");
    if (L(e2, 1, "enqueue"), !ArrayBuffer.isView(e2))
      throw new TypeError("chunk must be an array buffer view");
    if (e2.byteLength === 0)
      throw new TypeError("chunk must have non-zero byteLength");
    if (e2.buffer.byteLength === 0)
      throw new TypeError("chunk's buffer must have non-zero byteLength");
    if (this._closeRequested)
      throw new TypeError("stream is closed or draining");
    const t2 = this._controlledReadableByteStream._state;
    if (t2 !== "readable")
      throw new TypeError(`The stream (in ${t2} state) is not in the readable state and cannot be enqueued to`);
    qe(this, e2);
  }
  error(e2) {
    if (!ce(this))
      throw Ae("error");
    Pe(this, e2);
  }
  [k](e2) {
    be(this), ue(this);
    const t2 = this._cancelAlgorithm(e2);
    return Te(this), t2;
  }
  [B](e2) {
    const t2 = this._controlledReadableByteStream;
    if (this._queueTotalSize > 0) {
      const t3 = this._queue.shift();
      this._queueTotalSize -= t3.byteLength, ge(this);
      const r3 = new Uint8Array(t3.buffer, t3.byteOffset, t3.byteLength);
      return void e2._chunkSteps(r3);
    }
    const r2 = this._autoAllocateChunkSize;
    if (r2 !== void 0) {
      let t3;
      try {
        t3 = new ArrayBuffer(r2);
      } catch (t4) {
        return void e2._errorSteps(t4);
      }
      const o2 = { buffer: t3, bufferByteLength: r2, byteOffset: 0, byteLength: r2, bytesFilled: 0, elementSize: 1, viewConstructor: Uint8Array, readerType: "default" };
      this._pendingPullIntos.push(o2);
    }
    N(t2, e2), fe(this);
  }
};
__name(ReadableByteStreamController, "ReadableByteStreamController");
function ce(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledReadableByteStream") && e2 instanceof ReadableByteStreamController);
}
__name(ce, "ce");
function de(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_associatedReadableByteStreamController") && e2 instanceof ReadableStreamBYOBRequest);
}
__name(de, "de");
function fe(e2) {
  if (!function(e3) {
    const t2 = e3._controlledReadableByteStream;
    if (t2._state !== "readable")
      return false;
    if (e3._closeRequested)
      return false;
    if (!e3._started)
      return false;
    if (U(t2) && V(t2) > 0)
      return true;
    if (Le(t2) && Ie(t2) > 0)
      return true;
    if (We(e3) > 0)
      return true;
    return false;
  }(e2))
    return;
  if (e2._pulling)
    return void (e2._pullAgain = true);
  e2._pulling = true;
  f(e2._pullAlgorithm(), () => {
    e2._pulling = false, e2._pullAgain && (e2._pullAgain = false, fe(e2));
  }, (t2) => {
    Pe(e2, t2);
  });
}
__name(fe, "fe");
function be(e2) {
  Se(e2), e2._pendingPullIntos = new S();
}
__name(be, "be");
function _e(e2, t2) {
  let r2 = false;
  e2._state === "closed" && (r2 = true);
  const o2 = he(t2);
  t2.readerType === "default" ? H(e2, o2, r2) : function(e3, t3, r3) {
    const o3 = e3._reader._readIntoRequests.shift();
    r3 ? o3._closeSteps(t3) : o3._chunkSteps(t3);
  }(e2, o2, r2);
}
__name(_e, "_e");
function he(e2) {
  const t2 = e2.bytesFilled, r2 = e2.elementSize;
  return new e2.viewConstructor(e2.buffer, e2.byteOffset, t2 / r2);
}
__name(he, "he");
function me(e2, t2, r2, o2) {
  e2._queue.push({ buffer: t2, byteOffset: r2, byteLength: o2 }), e2._queueTotalSize += o2;
}
__name(me, "me");
function pe(e2, t2) {
  const r2 = t2.elementSize, o2 = t2.bytesFilled - t2.bytesFilled % r2, n2 = Math.min(e2._queueTotalSize, t2.byteLength - t2.bytesFilled), a2 = t2.bytesFilled + n2, i2 = a2 - a2 % r2;
  let l2 = n2, s2 = false;
  i2 > o2 && (l2 = i2 - t2.bytesFilled, s2 = true);
  const u2 = e2._queue;
  for (; l2 > 0; ) {
    const r3 = u2.peek(), o3 = Math.min(l2, r3.byteLength), n3 = t2.byteOffset + t2.bytesFilled;
    ne(t2.buffer, n3, r3.buffer, r3.byteOffset, o3), r3.byteLength === o3 ? u2.shift() : (r3.byteOffset += o3, r3.byteLength -= o3), e2._queueTotalSize -= o3, ye(e2, o3, t2), l2 -= o3;
  }
  return s2;
}
__name(pe, "pe");
function ye(e2, t2, r2) {
  r2.bytesFilled += t2;
}
__name(ye, "ye");
function ge(e2) {
  e2._queueTotalSize === 0 && e2._closeRequested ? (Te(e2), dr(e2._controlledReadableByteStream)) : fe(e2);
}
__name(ge, "ge");
function Se(e2) {
  e2._byobRequest !== null && (e2._byobRequest._associatedReadableByteStreamController = void 0, e2._byobRequest._view = null, e2._byobRequest = null);
}
__name(Se, "Se");
function ve(e2) {
  for (; e2._pendingPullIntos.length > 0; ) {
    if (e2._queueTotalSize === 0)
      return;
    const t2 = e2._pendingPullIntos.peek();
    pe(e2, t2) && (Re(e2), _e(e2._controlledReadableByteStream, t2));
  }
}
__name(ve, "ve");
function we(e2, t2) {
  const r2 = e2._pendingPullIntos.peek();
  Se(e2);
  e2._controlledReadableByteStream._state === "closed" ? function(e3, t3) {
    const r3 = e3._controlledReadableByteStream;
    if (Le(r3))
      for (; Ie(r3) > 0; )
        _e(r3, Re(e3));
  }(e2) : function(e3, t3, r3) {
    if (ye(0, t3, r3), r3.bytesFilled < r3.elementSize)
      return;
    Re(e3);
    const o2 = r3.bytesFilled % r3.elementSize;
    if (o2 > 0) {
      const t4 = r3.byteOffset + r3.bytesFilled, n2 = ae(r3.buffer, t4 - o2, t4);
      me(e3, n2, 0, n2.byteLength);
    }
    r3.bytesFilled -= o2, _e(e3._controlledReadableByteStream, r3), ve(e3);
  }(e2, t2, r2), fe(e2);
}
__name(we, "we");
function Re(e2) {
  return e2._pendingPullIntos.shift();
}
__name(Re, "Re");
function Te(e2) {
  e2._pullAlgorithm = void 0, e2._cancelAlgorithm = void 0;
}
__name(Te, "Te");
function Ce(e2) {
  const t2 = e2._controlledReadableByteStream;
  if (!e2._closeRequested && t2._state === "readable")
    if (e2._queueTotalSize > 0)
      e2._closeRequested = true;
    else {
      if (e2._pendingPullIntos.length > 0) {
        if (e2._pendingPullIntos.peek().bytesFilled > 0) {
          const t3 = new TypeError("Insufficient bytes to fill elements in the given buffer");
          throw Pe(e2, t3), t3;
        }
      }
      Te(e2), dr(t2);
    }
}
__name(Ce, "Ce");
function qe(e2, t2) {
  const r2 = e2._controlledReadableByteStream;
  if (e2._closeRequested || r2._state !== "readable")
    return;
  const o2 = t2.buffer, n2 = t2.byteOffset, a2 = t2.byteLength, i2 = o2;
  if (e2._pendingPullIntos.length > 0) {
    const t3 = e2._pendingPullIntos.peek();
    t3.buffer, 0, t3.buffer = t3.buffer;
  }
  if (Se(e2), U(r2))
    if (V(r2) === 0)
      me(e2, i2, n2, a2);
    else {
      H(r2, new Uint8Array(i2, n2, a2), false);
    }
  else
    Le(r2) ? (me(e2, i2, n2, a2), ve(e2)) : me(e2, i2, n2, a2);
  fe(e2);
}
__name(qe, "qe");
function Pe(e2, t2) {
  const r2 = e2._controlledReadableByteStream;
  r2._state === "readable" && (be(e2), ue(e2), Te(e2), fr(r2, t2));
}
__name(Pe, "Pe");
function Ee(e2) {
  if (e2._byobRequest === null && e2._pendingPullIntos.length > 0) {
    const t2 = e2._pendingPullIntos.peek(), r2 = new Uint8Array(t2.buffer, t2.byteOffset + t2.bytesFilled, t2.byteLength - t2.bytesFilled), o2 = Object.create(ReadableStreamBYOBRequest.prototype);
    !function(e3, t3, r3) {
      e3._associatedReadableByteStreamController = t3, e3._view = r3;
    }(o2, e2, r2), e2._byobRequest = o2;
  }
  return e2._byobRequest;
}
__name(Ee, "Ee");
function We(e2) {
  const t2 = e2._controlledReadableByteStream._state;
  return t2 === "errored" ? null : t2 === "closed" ? 0 : e2._strategyHWM - e2._queueTotalSize;
}
__name(We, "We");
function Oe(e2, t2) {
  const r2 = e2._pendingPullIntos.peek();
  if (e2._controlledReadableByteStream._state === "closed") {
    if (t2 !== 0)
      throw new TypeError("bytesWritten must be 0 when calling respond() on a closed stream");
  } else {
    if (t2 === 0)
      throw new TypeError("bytesWritten must be greater than 0 when calling respond() on a readable stream");
    if (r2.bytesFilled + t2 > r2.byteLength)
      throw new RangeError("bytesWritten out of range");
  }
  r2.buffer = r2.buffer, we(e2, t2);
}
__name(Oe, "Oe");
function ke(e2, t2) {
  const r2 = e2._pendingPullIntos.peek();
  if (e2._controlledReadableByteStream._state === "closed") {
    if (t2.byteLength !== 0)
      throw new TypeError("The view's length must be 0 when calling respondWithNewView() on a closed stream");
  } else if (t2.byteLength === 0)
    throw new TypeError("The view's length must be greater than 0 when calling respondWithNewView() on a readable stream");
  if (r2.byteOffset + r2.bytesFilled !== t2.byteOffset)
    throw new RangeError("The region specified by view does not match byobRequest");
  if (r2.bufferByteLength !== t2.buffer.byteLength)
    throw new RangeError("The buffer of view has different capacity than byobRequest");
  if (r2.bytesFilled + t2.byteLength > r2.byteLength)
    throw new RangeError("The region specified by view is larger than byobRequest");
  r2.buffer = t2.buffer, we(e2, t2.byteLength);
}
__name(ke, "ke");
function Be(e2, t2, r2, o2, n2, a2, i2) {
  t2._controlledReadableByteStream = e2, t2._pullAgain = false, t2._pulling = false, t2._byobRequest = null, t2._queue = t2._queueTotalSize = void 0, ue(t2), t2._closeRequested = false, t2._started = false, t2._strategyHWM = a2, t2._pullAlgorithm = o2, t2._cancelAlgorithm = n2, t2._autoAllocateChunkSize = i2, t2._pendingPullIntos = new S(), e2._readableStreamController = t2;
  f(u(r2()), () => {
    t2._started = true, fe(t2);
  }, (e3) => {
    Pe(t2, e3);
  });
}
__name(Be, "Be");
function je(e2) {
  return new TypeError(`ReadableStreamBYOBRequest.prototype.${e2} can only be used on a ReadableStreamBYOBRequest`);
}
__name(je, "je");
function Ae(e2) {
  return new TypeError(`ReadableByteStreamController.prototype.${e2} can only be used on a ReadableByteStreamController`);
}
__name(Ae, "Ae");
function ze(e2) {
  return new ReadableStreamBYOBReader(e2);
}
__name(ze, "ze");
function Fe(e2, t2) {
  e2._reader._readIntoRequests.push(t2);
}
__name(Fe, "Fe");
function Ie(e2) {
  return e2._reader._readIntoRequests.length;
}
__name(Ie, "Ie");
function Le(e2) {
  const t2 = e2._reader;
  return t2 !== void 0 && !!$e(t2);
}
__name(Le, "Le");
Object.defineProperties(ReadableByteStreamController.prototype, { close: { enumerable: true }, enqueue: { enumerable: true }, error: { enumerable: true }, byobRequest: { enumerable: true }, desiredSize: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(ReadableByteStreamController.prototype, e.toStringTag, { value: "ReadableByteStreamController", configurable: true });
var ReadableStreamBYOBReader = class {
  constructor(e2) {
    if (L(e2, 1, "ReadableStreamBYOBReader"), Y(e2, "First parameter"), ur(e2))
      throw new TypeError("This stream has already been locked for exclusive reading by another reader");
    if (!ce(e2._readableStreamController))
      throw new TypeError("Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte source");
    v(this, e2), this._readIntoRequests = new S();
  }
  get closed() {
    return $e(this) ? this._closedPromise : c(Me("closed"));
  }
  cancel(e2) {
    return $e(this) ? this._ownerReadableStream === void 0 ? c(T("cancel")) : w(this, e2) : c(Me("cancel"));
  }
  read(e2) {
    if (!$e(this))
      return c(Me("read"));
    if (!ArrayBuffer.isView(e2))
      return c(new TypeError("view must be an array buffer view"));
    if (e2.byteLength === 0)
      return c(new TypeError("view must have non-zero byteLength"));
    if (e2.buffer.byteLength === 0)
      return c(new TypeError("view's buffer must have non-zero byteLength"));
    if (e2.buffer, this._ownerReadableStream === void 0)
      return c(T("read from"));
    let t2, r2;
    const o2 = s((e3, o3) => {
      t2 = e3, r2 = o3;
    });
    return De(this, e2, { _chunkSteps: (e3) => t2({ value: e3, done: false }), _closeSteps: (e3) => t2({ value: e3, done: true }), _errorSteps: (e3) => r2(e3) }), o2;
  }
  releaseLock() {
    if (!$e(this))
      throw Me("releaseLock");
    if (this._ownerReadableStream !== void 0) {
      if (this._readIntoRequests.length > 0)
        throw new TypeError("Tried to release a reader lock when that reader has pending read() calls un-settled");
      R(this);
    }
  }
};
__name(ReadableStreamBYOBReader, "ReadableStreamBYOBReader");
function $e(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_readIntoRequests") && e2 instanceof ReadableStreamBYOBReader);
}
__name($e, "$e");
function De(e2, t2, r2) {
  const o2 = e2._ownerReadableStream;
  o2._disturbed = true, o2._state === "errored" ? r2._errorSteps(o2._storedError) : function(e3, t3, r3) {
    const o3 = e3._controlledReadableByteStream;
    let n2 = 1;
    t3.constructor !== DataView && (n2 = t3.constructor.BYTES_PER_ELEMENT);
    const a2 = t3.constructor, i2 = t3.buffer, l2 = { buffer: i2, bufferByteLength: i2.byteLength, byteOffset: t3.byteOffset, byteLength: t3.byteLength, bytesFilled: 0, elementSize: n2, viewConstructor: a2, readerType: "byob" };
    if (e3._pendingPullIntos.length > 0)
      return e3._pendingPullIntos.push(l2), void Fe(o3, r3);
    if (o3._state !== "closed") {
      if (e3._queueTotalSize > 0) {
        if (pe(e3, l2)) {
          const t4 = he(l2);
          return ge(e3), void r3._chunkSteps(t4);
        }
        if (e3._closeRequested) {
          const t4 = new TypeError("Insufficient bytes to fill elements in the given buffer");
          return Pe(e3, t4), void r3._errorSteps(t4);
        }
      }
      e3._pendingPullIntos.push(l2), Fe(o3, r3), fe(e3);
    } else {
      const e4 = new a2(l2.buffer, l2.byteOffset, 0);
      r3._closeSteps(e4);
    }
  }(o2._readableStreamController, t2, r2);
}
__name(De, "De");
function Me(e2) {
  return new TypeError(`ReadableStreamBYOBReader.prototype.${e2} can only be used on a ReadableStreamBYOBReader`);
}
__name(Me, "Me");
function Qe(e2, t2) {
  const { highWaterMark: r2 } = e2;
  if (r2 === void 0)
    return t2;
  if (re(r2) || r2 < 0)
    throw new RangeError("Invalid highWaterMark");
  return r2;
}
__name(Qe, "Qe");
function Ye(e2) {
  const { size: t2 } = e2;
  return t2 || (() => 1);
}
__name(Ye, "Ye");
function xe(e2, t2) {
  z(e2, t2);
  const r2 = e2 == null ? void 0 : e2.highWaterMark, o2 = e2 == null ? void 0 : e2.size;
  return { highWaterMark: r2 === void 0 ? void 0 : D(r2), size: o2 === void 0 ? void 0 : Ne(o2, `${t2} has member 'size' that`) };
}
__name(xe, "xe");
function Ne(e2, t2) {
  return F(e2, t2), (t3) => D(e2(t3));
}
__name(Ne, "Ne");
function He(e2, t2, r2) {
  return F(e2, r2), (r3) => g(e2, t2, [r3]);
}
__name(He, "He");
function Ve(e2, t2, r2) {
  return F(e2, r2), () => g(e2, t2, []);
}
__name(Ve, "Ve");
function Ue(e2, t2, r2) {
  return F(e2, r2), (r3) => y(e2, t2, [r3]);
}
__name(Ue, "Ue");
function Ge(e2, t2, r2) {
  return F(e2, r2), (r3, o2) => g(e2, t2, [r3, o2]);
}
__name(Ge, "Ge");
function Xe(e2, t2) {
  if (!et(e2))
    throw new TypeError(`${t2} is not a WritableStream.`);
}
__name(Xe, "Xe");
Object.defineProperties(ReadableStreamBYOBReader.prototype, { cancel: { enumerable: true }, read: { enumerable: true }, releaseLock: { enumerable: true }, closed: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(ReadableStreamBYOBReader.prototype, e.toStringTag, { value: "ReadableStreamBYOBReader", configurable: true });
var Je = typeof AbortController == "function";
var WritableStream = class {
  constructor(e2 = {}, t2 = {}) {
    e2 === void 0 ? e2 = null : I(e2, "First parameter");
    const r2 = xe(t2, "Second parameter"), o2 = function(e3, t3) {
      z(e3, t3);
      const r3 = e3 == null ? void 0 : e3.abort, o3 = e3 == null ? void 0 : e3.close, n3 = e3 == null ? void 0 : e3.start, a2 = e3 == null ? void 0 : e3.type, i2 = e3 == null ? void 0 : e3.write;
      return { abort: r3 === void 0 ? void 0 : He(r3, e3, `${t3} has member 'abort' that`), close: o3 === void 0 ? void 0 : Ve(o3, e3, `${t3} has member 'close' that`), start: n3 === void 0 ? void 0 : Ue(n3, e3, `${t3} has member 'start' that`), write: i2 === void 0 ? void 0 : Ge(i2, e3, `${t3} has member 'write' that`), type: a2 };
    }(e2, "First parameter");
    Ze(this);
    if (o2.type !== void 0)
      throw new RangeError("Invalid type is specified");
    const n2 = Ye(r2);
    !function(e3, t3, r3, o3) {
      const n3 = Object.create(WritableStreamDefaultController.prototype);
      let a2 = /* @__PURE__ */ __name(() => {
      }, "a"), i2 = /* @__PURE__ */ __name(() => u(void 0), "i"), l2 = /* @__PURE__ */ __name(() => u(void 0), "l"), s2 = /* @__PURE__ */ __name(() => u(void 0), "s");
      t3.start !== void 0 && (a2 = /* @__PURE__ */ __name(() => t3.start(n3), "a"));
      t3.write !== void 0 && (i2 = /* @__PURE__ */ __name((e4) => t3.write(e4, n3), "i"));
      t3.close !== void 0 && (l2 = /* @__PURE__ */ __name(() => t3.close(), "l"));
      t3.abort !== void 0 && (s2 = /* @__PURE__ */ __name((e4) => t3.abort(e4), "s"));
      yt(e3, n3, a2, i2, l2, s2, r3, o3);
    }(this, o2, Qe(r2, 1), n2);
  }
  get locked() {
    if (!et(this))
      throw Ct("locked");
    return tt(this);
  }
  abort(e2) {
    return et(this) ? tt(this) ? c(new TypeError("Cannot abort a stream that already has a writer")) : rt(this, e2) : c(Ct("abort"));
  }
  close() {
    return et(this) ? tt(this) ? c(new TypeError("Cannot close a stream that already has a writer")) : lt(this) ? c(new TypeError("Cannot close an already-closing stream")) : ot(this) : c(Ct("close"));
  }
  getWriter() {
    if (!et(this))
      throw Ct("getWriter");
    return Ke(this);
  }
};
__name(WritableStream, "WritableStream");
function Ke(e2) {
  return new WritableStreamDefaultWriter(e2);
}
__name(Ke, "Ke");
function Ze(e2) {
  e2._state = "writable", e2._storedError = void 0, e2._writer = void 0, e2._writableStreamController = void 0, e2._writeRequests = new S(), e2._inFlightWriteRequest = void 0, e2._closeRequest = void 0, e2._inFlightCloseRequest = void 0, e2._pendingAbortRequest = void 0, e2._backpressure = false;
}
__name(Ze, "Ze");
function et(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_writableStreamController") && e2 instanceof WritableStream);
}
__name(et, "et");
function tt(e2) {
  return e2._writer !== void 0;
}
__name(tt, "tt");
function rt(e2, t2) {
  var r2;
  if (e2._state === "closed" || e2._state === "errored")
    return u(void 0);
  e2._writableStreamController._abortReason = t2, (r2 = e2._writableStreamController._abortController) === null || r2 === void 0 || r2.abort();
  const o2 = e2._state;
  if (o2 === "closed" || o2 === "errored")
    return u(void 0);
  if (e2._pendingAbortRequest !== void 0)
    return e2._pendingAbortRequest._promise;
  let n2 = false;
  o2 === "erroring" && (n2 = true, t2 = void 0);
  const a2 = s((r3, o3) => {
    e2._pendingAbortRequest = { _promise: void 0, _resolve: r3, _reject: o3, _reason: t2, _wasAlreadyErroring: n2 };
  });
  return e2._pendingAbortRequest._promise = a2, n2 || at(e2, t2), a2;
}
__name(rt, "rt");
function ot(e2) {
  const t2 = e2._state;
  if (t2 === "closed" || t2 === "errored")
    return c(new TypeError(`The stream (in ${t2} state) is not in the writable state and cannot be closed`));
  const r2 = s((t3, r3) => {
    const o3 = { _resolve: t3, _reject: r3 };
    e2._closeRequest = o3;
  }), o2 = e2._writer;
  var n2;
  return o2 !== void 0 && e2._backpressure && t2 === "writable" && It(o2), se(n2 = e2._writableStreamController, mt, 0), vt(n2), r2;
}
__name(ot, "ot");
function nt(e2, t2) {
  e2._state !== "writable" ? it(e2) : at(e2, t2);
}
__name(nt, "nt");
function at(e2, t2) {
  const r2 = e2._writableStreamController;
  e2._state = "erroring", e2._storedError = t2;
  const o2 = e2._writer;
  o2 !== void 0 && bt(o2, t2), !function(e3) {
    if (e3._inFlightWriteRequest === void 0 && e3._inFlightCloseRequest === void 0)
      return false;
    return true;
  }(e2) && r2._started && it(e2);
}
__name(at, "at");
function it(e2) {
  e2._state = "errored", e2._writableStreamController[O]();
  const t2 = e2._storedError;
  if (e2._writeRequests.forEach((e3) => {
    e3._reject(t2);
  }), e2._writeRequests = new S(), e2._pendingAbortRequest === void 0)
    return void st(e2);
  const r2 = e2._pendingAbortRequest;
  if (e2._pendingAbortRequest = void 0, r2._wasAlreadyErroring)
    return r2._reject(t2), void st(e2);
  f(e2._writableStreamController[W](r2._reason), () => {
    r2._resolve(), st(e2);
  }, (t3) => {
    r2._reject(t3), st(e2);
  });
}
__name(it, "it");
function lt(e2) {
  return e2._closeRequest !== void 0 || e2._inFlightCloseRequest !== void 0;
}
__name(lt, "lt");
function st(e2) {
  e2._closeRequest !== void 0 && (e2._closeRequest._reject(e2._storedError), e2._closeRequest = void 0);
  const t2 = e2._writer;
  t2 !== void 0 && kt(t2, e2._storedError);
}
__name(st, "st");
function ut(e2, t2) {
  const r2 = e2._writer;
  r2 !== void 0 && t2 !== e2._backpressure && (t2 ? function(e3) {
    jt(e3);
  }(r2) : It(r2)), e2._backpressure = t2;
}
__name(ut, "ut");
Object.defineProperties(WritableStream.prototype, { abort: { enumerable: true }, close: { enumerable: true }, getWriter: { enumerable: true }, locked: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(WritableStream.prototype, e.toStringTag, { value: "WritableStream", configurable: true });
var WritableStreamDefaultWriter = class {
  constructor(e2) {
    if (L(e2, 1, "WritableStreamDefaultWriter"), Xe(e2, "First parameter"), tt(e2))
      throw new TypeError("This stream has already been locked for exclusive writing by another writer");
    this._ownerWritableStream = e2, e2._writer = this;
    const t2 = e2._state;
    if (t2 === "writable")
      !lt(e2) && e2._backpressure ? jt(this) : zt(this), Wt(this);
    else if (t2 === "erroring")
      At(this, e2._storedError), Wt(this);
    else if (t2 === "closed")
      zt(this), Wt(r2 = this), Bt(r2);
    else {
      const t3 = e2._storedError;
      At(this, t3), Ot(this, t3);
    }
    var r2;
  }
  get closed() {
    return ct(this) ? this._closedPromise : c(Pt("closed"));
  }
  get desiredSize() {
    if (!ct(this))
      throw Pt("desiredSize");
    if (this._ownerWritableStream === void 0)
      throw Et("desiredSize");
    return function(e2) {
      const t2 = e2._ownerWritableStream, r2 = t2._state;
      if (r2 === "errored" || r2 === "erroring")
        return null;
      if (r2 === "closed")
        return 0;
      return St(t2._writableStreamController);
    }(this);
  }
  get ready() {
    return ct(this) ? this._readyPromise : c(Pt("ready"));
  }
  abort(e2) {
    return ct(this) ? this._ownerWritableStream === void 0 ? c(Et("abort")) : function(e3, t2) {
      return rt(e3._ownerWritableStream, t2);
    }(this, e2) : c(Pt("abort"));
  }
  close() {
    if (!ct(this))
      return c(Pt("close"));
    const e2 = this._ownerWritableStream;
    return e2 === void 0 ? c(Et("close")) : lt(e2) ? c(new TypeError("Cannot close an already-closing stream")) : dt(this);
  }
  releaseLock() {
    if (!ct(this))
      throw Pt("releaseLock");
    this._ownerWritableStream !== void 0 && _t(this);
  }
  write(e2) {
    return ct(this) ? this._ownerWritableStream === void 0 ? c(Et("write to")) : ht(this, e2) : c(Pt("write"));
  }
};
__name(WritableStreamDefaultWriter, "WritableStreamDefaultWriter");
function ct(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_ownerWritableStream") && e2 instanceof WritableStreamDefaultWriter);
}
__name(ct, "ct");
function dt(e2) {
  return ot(e2._ownerWritableStream);
}
__name(dt, "dt");
function ft(e2, t2) {
  e2._closedPromiseState === "pending" ? kt(e2, t2) : function(e3, t3) {
    Ot(e3, t3);
  }(e2, t2);
}
__name(ft, "ft");
function bt(e2, t2) {
  e2._readyPromiseState === "pending" ? Ft(e2, t2) : function(e3, t3) {
    At(e3, t3);
  }(e2, t2);
}
__name(bt, "bt");
function _t(e2) {
  const t2 = e2._ownerWritableStream, r2 = new TypeError("Writer was released and can no longer be used to monitor the stream's closedness");
  bt(e2, r2), ft(e2, r2), t2._writer = void 0, e2._ownerWritableStream = void 0;
}
__name(_t, "_t");
function ht(e2, t2) {
  const r2 = e2._ownerWritableStream, o2 = r2._writableStreamController, n2 = function(e3, t3) {
    try {
      return e3._strategySizeAlgorithm(t3);
    } catch (t4) {
      return wt(e3, t4), 1;
    }
  }(o2, t2);
  if (r2 !== e2._ownerWritableStream)
    return c(Et("write to"));
  const a2 = r2._state;
  if (a2 === "errored")
    return c(r2._storedError);
  if (lt(r2) || a2 === "closed")
    return c(new TypeError("The stream is closing or closed and cannot be written to"));
  if (a2 === "erroring")
    return c(r2._storedError);
  const i2 = function(e3) {
    return s((t3, r3) => {
      const o3 = { _resolve: t3, _reject: r3 };
      e3._writeRequests.push(o3);
    });
  }(r2);
  return function(e3, t3, r3) {
    try {
      se(e3, t3, r3);
    } catch (t4) {
      return void wt(e3, t4);
    }
    const o3 = e3._controlledWritableStream;
    if (!lt(o3) && o3._state === "writable") {
      ut(o3, Rt(e3));
    }
    vt(e3);
  }(o2, t2, n2), i2;
}
__name(ht, "ht");
Object.defineProperties(WritableStreamDefaultWriter.prototype, { abort: { enumerable: true }, close: { enumerable: true }, releaseLock: { enumerable: true }, write: { enumerable: true }, closed: { enumerable: true }, desiredSize: { enumerable: true }, ready: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(WritableStreamDefaultWriter.prototype, e.toStringTag, { value: "WritableStreamDefaultWriter", configurable: true });
var mt = {};
var WritableStreamDefaultController = class {
  constructor() {
    throw new TypeError("Illegal constructor");
  }
  get abortReason() {
    if (!pt(this))
      throw qt("abortReason");
    return this._abortReason;
  }
  get signal() {
    if (!pt(this))
      throw qt("signal");
    if (this._abortController === void 0)
      throw new TypeError("WritableStreamDefaultController.prototype.signal is not supported");
    return this._abortController.signal;
  }
  error(e2) {
    if (!pt(this))
      throw qt("error");
    this._controlledWritableStream._state === "writable" && Tt(this, e2);
  }
  [W](e2) {
    const t2 = this._abortAlgorithm(e2);
    return gt(this), t2;
  }
  [O]() {
    ue(this);
  }
};
__name(WritableStreamDefaultController, "WritableStreamDefaultController");
function pt(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledWritableStream") && e2 instanceof WritableStreamDefaultController);
}
__name(pt, "pt");
function yt(e2, t2, r2, o2, n2, a2, i2, l2) {
  t2._controlledWritableStream = e2, e2._writableStreamController = t2, t2._queue = void 0, t2._queueTotalSize = void 0, ue(t2), t2._abortReason = void 0, t2._abortController = function() {
    if (Je)
      return new AbortController();
  }(), t2._started = false, t2._strategySizeAlgorithm = l2, t2._strategyHWM = i2, t2._writeAlgorithm = o2, t2._closeAlgorithm = n2, t2._abortAlgorithm = a2;
  const s2 = Rt(t2);
  ut(e2, s2);
  f(u(r2()), () => {
    t2._started = true, vt(t2);
  }, (r3) => {
    t2._started = true, nt(e2, r3);
  });
}
__name(yt, "yt");
function gt(e2) {
  e2._writeAlgorithm = void 0, e2._closeAlgorithm = void 0, e2._abortAlgorithm = void 0, e2._strategySizeAlgorithm = void 0;
}
__name(gt, "gt");
function St(e2) {
  return e2._strategyHWM - e2._queueTotalSize;
}
__name(St, "St");
function vt(e2) {
  const t2 = e2._controlledWritableStream;
  if (!e2._started)
    return;
  if (t2._inFlightWriteRequest !== void 0)
    return;
  if (t2._state === "erroring")
    return void it(t2);
  if (e2._queue.length === 0)
    return;
  const r2 = e2._queue.peek().value;
  r2 === mt ? function(e3) {
    const t3 = e3._controlledWritableStream;
    (function(e4) {
      e4._inFlightCloseRequest = e4._closeRequest, e4._closeRequest = void 0;
    })(t3), le(e3);
    const r3 = e3._closeAlgorithm();
    gt(e3), f(r3, () => {
      !function(e4) {
        e4._inFlightCloseRequest._resolve(void 0), e4._inFlightCloseRequest = void 0, e4._state === "erroring" && (e4._storedError = void 0, e4._pendingAbortRequest !== void 0 && (e4._pendingAbortRequest._resolve(), e4._pendingAbortRequest = void 0)), e4._state = "closed";
        const t4 = e4._writer;
        t4 !== void 0 && Bt(t4);
      }(t3);
    }, (e4) => {
      !function(e5, t4) {
        e5._inFlightCloseRequest._reject(t4), e5._inFlightCloseRequest = void 0, e5._pendingAbortRequest !== void 0 && (e5._pendingAbortRequest._reject(t4), e5._pendingAbortRequest = void 0), nt(e5, t4);
      }(t3, e4);
    });
  }(e2) : function(e3, t3) {
    const r3 = e3._controlledWritableStream;
    !function(e4) {
      e4._inFlightWriteRequest = e4._writeRequests.shift();
    }(r3);
    f(e3._writeAlgorithm(t3), () => {
      !function(e4) {
        e4._inFlightWriteRequest._resolve(void 0), e4._inFlightWriteRequest = void 0;
      }(r3);
      const t4 = r3._state;
      if (le(e3), !lt(r3) && t4 === "writable") {
        const t5 = Rt(e3);
        ut(r3, t5);
      }
      vt(e3);
    }, (t4) => {
      r3._state === "writable" && gt(e3), function(e4, t5) {
        e4._inFlightWriteRequest._reject(t5), e4._inFlightWriteRequest = void 0, nt(e4, t5);
      }(r3, t4);
    });
  }(e2, r2);
}
__name(vt, "vt");
function wt(e2, t2) {
  e2._controlledWritableStream._state === "writable" && Tt(e2, t2);
}
__name(wt, "wt");
function Rt(e2) {
  return St(e2) <= 0;
}
__name(Rt, "Rt");
function Tt(e2, t2) {
  const r2 = e2._controlledWritableStream;
  gt(e2), at(r2, t2);
}
__name(Tt, "Tt");
function Ct(e2) {
  return new TypeError(`WritableStream.prototype.${e2} can only be used on a WritableStream`);
}
__name(Ct, "Ct");
function qt(e2) {
  return new TypeError(`WritableStreamDefaultController.prototype.${e2} can only be used on a WritableStreamDefaultController`);
}
__name(qt, "qt");
function Pt(e2) {
  return new TypeError(`WritableStreamDefaultWriter.prototype.${e2} can only be used on a WritableStreamDefaultWriter`);
}
__name(Pt, "Pt");
function Et(e2) {
  return new TypeError("Cannot " + e2 + " a stream using a released writer");
}
__name(Et, "Et");
function Wt(e2) {
  e2._closedPromise = s((t2, r2) => {
    e2._closedPromise_resolve = t2, e2._closedPromise_reject = r2, e2._closedPromiseState = "pending";
  });
}
__name(Wt, "Wt");
function Ot(e2, t2) {
  Wt(e2), kt(e2, t2);
}
__name(Ot, "Ot");
function kt(e2, t2) {
  e2._closedPromise_reject !== void 0 && (m(e2._closedPromise), e2._closedPromise_reject(t2), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0, e2._closedPromiseState = "rejected");
}
__name(kt, "kt");
function Bt(e2) {
  e2._closedPromise_resolve !== void 0 && (e2._closedPromise_resolve(void 0), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0, e2._closedPromiseState = "resolved");
}
__name(Bt, "Bt");
function jt(e2) {
  e2._readyPromise = s((t2, r2) => {
    e2._readyPromise_resolve = t2, e2._readyPromise_reject = r2;
  }), e2._readyPromiseState = "pending";
}
__name(jt, "jt");
function At(e2, t2) {
  jt(e2), Ft(e2, t2);
}
__name(At, "At");
function zt(e2) {
  jt(e2), It(e2);
}
__name(zt, "zt");
function Ft(e2, t2) {
  e2._readyPromise_reject !== void 0 && (m(e2._readyPromise), e2._readyPromise_reject(t2), e2._readyPromise_resolve = void 0, e2._readyPromise_reject = void 0, e2._readyPromiseState = "rejected");
}
__name(Ft, "Ft");
function It(e2) {
  e2._readyPromise_resolve !== void 0 && (e2._readyPromise_resolve(void 0), e2._readyPromise_resolve = void 0, e2._readyPromise_reject = void 0, e2._readyPromiseState = "fulfilled");
}
__name(It, "It");
Object.defineProperties(WritableStreamDefaultController.prototype, { error: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(WritableStreamDefaultController.prototype, e.toStringTag, { value: "WritableStreamDefaultController", configurable: true });
var Lt = typeof DOMException != "undefined" ? DOMException : void 0;
var $t = function(e2) {
  if (typeof e2 != "function" && typeof e2 != "object")
    return false;
  try {
    return new e2(), true;
  } catch (e3) {
    return false;
  }
}(Lt) ? Lt : function() {
  const e2 = /* @__PURE__ */ __name(function(e3, t2) {
    this.message = e3 || "", this.name = t2 || "Error", Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
  }, "e");
  return e2.prototype = Object.create(Error.prototype), Object.defineProperty(e2.prototype, "constructor", { value: e2, writable: true, configurable: true }), e2;
}();
function Dt(e2, r2, o2, n2, a2, i2) {
  const l2 = x(e2), h2 = Ke(r2);
  e2._disturbed = true;
  let p2 = false, y2 = u(void 0);
  return s((g2, S2) => {
    let v2;
    if (i2 !== void 0) {
      if (v2 = /* @__PURE__ */ __name(() => {
        const t2 = new $t("Aborted", "AbortError"), o3 = [];
        n2 || o3.push(() => r2._state === "writable" ? rt(r2, t2) : u(void 0)), a2 || o3.push(() => e2._state === "readable" ? cr(e2, t2) : u(void 0)), E2(() => Promise.all(o3.map((e3) => e3())), true, t2);
      }, "v"), i2.aborted)
        return void v2();
      i2.addEventListener("abort", v2);
    }
    var w2, T2, C2;
    if (P2(e2, l2._closedPromise, (e3) => {
      n2 ? W2(true, e3) : E2(() => rt(r2, e3), true, e3);
    }), P2(r2, h2._closedPromise, (t2) => {
      a2 ? W2(true, t2) : E2(() => cr(e2, t2), true, t2);
    }), w2 = e2, T2 = l2._closedPromise, C2 = /* @__PURE__ */ __name(() => {
      o2 ? W2() : E2(() => function(e3) {
        const t2 = e3._ownerWritableStream, r3 = t2._state;
        return lt(t2) || r3 === "closed" ? u(void 0) : r3 === "errored" ? c(t2._storedError) : dt(e3);
      }(h2));
    }, "C"), w2._state === "closed" ? C2() : b(T2, C2), lt(r2) || r2._state === "closed") {
      const t2 = new TypeError("the destination writable stream closed before all data could be piped to it");
      a2 ? W2(true, t2) : E2(() => cr(e2, t2), true, t2);
    }
    function q2() {
      const e3 = y2;
      return d(y2, () => e3 !== y2 ? q2() : void 0);
    }
    __name(q2, "q");
    function P2(e3, t2, r3) {
      e3._state === "errored" ? r3(e3._storedError) : _(t2, r3);
    }
    __name(P2, "P");
    function E2(e3, t2, o3) {
      function n3() {
        f(e3(), () => O2(t2, o3), (e4) => O2(true, e4));
      }
      __name(n3, "n");
      p2 || (p2 = true, r2._state !== "writable" || lt(r2) ? n3() : b(q2(), n3));
    }
    __name(E2, "E");
    function W2(e3, t2) {
      p2 || (p2 = true, r2._state !== "writable" || lt(r2) ? O2(e3, t2) : b(q2(), () => O2(e3, t2)));
    }
    __name(W2, "W");
    function O2(e3, t2) {
      _t(h2), R(l2), i2 !== void 0 && i2.removeEventListener("abort", v2), e3 ? S2(t2) : g2(void 0);
    }
    __name(O2, "O");
    m(s((e3, r3) => {
      !(/* @__PURE__ */ __name(function o3(n3) {
        n3 ? e3() : d(p2 ? u(true) : d(h2._readyPromise, () => s((e4, r4) => {
          X(l2, { _chunkSteps: (r5) => {
            y2 = d(ht(h2, r5), void 0, t), e4(false);
          }, _closeSteps: () => e4(true), _errorSteps: r4 });
        })), o3, r3);
      }, "o"))(false);
    }));
  });
}
__name(Dt, "Dt");
var ReadableStreamDefaultController = class {
  constructor() {
    throw new TypeError("Illegal constructor");
  }
  get desiredSize() {
    if (!Mt(this))
      throw Jt("desiredSize");
    return Ut(this);
  }
  close() {
    if (!Mt(this))
      throw Jt("close");
    if (!Gt(this))
      throw new TypeError("The stream is not in a state that permits close");
    Nt(this);
  }
  enqueue(e2) {
    if (!Mt(this))
      throw Jt("enqueue");
    if (!Gt(this))
      throw new TypeError("The stream is not in a state that permits enqueue");
    return Ht(this, e2);
  }
  error(e2) {
    if (!Mt(this))
      throw Jt("error");
    Vt(this, e2);
  }
  [k](e2) {
    ue(this);
    const t2 = this._cancelAlgorithm(e2);
    return xt(this), t2;
  }
  [B](e2) {
    const t2 = this._controlledReadableStream;
    if (this._queue.length > 0) {
      const r2 = le(this);
      this._closeRequested && this._queue.length === 0 ? (xt(this), dr(t2)) : Qt(this), e2._chunkSteps(r2);
    } else
      N(t2, e2), Qt(this);
  }
};
__name(ReadableStreamDefaultController, "ReadableStreamDefaultController");
function Mt(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledReadableStream") && e2 instanceof ReadableStreamDefaultController);
}
__name(Mt, "Mt");
function Qt(e2) {
  if (!Yt(e2))
    return;
  if (e2._pulling)
    return void (e2._pullAgain = true);
  e2._pulling = true;
  f(e2._pullAlgorithm(), () => {
    e2._pulling = false, e2._pullAgain && (e2._pullAgain = false, Qt(e2));
  }, (t2) => {
    Vt(e2, t2);
  });
}
__name(Qt, "Qt");
function Yt(e2) {
  const t2 = e2._controlledReadableStream;
  if (!Gt(e2))
    return false;
  if (!e2._started)
    return false;
  if (ur(t2) && V(t2) > 0)
    return true;
  return Ut(e2) > 0;
}
__name(Yt, "Yt");
function xt(e2) {
  e2._pullAlgorithm = void 0, e2._cancelAlgorithm = void 0, e2._strategySizeAlgorithm = void 0;
}
__name(xt, "xt");
function Nt(e2) {
  if (!Gt(e2))
    return;
  const t2 = e2._controlledReadableStream;
  e2._closeRequested = true, e2._queue.length === 0 && (xt(e2), dr(t2));
}
__name(Nt, "Nt");
function Ht(e2, t2) {
  if (!Gt(e2))
    return;
  const r2 = e2._controlledReadableStream;
  if (ur(r2) && V(r2) > 0)
    H(r2, t2, false);
  else {
    let r3;
    try {
      r3 = e2._strategySizeAlgorithm(t2);
    } catch (t3) {
      throw Vt(e2, t3), t3;
    }
    try {
      se(e2, t2, r3);
    } catch (t3) {
      throw Vt(e2, t3), t3;
    }
  }
  Qt(e2);
}
__name(Ht, "Ht");
function Vt(e2, t2) {
  const r2 = e2._controlledReadableStream;
  r2._state === "readable" && (ue(e2), xt(e2), fr(r2, t2));
}
__name(Vt, "Vt");
function Ut(e2) {
  const t2 = e2._controlledReadableStream._state;
  return t2 === "errored" ? null : t2 === "closed" ? 0 : e2._strategyHWM - e2._queueTotalSize;
}
__name(Ut, "Ut");
function Gt(e2) {
  const t2 = e2._controlledReadableStream._state;
  return !e2._closeRequested && t2 === "readable";
}
__name(Gt, "Gt");
function Xt(e2, t2, r2, o2, n2, a2, i2) {
  t2._controlledReadableStream = e2, t2._queue = void 0, t2._queueTotalSize = void 0, ue(t2), t2._started = false, t2._closeRequested = false, t2._pullAgain = false, t2._pulling = false, t2._strategySizeAlgorithm = i2, t2._strategyHWM = a2, t2._pullAlgorithm = o2, t2._cancelAlgorithm = n2, e2._readableStreamController = t2;
  f(u(r2()), () => {
    t2._started = true, Qt(t2);
  }, (e3) => {
    Vt(t2, e3);
  });
}
__name(Xt, "Xt");
function Jt(e2) {
  return new TypeError(`ReadableStreamDefaultController.prototype.${e2} can only be used on a ReadableStreamDefaultController`);
}
__name(Jt, "Jt");
function Kt(e2, t2) {
  return ce(e2._readableStreamController) ? function(e3) {
    let t3, r2, o2, n2, a2, i2 = x(e3), l2 = false, c2 = false, d2 = false;
    const f2 = s((e4) => {
      a2 = e4;
    });
    function b2(e4) {
      _(e4._closedPromise, (t4) => {
        e4 === i2 && (Pe(o2._readableStreamController, t4), Pe(n2._readableStreamController, t4), c2 && d2 || a2(void 0));
      });
    }
    __name(b2, "b");
    function h2() {
      $e(i2) && (R(i2), i2 = x(e3), b2(i2));
      X(i2, { _chunkSteps: (t4) => {
        p(() => {
          l2 = false;
          const r3 = t4;
          let i3 = t4;
          if (!c2 && !d2)
            try {
              i3 = ie(t4);
            } catch (t5) {
              return Pe(o2._readableStreamController, t5), Pe(n2._readableStreamController, t5), void a2(cr(e3, t5));
            }
          c2 || qe(o2._readableStreamController, r3), d2 || qe(n2._readableStreamController, i3);
        });
      }, _closeSteps: () => {
        l2 = false, c2 || Ce(o2._readableStreamController), d2 || Ce(n2._readableStreamController), o2._readableStreamController._pendingPullIntos.length > 0 && Oe(o2._readableStreamController, 0), n2._readableStreamController._pendingPullIntos.length > 0 && Oe(n2._readableStreamController, 0), c2 && d2 || a2(void 0);
      }, _errorSteps: () => {
        l2 = false;
      } });
    }
    __name(h2, "h");
    function m2(t4, r3) {
      G(i2) && (R(i2), i2 = ze(e3), b2(i2));
      const s2 = r3 ? n2 : o2, u2 = r3 ? o2 : n2;
      De(i2, t4, { _chunkSteps: (t5) => {
        p(() => {
          l2 = false;
          const o3 = r3 ? d2 : c2;
          if (r3 ? c2 : d2)
            o3 || ke(s2._readableStreamController, t5);
          else {
            let r4;
            try {
              r4 = ie(t5);
            } catch (t6) {
              return Pe(s2._readableStreamController, t6), Pe(u2._readableStreamController, t6), void a2(cr(e3, t6));
            }
            o3 || ke(s2._readableStreamController, t5), qe(u2._readableStreamController, r4);
          }
        });
      }, _closeSteps: (e4) => {
        l2 = false;
        const t5 = r3 ? d2 : c2, o3 = r3 ? c2 : d2;
        t5 || Ce(s2._readableStreamController), o3 || Ce(u2._readableStreamController), e4 !== void 0 && (t5 || ke(s2._readableStreamController, e4), !o3 && u2._readableStreamController._pendingPullIntos.length > 0 && Oe(u2._readableStreamController, 0)), t5 && o3 || a2(void 0);
      }, _errorSteps: () => {
        l2 = false;
      } });
    }
    __name(m2, "m");
    function y2() {
      if (l2)
        return u(void 0);
      l2 = true;
      const e4 = Ee(o2._readableStreamController);
      return e4 === null ? h2() : m2(e4._view, false), u(void 0);
    }
    __name(y2, "y");
    function g2() {
      if (l2)
        return u(void 0);
      l2 = true;
      const e4 = Ee(n2._readableStreamController);
      return e4 === null ? h2() : m2(e4._view, true), u(void 0);
    }
    __name(g2, "g");
    function S2(o3) {
      if (c2 = true, t3 = o3, d2) {
        const o4 = oe([t3, r2]), n3 = cr(e3, o4);
        a2(n3);
      }
      return f2;
    }
    __name(S2, "S");
    function v2(o3) {
      if (d2 = true, r2 = o3, c2) {
        const o4 = oe([t3, r2]), n3 = cr(e3, o4);
        a2(n3);
      }
      return f2;
    }
    __name(v2, "v");
    function w2() {
    }
    __name(w2, "w");
    return o2 = ir(w2, y2, S2), n2 = ir(w2, g2, v2), b2(i2), [o2, n2];
  }(e2) : function(e3, t3) {
    const r2 = x(e3);
    let o2, n2, a2, i2, l2, c2 = false, d2 = false, f2 = false;
    const b2 = s((e4) => {
      l2 = e4;
    });
    function h2() {
      if (c2)
        return u(void 0);
      c2 = true;
      return X(r2, { _chunkSteps: (e4) => {
        p(() => {
          c2 = false;
          const t4 = e4, r3 = e4;
          d2 || Ht(a2._readableStreamController, t4), f2 || Ht(i2._readableStreamController, r3);
        });
      }, _closeSteps: () => {
        c2 = false, d2 || Nt(a2._readableStreamController), f2 || Nt(i2._readableStreamController), d2 && f2 || l2(void 0);
      }, _errorSteps: () => {
        c2 = false;
      } }), u(void 0);
    }
    __name(h2, "h");
    function m2(t4) {
      if (d2 = true, o2 = t4, f2) {
        const t5 = oe([o2, n2]), r3 = cr(e3, t5);
        l2(r3);
      }
      return b2;
    }
    __name(m2, "m");
    function y2(t4) {
      if (f2 = true, n2 = t4, d2) {
        const t5 = oe([o2, n2]), r3 = cr(e3, t5);
        l2(r3);
      }
      return b2;
    }
    __name(y2, "y");
    function g2() {
    }
    __name(g2, "g");
    return a2 = ar(g2, h2, m2), i2 = ar(g2, h2, y2), _(r2._closedPromise, (e4) => {
      Vt(a2._readableStreamController, e4), Vt(i2._readableStreamController, e4), d2 && f2 || l2(void 0);
    }), [a2, i2];
  }(e2);
}
__name(Kt, "Kt");
function Zt(e2, t2, r2) {
  return F(e2, r2), (r3) => g(e2, t2, [r3]);
}
__name(Zt, "Zt");
function er(e2, t2, r2) {
  return F(e2, r2), (r3) => g(e2, t2, [r3]);
}
__name(er, "er");
function tr(e2, t2, r2) {
  return F(e2, r2), (r3) => y(e2, t2, [r3]);
}
__name(tr, "tr");
function rr(e2, t2) {
  if ((e2 = `${e2}`) !== "bytes")
    throw new TypeError(`${t2} '${e2}' is not a valid enumeration value for ReadableStreamType`);
  return e2;
}
__name(rr, "rr");
function or(e2, t2) {
  if ((e2 = `${e2}`) !== "byob")
    throw new TypeError(`${t2} '${e2}' is not a valid enumeration value for ReadableStreamReaderMode`);
  return e2;
}
__name(or, "or");
function nr(e2, t2) {
  z(e2, t2);
  const r2 = e2 == null ? void 0 : e2.preventAbort, o2 = e2 == null ? void 0 : e2.preventCancel, n2 = e2 == null ? void 0 : e2.preventClose, a2 = e2 == null ? void 0 : e2.signal;
  return a2 !== void 0 && function(e3, t3) {
    if (!function(e4) {
      if (typeof e4 != "object" || e4 === null)
        return false;
      try {
        return typeof e4.aborted == "boolean";
      } catch (e5) {
        return false;
      }
    }(e3))
      throw new TypeError(`${t3} is not an AbortSignal.`);
  }(a2, `${t2} has member 'signal' that`), { preventAbort: Boolean(r2), preventCancel: Boolean(o2), preventClose: Boolean(n2), signal: a2 };
}
__name(nr, "nr");
Object.defineProperties(ReadableStreamDefaultController.prototype, { close: { enumerable: true }, enqueue: { enumerable: true }, error: { enumerable: true }, desiredSize: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(ReadableStreamDefaultController.prototype, e.toStringTag, { value: "ReadableStreamDefaultController", configurable: true });
var ReadableStream = class {
  constructor(e2 = {}, t2 = {}) {
    e2 === void 0 ? e2 = null : I(e2, "First parameter");
    const r2 = xe(t2, "Second parameter"), o2 = function(e3, t3) {
      z(e3, t3);
      const r3 = e3, o3 = r3 == null ? void 0 : r3.autoAllocateChunkSize, n2 = r3 == null ? void 0 : r3.cancel, a2 = r3 == null ? void 0 : r3.pull, i2 = r3 == null ? void 0 : r3.start, l2 = r3 == null ? void 0 : r3.type;
      return { autoAllocateChunkSize: o3 === void 0 ? void 0 : Q(o3, `${t3} has member 'autoAllocateChunkSize' that`), cancel: n2 === void 0 ? void 0 : Zt(n2, r3, `${t3} has member 'cancel' that`), pull: a2 === void 0 ? void 0 : er(a2, r3, `${t3} has member 'pull' that`), start: i2 === void 0 ? void 0 : tr(i2, r3, `${t3} has member 'start' that`), type: l2 === void 0 ? void 0 : rr(l2, `${t3} has member 'type' that`) };
    }(e2, "First parameter");
    if (lr(this), o2.type === "bytes") {
      if (r2.size !== void 0)
        throw new RangeError("The strategy for a byte stream cannot have a size function");
      !function(e3, t3, r3) {
        const o3 = Object.create(ReadableByteStreamController.prototype);
        let n2 = /* @__PURE__ */ __name(() => {
        }, "n"), a2 = /* @__PURE__ */ __name(() => u(void 0), "a"), i2 = /* @__PURE__ */ __name(() => u(void 0), "i");
        t3.start !== void 0 && (n2 = /* @__PURE__ */ __name(() => t3.start(o3), "n")), t3.pull !== void 0 && (a2 = /* @__PURE__ */ __name(() => t3.pull(o3), "a")), t3.cancel !== void 0 && (i2 = /* @__PURE__ */ __name((e4) => t3.cancel(e4), "i"));
        const l2 = t3.autoAllocateChunkSize;
        if (l2 === 0)
          throw new TypeError("autoAllocateChunkSize must be greater than 0");
        Be(e3, o3, n2, a2, i2, r3, l2);
      }(this, o2, Qe(r2, 0));
    } else {
      const e3 = Ye(r2);
      !function(e4, t3, r3, o3) {
        const n2 = Object.create(ReadableStreamDefaultController.prototype);
        let a2 = /* @__PURE__ */ __name(() => {
        }, "a"), i2 = /* @__PURE__ */ __name(() => u(void 0), "i"), l2 = /* @__PURE__ */ __name(() => u(void 0), "l");
        t3.start !== void 0 && (a2 = /* @__PURE__ */ __name(() => t3.start(n2), "a")), t3.pull !== void 0 && (i2 = /* @__PURE__ */ __name(() => t3.pull(n2), "i")), t3.cancel !== void 0 && (l2 = /* @__PURE__ */ __name((e5) => t3.cancel(e5), "l")), Xt(e4, n2, a2, i2, l2, r3, o3);
      }(this, o2, Qe(r2, 1), e3);
    }
  }
  get locked() {
    if (!sr(this))
      throw br("locked");
    return ur(this);
  }
  cancel(e2) {
    return sr(this) ? ur(this) ? c(new TypeError("Cannot cancel a stream that already has a reader")) : cr(this, e2) : c(br("cancel"));
  }
  getReader(e2) {
    if (!sr(this))
      throw br("getReader");
    return function(e3, t2) {
      z(e3, t2);
      const r2 = e3 == null ? void 0 : e3.mode;
      return { mode: r2 === void 0 ? void 0 : or(r2, `${t2} has member 'mode' that`) };
    }(e2, "First parameter").mode === void 0 ? x(this) : ze(this);
  }
  pipeThrough(e2, t2 = {}) {
    if (!sr(this))
      throw br("pipeThrough");
    L(e2, 1, "pipeThrough");
    const r2 = function(e3, t3) {
      z(e3, t3);
      const r3 = e3 == null ? void 0 : e3.readable;
      $(r3, "readable", "ReadableWritablePair"), Y(r3, `${t3} has member 'readable' that`);
      const o3 = e3 == null ? void 0 : e3.writable;
      return $(o3, "writable", "ReadableWritablePair"), Xe(o3, `${t3} has member 'writable' that`), { readable: r3, writable: o3 };
    }(e2, "First parameter"), o2 = nr(t2, "Second parameter");
    if (ur(this))
      throw new TypeError("ReadableStream.prototype.pipeThrough cannot be used on a locked ReadableStream");
    if (tt(r2.writable))
      throw new TypeError("ReadableStream.prototype.pipeThrough cannot be used on a locked WritableStream");
    return m(Dt(this, r2.writable, o2.preventClose, o2.preventAbort, o2.preventCancel, o2.signal)), r2.readable;
  }
  pipeTo(e2, t2 = {}) {
    if (!sr(this))
      return c(br("pipeTo"));
    if (e2 === void 0)
      return c("Parameter 1 is required in 'pipeTo'.");
    if (!et(e2))
      return c(new TypeError("ReadableStream.prototype.pipeTo's first argument must be a WritableStream"));
    let r2;
    try {
      r2 = nr(t2, "Second parameter");
    } catch (e3) {
      return c(e3);
    }
    return ur(this) ? c(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked ReadableStream")) : tt(e2) ? c(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked WritableStream")) : Dt(this, e2, r2.preventClose, r2.preventAbort, r2.preventCancel, r2.signal);
  }
  tee() {
    if (!sr(this))
      throw br("tee");
    return oe(Kt(this));
  }
  values(e2) {
    if (!sr(this))
      throw br("values");
    return function(e3, t2) {
      const r2 = x(e3), o2 = new K(r2, t2), n2 = Object.create(Z);
      return n2._asyncIteratorImpl = o2, n2;
    }(this, function(e3, t2) {
      z(e3, t2);
      const r2 = e3 == null ? void 0 : e3.preventCancel;
      return { preventCancel: Boolean(r2) };
    }(e2, "First parameter").preventCancel);
  }
};
__name(ReadableStream, "ReadableStream");
function ar(e2, t2, r2, o2 = 1, n2 = () => 1) {
  const a2 = Object.create(ReadableStream.prototype);
  lr(a2);
  return Xt(a2, Object.create(ReadableStreamDefaultController.prototype), e2, t2, r2, o2, n2), a2;
}
__name(ar, "ar");
function ir(e2, t2, r2) {
  const o2 = Object.create(ReadableStream.prototype);
  lr(o2);
  return Be(o2, Object.create(ReadableByteStreamController.prototype), e2, t2, r2, 0, void 0), o2;
}
__name(ir, "ir");
function lr(e2) {
  e2._state = "readable", e2._reader = void 0, e2._storedError = void 0, e2._disturbed = false;
}
__name(lr, "lr");
function sr(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_readableStreamController") && e2 instanceof ReadableStream);
}
__name(sr, "sr");
function ur(e2) {
  return e2._reader !== void 0;
}
__name(ur, "ur");
function cr(e2, r2) {
  if (e2._disturbed = true, e2._state === "closed")
    return u(void 0);
  if (e2._state === "errored")
    return c(e2._storedError);
  dr(e2);
  const o2 = e2._reader;
  o2 !== void 0 && $e(o2) && (o2._readIntoRequests.forEach((e3) => {
    e3._closeSteps(void 0);
  }), o2._readIntoRequests = new S());
  return h(e2._readableStreamController[k](r2), t);
}
__name(cr, "cr");
function dr(e2) {
  e2._state = "closed";
  const t2 = e2._reader;
  t2 !== void 0 && (E(t2), G(t2) && (t2._readRequests.forEach((e3) => {
    e3._closeSteps();
  }), t2._readRequests = new S()));
}
__name(dr, "dr");
function fr(e2, t2) {
  e2._state = "errored", e2._storedError = t2;
  const r2 = e2._reader;
  r2 !== void 0 && (P(r2, t2), G(r2) ? (r2._readRequests.forEach((e3) => {
    e3._errorSteps(t2);
  }), r2._readRequests = new S()) : (r2._readIntoRequests.forEach((e3) => {
    e3._errorSteps(t2);
  }), r2._readIntoRequests = new S()));
}
__name(fr, "fr");
function br(e2) {
  return new TypeError(`ReadableStream.prototype.${e2} can only be used on a ReadableStream`);
}
__name(br, "br");
function _r(e2, t2) {
  z(e2, t2);
  const r2 = e2 == null ? void 0 : e2.highWaterMark;
  return $(r2, "highWaterMark", "QueuingStrategyInit"), { highWaterMark: D(r2) };
}
__name(_r, "_r");
Object.defineProperties(ReadableStream.prototype, { cancel: { enumerable: true }, getReader: { enumerable: true }, pipeThrough: { enumerable: true }, pipeTo: { enumerable: true }, tee: { enumerable: true }, values: { enumerable: true }, locked: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(ReadableStream.prototype, e.toStringTag, { value: "ReadableStream", configurable: true }), typeof e.asyncIterator == "symbol" && Object.defineProperty(ReadableStream.prototype, e.asyncIterator, { value: ReadableStream.prototype.values, writable: true, configurable: true });
var hr = /* @__PURE__ */ __name((e2) => e2.byteLength, "hr");
Object.defineProperty(hr, "name", { value: "size", configurable: true });
var ByteLengthQueuingStrategy = class {
  constructor(e2) {
    L(e2, 1, "ByteLengthQueuingStrategy"), e2 = _r(e2, "First parameter"), this._byteLengthQueuingStrategyHighWaterMark = e2.highWaterMark;
  }
  get highWaterMark() {
    if (!pr(this))
      throw mr("highWaterMark");
    return this._byteLengthQueuingStrategyHighWaterMark;
  }
  get size() {
    if (!pr(this))
      throw mr("size");
    return hr;
  }
};
__name(ByteLengthQueuingStrategy, "ByteLengthQueuingStrategy");
function mr(e2) {
  return new TypeError(`ByteLengthQueuingStrategy.prototype.${e2} can only be used on a ByteLengthQueuingStrategy`);
}
__name(mr, "mr");
function pr(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_byteLengthQueuingStrategyHighWaterMark") && e2 instanceof ByteLengthQueuingStrategy);
}
__name(pr, "pr");
Object.defineProperties(ByteLengthQueuingStrategy.prototype, { highWaterMark: { enumerable: true }, size: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(ByteLengthQueuingStrategy.prototype, e.toStringTag, { value: "ByteLengthQueuingStrategy", configurable: true });
var yr = /* @__PURE__ */ __name(() => 1, "yr");
Object.defineProperty(yr, "name", { value: "size", configurable: true });
var CountQueuingStrategy = class {
  constructor(e2) {
    L(e2, 1, "CountQueuingStrategy"), e2 = _r(e2, "First parameter"), this._countQueuingStrategyHighWaterMark = e2.highWaterMark;
  }
  get highWaterMark() {
    if (!Sr(this))
      throw gr("highWaterMark");
    return this._countQueuingStrategyHighWaterMark;
  }
  get size() {
    if (!Sr(this))
      throw gr("size");
    return yr;
  }
};
__name(CountQueuingStrategy, "CountQueuingStrategy");
function gr(e2) {
  return new TypeError(`CountQueuingStrategy.prototype.${e2} can only be used on a CountQueuingStrategy`);
}
__name(gr, "gr");
function Sr(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_countQueuingStrategyHighWaterMark") && e2 instanceof CountQueuingStrategy);
}
__name(Sr, "Sr");
function vr(e2, t2, r2) {
  return F(e2, r2), (r3) => g(e2, t2, [r3]);
}
__name(vr, "vr");
function wr(e2, t2, r2) {
  return F(e2, r2), (r3) => y(e2, t2, [r3]);
}
__name(wr, "wr");
function Rr(e2, t2, r2) {
  return F(e2, r2), (r3, o2) => g(e2, t2, [r3, o2]);
}
__name(Rr, "Rr");
Object.defineProperties(CountQueuingStrategy.prototype, { highWaterMark: { enumerable: true }, size: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(CountQueuingStrategy.prototype, e.toStringTag, { value: "CountQueuingStrategy", configurable: true });
var TransformStream = class {
  constructor(e2 = {}, t2 = {}, r2 = {}) {
    e2 === void 0 && (e2 = null);
    const o2 = xe(t2, "Second parameter"), n2 = xe(r2, "Third parameter"), a2 = function(e3, t3) {
      z(e3, t3);
      const r3 = e3 == null ? void 0 : e3.flush, o3 = e3 == null ? void 0 : e3.readableType, n3 = e3 == null ? void 0 : e3.start, a3 = e3 == null ? void 0 : e3.transform, i3 = e3 == null ? void 0 : e3.writableType;
      return { flush: r3 === void 0 ? void 0 : vr(r3, e3, `${t3} has member 'flush' that`), readableType: o3, start: n3 === void 0 ? void 0 : wr(n3, e3, `${t3} has member 'start' that`), transform: a3 === void 0 ? void 0 : Rr(a3, e3, `${t3} has member 'transform' that`), writableType: i3 };
    }(e2, "First parameter");
    if (a2.readableType !== void 0)
      throw new RangeError("Invalid readableType specified");
    if (a2.writableType !== void 0)
      throw new RangeError("Invalid writableType specified");
    const i2 = Qe(n2, 0), l2 = Ye(n2), d2 = Qe(o2, 1), f2 = Ye(o2);
    let b2;
    !function(e3, t3, r3, o3, n3, a3) {
      function i3() {
        return t3;
      }
      __name(i3, "i");
      function l3(t4) {
        return function(e4, t5) {
          const r4 = e4._transformStreamController;
          if (e4._backpressure) {
            return h(e4._backpressureChangePromise, () => {
              const o4 = e4._writable;
              if (o4._state === "erroring")
                throw o4._storedError;
              return kr(r4, t5);
            });
          }
          return kr(r4, t5);
        }(e3, t4);
      }
      __name(l3, "l");
      function s2(t4) {
        return function(e4, t5) {
          return Cr(e4, t5), u(void 0);
        }(e3, t4);
      }
      __name(s2, "s");
      function c2() {
        return function(e4) {
          const t4 = e4._readable, r4 = e4._transformStreamController, o4 = r4._flushAlgorithm();
          return Wr(r4), h(o4, () => {
            if (t4._state === "errored")
              throw t4._storedError;
            Nt(t4._readableStreamController);
          }, (r5) => {
            throw Cr(e4, r5), t4._storedError;
          });
        }(e3);
      }
      __name(c2, "c");
      function d3() {
        return function(e4) {
          return Pr(e4, false), e4._backpressureChangePromise;
        }(e3);
      }
      __name(d3, "d");
      function f3(t4) {
        return qr(e3, t4), u(void 0);
      }
      __name(f3, "f");
      e3._writable = function(e4, t4, r4, o4, n4 = 1, a4 = () => 1) {
        const i4 = Object.create(WritableStream.prototype);
        return Ze(i4), yt(i4, Object.create(WritableStreamDefaultController.prototype), e4, t4, r4, o4, n4, a4), i4;
      }(i3, l3, c2, s2, r3, o3), e3._readable = ar(i3, d3, f3, n3, a3), e3._backpressure = void 0, e3._backpressureChangePromise = void 0, e3._backpressureChangePromise_resolve = void 0, Pr(e3, true), e3._transformStreamController = void 0;
    }(this, s((e3) => {
      b2 = e3;
    }), d2, f2, i2, l2), function(e3, t3) {
      const r3 = Object.create(TransformStreamDefaultController.prototype);
      let o3 = /* @__PURE__ */ __name((e4) => {
        try {
          return Or(r3, e4), u(void 0);
        } catch (e5) {
          return c(e5);
        }
      }, "o"), n3 = /* @__PURE__ */ __name(() => u(void 0), "n");
      t3.transform !== void 0 && (o3 = /* @__PURE__ */ __name((e4) => t3.transform(e4, r3), "o"));
      t3.flush !== void 0 && (n3 = /* @__PURE__ */ __name(() => t3.flush(r3), "n"));
      !function(e4, t4, r4, o4) {
        t4._controlledTransformStream = e4, e4._transformStreamController = t4, t4._transformAlgorithm = r4, t4._flushAlgorithm = o4;
      }(e3, r3, o3, n3);
    }(this, a2), a2.start !== void 0 ? b2(a2.start(this._transformStreamController)) : b2(void 0);
  }
  get readable() {
    if (!Tr(this))
      throw jr("readable");
    return this._readable;
  }
  get writable() {
    if (!Tr(this))
      throw jr("writable");
    return this._writable;
  }
};
__name(TransformStream, "TransformStream");
function Tr(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_transformStreamController") && e2 instanceof TransformStream);
}
__name(Tr, "Tr");
function Cr(e2, t2) {
  Vt(e2._readable._readableStreamController, t2), qr(e2, t2);
}
__name(Cr, "Cr");
function qr(e2, t2) {
  Wr(e2._transformStreamController), wt(e2._writable._writableStreamController, t2), e2._backpressure && Pr(e2, false);
}
__name(qr, "qr");
function Pr(e2, t2) {
  e2._backpressureChangePromise !== void 0 && e2._backpressureChangePromise_resolve(), e2._backpressureChangePromise = s((t3) => {
    e2._backpressureChangePromise_resolve = t3;
  }), e2._backpressure = t2;
}
__name(Pr, "Pr");
Object.defineProperties(TransformStream.prototype, { readable: { enumerable: true }, writable: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(TransformStream.prototype, e.toStringTag, { value: "TransformStream", configurable: true });
var TransformStreamDefaultController = class {
  constructor() {
    throw new TypeError("Illegal constructor");
  }
  get desiredSize() {
    if (!Er(this))
      throw Br("desiredSize");
    return Ut(this._controlledTransformStream._readable._readableStreamController);
  }
  enqueue(e2) {
    if (!Er(this))
      throw Br("enqueue");
    Or(this, e2);
  }
  error(e2) {
    if (!Er(this))
      throw Br("error");
    var t2;
    t2 = e2, Cr(this._controlledTransformStream, t2);
  }
  terminate() {
    if (!Er(this))
      throw Br("terminate");
    !function(e2) {
      const t2 = e2._controlledTransformStream;
      Nt(t2._readable._readableStreamController);
      const r2 = new TypeError("TransformStream terminated");
      qr(t2, r2);
    }(this);
  }
};
__name(TransformStreamDefaultController, "TransformStreamDefaultController");
function Er(e2) {
  return !!r(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledTransformStream") && e2 instanceof TransformStreamDefaultController);
}
__name(Er, "Er");
function Wr(e2) {
  e2._transformAlgorithm = void 0, e2._flushAlgorithm = void 0;
}
__name(Wr, "Wr");
function Or(e2, t2) {
  const r2 = e2._controlledTransformStream, o2 = r2._readable._readableStreamController;
  if (!Gt(o2))
    throw new TypeError("Readable side is not in a state that permits enqueue");
  try {
    Ht(o2, t2);
  } catch (e3) {
    throw qr(r2, e3), r2._readable._storedError;
  }
  (function(e3) {
    return !Yt(e3);
  })(o2) !== r2._backpressure && Pr(r2, true);
}
__name(Or, "Or");
function kr(e2, t2) {
  return h(e2._transformAlgorithm(t2), void 0, (t3) => {
    throw Cr(e2._controlledTransformStream, t3), t3;
  });
}
__name(kr, "kr");
function Br(e2) {
  return new TypeError(`TransformStreamDefaultController.prototype.${e2} can only be used on a TransformStreamDefaultController`);
}
__name(Br, "Br");
function jr(e2) {
  return new TypeError(`TransformStream.prototype.${e2} can only be used on a TransformStream`);
}
__name(jr, "jr");
Object.defineProperties(TransformStreamDefaultController.prototype, { enqueue: { enumerable: true }, error: { enumerable: true }, terminate: { enumerable: true }, desiredSize: { enumerable: true } }), typeof e.toStringTag == "symbol" && Object.defineProperty(TransformStreamDefaultController.prototype, e.toStringTag, { value: "TransformStreamDefaultController", configurable: true });
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ReadableStream,
  ReadableStreamBYOBReader,
  ReadableStreamDefaultReader,
  TransformStream,
  WritableStream,
  WritableStreamDefaultWriter
});
