"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// <define:process>
var init_define_process = __esm({
  "<define:process>"() {
  }
});

// ../../node_modules/.pnpm/blob-polyfill@7.0.20220408/node_modules/blob-polyfill/Blob.js
var require_Blob = __commonJS({
  "../../node_modules/.pnpm/blob-polyfill@7.0.20220408/node_modules/blob-polyfill/Blob.js"(exports) {
    init_define_process();
    (() => {
      try {
        global.Blob = void 0;
      } catch {
      }
    })();
    (function(global2) {
      (function(factory) {
        if (typeof define === "function" && define.amd) {
          define(["exports"], factory);
        } else if (typeof exports === "object" && typeof exports.nodeName !== "string") {
          factory(exports);
        } else {
          factory(global2);
        }
      })(function(exports2) {
        "use strict";
        var BlobBuilder = global2.BlobBuilder || global2.WebKitBlobBuilder || global2.MSBlobBuilder || global2.MozBlobBuilder;
        var URL = global2.URL || global2.webkitURL || function(href, a) {
          a = document.createElement("a");
          a.href = href;
          return a;
        };
        var origBlob = global2.Blob;
        var createObjectURL = URL.createObjectURL;
        var revokeObjectURL = URL.revokeObjectURL;
        var strTag = global2.Symbol && global2.Symbol.toStringTag;
        var blobSupported = false;
        var blobSupportsArrayBufferView = false;
        var blobBuilderSupported = BlobBuilder && BlobBuilder.prototype.append && BlobBuilder.prototype.getBlob;
        try {
          blobSupported = new Blob(["\xE4"]).size === 2;
          blobSupportsArrayBufferView = new Blob([new Uint8Array([1, 2])]).size === 2;
        } catch (e) {
        }
        function mapArrayBufferViews(ary) {
          return ary.map(function(chunk) {
            if (chunk.buffer instanceof ArrayBuffer) {
              var buf = chunk.buffer;
              if (chunk.byteLength !== buf.byteLength) {
                var copy = new Uint8Array(chunk.byteLength);
                copy.set(new Uint8Array(buf, chunk.byteOffset, chunk.byteLength));
                buf = copy.buffer;
              }
              return buf;
            }
            return chunk;
          });
        }
        __name(mapArrayBufferViews, "mapArrayBufferViews");
        function BlobBuilderConstructor(ary, options) {
          options = options || {};
          var bb = new BlobBuilder();
          mapArrayBufferViews(ary).forEach(function(part) {
            bb.append(part);
          });
          return options.type ? bb.getBlob(options.type) : bb.getBlob();
        }
        __name(BlobBuilderConstructor, "BlobBuilderConstructor");
        function BlobConstructor(ary, options) {
          return new origBlob(mapArrayBufferViews(ary), options || {});
        }
        __name(BlobConstructor, "BlobConstructor");
        if (global2.Blob) {
          BlobBuilderConstructor.prototype = Blob.prototype;
          BlobConstructor.prototype = Blob.prototype;
        }
        function stringEncode(string) {
          var pos = 0;
          var len = string.length;
          var Arr = global2.Uint8Array || Array;
          var at = 0;
          var tlen = Math.max(32, len + (len >> 1) + 7);
          var target = new Arr(tlen >> 3 << 3);
          while (pos < len) {
            var value = string.charCodeAt(pos++);
            if (value >= 55296 && value <= 56319) {
              if (pos < len) {
                var extra = string.charCodeAt(pos);
                if ((extra & 64512) === 56320) {
                  ++pos;
                  value = ((value & 1023) << 10) + (extra & 1023) + 65536;
                }
              }
              if (value >= 55296 && value <= 56319) {
                continue;
              }
            }
            if (at + 4 > target.length) {
              tlen += 8;
              tlen *= 1 + pos / string.length * 2;
              tlen = tlen >> 3 << 3;
              var update = new Uint8Array(tlen);
              update.set(target);
              target = update;
            }
            if ((value & 4294967168) === 0) {
              target[at++] = value;
              continue;
            } else if ((value & 4294965248) === 0) {
              target[at++] = value >> 6 & 31 | 192;
            } else if ((value & 4294901760) === 0) {
              target[at++] = value >> 12 & 15 | 224;
              target[at++] = value >> 6 & 63 | 128;
            } else if ((value & 4292870144) === 0) {
              target[at++] = value >> 18 & 7 | 240;
              target[at++] = value >> 12 & 63 | 128;
              target[at++] = value >> 6 & 63 | 128;
            } else {
              continue;
            }
            target[at++] = value & 63 | 128;
          }
          return target.slice(0, at);
        }
        __name(stringEncode, "stringEncode");
        function stringDecode(buf) {
          var end = buf.length;
          var res = [];
          var i = 0;
          while (i < end) {
            var firstByte = buf[i];
            var codePoint = null;
            var bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
            if (i + bytesPerSequence <= end) {
              var secondByte, thirdByte, fourthByte, tempCodePoint;
              switch (bytesPerSequence) {
                case 1:
                  if (firstByte < 128) {
                    codePoint = firstByte;
                  }
                  break;
                case 2:
                  secondByte = buf[i + 1];
                  if ((secondByte & 192) === 128) {
                    tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                    if (tempCodePoint > 127) {
                      codePoint = tempCodePoint;
                    }
                  }
                  break;
                case 3:
                  secondByte = buf[i + 1];
                  thirdByte = buf[i + 2];
                  if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                    tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                    if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                      codePoint = tempCodePoint;
                    }
                  }
                  break;
                case 4:
                  secondByte = buf[i + 1];
                  thirdByte = buf[i + 2];
                  fourthByte = buf[i + 3];
                  if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                    tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                    if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                      codePoint = tempCodePoint;
                    }
                  }
              }
            }
            if (codePoint === null) {
              codePoint = 65533;
              bytesPerSequence = 1;
            } else if (codePoint > 65535) {
              codePoint -= 65536;
              res.push(codePoint >>> 10 & 1023 | 55296);
              codePoint = 56320 | codePoint & 1023;
            }
            res.push(codePoint);
            i += bytesPerSequence;
          }
          var len = res.length;
          var str = "";
          var j = 0;
          while (j < len) {
            str += String.fromCharCode.apply(String, res.slice(j, j += 4096));
          }
          return str;
        }
        __name(stringDecode, "stringDecode");
        var textEncode = typeof TextEncoder === "function" ? TextEncoder.prototype.encode.bind(new TextEncoder()) : stringEncode;
        var textDecode = typeof TextDecoder === "function" ? TextDecoder.prototype.decode.bind(new TextDecoder()) : stringDecode;
        function FakeBlobBuilder() {
          function bufferClone(buf) {
            var view = new Array(buf.byteLength);
            var array = new Uint8Array(buf);
            var i = view.length;
            while (i--) {
              view[i] = array[i];
            }
            return view;
          }
          __name(bufferClone, "bufferClone");
          function array2base64(input) {
            var byteToCharMap = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
            var output = [];
            for (var i = 0; i < input.length; i += 3) {
              var byte1 = input[i];
              var haveByte2 = i + 1 < input.length;
              var byte2 = haveByte2 ? input[i + 1] : 0;
              var haveByte3 = i + 2 < input.length;
              var byte3 = haveByte3 ? input[i + 2] : 0;
              var outByte1 = byte1 >> 2;
              var outByte2 = (byte1 & 3) << 4 | byte2 >> 4;
              var outByte3 = (byte2 & 15) << 2 | byte3 >> 6;
              var outByte4 = byte3 & 63;
              if (!haveByte3) {
                outByte4 = 64;
                if (!haveByte2) {
                  outByte3 = 64;
                }
              }
              output.push(
                byteToCharMap[outByte1],
                byteToCharMap[outByte2],
                byteToCharMap[outByte3],
                byteToCharMap[outByte4]
              );
            }
            return output.join("");
          }
          __name(array2base64, "array2base64");
          var create = Object.create || function(a) {
            function c() {
            }
            __name(c, "c");
            c.prototype = a;
            return new c();
          };
          function getObjectTypeName(o) {
            return Object.prototype.toString.call(o).slice(8, -1);
          }
          __name(getObjectTypeName, "getObjectTypeName");
          function isPrototypeOf(c, o) {
            return typeof c === "object" && Object.prototype.isPrototypeOf.call(c.prototype, o);
          }
          __name(isPrototypeOf, "isPrototypeOf");
          function isDataView(o) {
            return getObjectTypeName(o) === "DataView" || isPrototypeOf(global2.DataView, o);
          }
          __name(isDataView, "isDataView");
          var arrayBufferClassNames = [
            "Int8Array",
            "Uint8Array",
            "Uint8ClampedArray",
            "Int16Array",
            "Uint16Array",
            "Int32Array",
            "Uint32Array",
            "Float32Array",
            "Float64Array",
            "ArrayBuffer"
          ];
          function includes(a, v) {
            return a.indexOf(v) !== -1;
          }
          __name(includes, "includes");
          function isArrayBuffer(o) {
            return includes(arrayBufferClassNames, getObjectTypeName(o)) || isPrototypeOf(global2.ArrayBuffer, o);
          }
          __name(isArrayBuffer, "isArrayBuffer");
          function concatTypedarrays(chunks) {
            var size = 0;
            var j = chunks.length;
            while (j--) {
              size += chunks[j].length;
            }
            var b = new Uint8Array(size);
            var offset = 0;
            for (var i = 0; i < chunks.length; i++) {
              var chunk = chunks[i];
              b.set(chunk, offset);
              offset += chunk.byteLength || chunk.length;
            }
            return b;
          }
          __name(concatTypedarrays, "concatTypedarrays");
          function Blob3(chunks, opts) {
            chunks = chunks ? chunks.slice() : [];
            opts = opts == null ? {} : opts;
            for (var i = 0, len = chunks.length; i < len; i++) {
              var chunk = chunks[i];
              if (chunk instanceof Blob3) {
                chunks[i] = chunk._buffer;
              } else if (typeof chunk === "string") {
                chunks[i] = textEncode(chunk);
              } else if (isDataView(chunk)) {
                chunks[i] = bufferClone(chunk.buffer);
              } else if (isArrayBuffer(chunk)) {
                chunks[i] = bufferClone(chunk);
              } else {
                chunks[i] = textEncode(String(chunk));
              }
            }
            this._buffer = global2.Uint8Array ? concatTypedarrays(chunks) : [].concat.apply([], chunks);
            this.size = this._buffer.length;
            this.type = opts.type || "";
            if (/[^\u0020-\u007E]/.test(this.type)) {
              this.type = "";
            } else {
              this.type = this.type.toLowerCase();
            }
          }
          __name(Blob3, "Blob");
          Blob3.prototype.arrayBuffer = function() {
            return Promise.resolve(this._buffer.buffer || this._buffer);
          };
          Blob3.prototype.text = function() {
            return Promise.resolve(textDecode(this._buffer));
          };
          Blob3.prototype.slice = function(start, end, type) {
            var slice = this._buffer.slice(start || 0, end || this._buffer.length);
            return new Blob3([slice], { type });
          };
          Blob3.prototype.toString = function() {
            return "[object Blob]";
          };
          function File2(chunks, name, opts) {
            opts = opts || {};
            var a = Blob3.call(this, chunks, opts) || this;
            a.name = name.replace(/\//g, ":");
            a.lastModifiedDate = opts.lastModified ? new Date(opts.lastModified) : new Date();
            a.lastModified = +a.lastModifiedDate;
            return a;
          }
          __name(File2, "File");
          File2.prototype = create(Blob3.prototype);
          File2.prototype.constructor = File2;
          if (Object.setPrototypeOf) {
            Object.setPrototypeOf(File2, Blob3);
          } else {
            try {
              File2.__proto__ = Blob3;
            } catch (e) {
            }
          }
          File2.prototype.toString = function() {
            return "[object File]";
          };
          function FileReader2() {
            if (!(this instanceof FileReader2)) {
              throw new TypeError("Failed to construct 'FileReader': Please use the 'new' operator, this DOM object constructor cannot be called as a function.");
            }
            var delegate = document.createDocumentFragment();
            this.addEventListener = delegate.addEventListener;
            this.dispatchEvent = function(evt) {
              var local = this["on" + evt.type];
              if (typeof local === "function")
                local(evt);
              delegate.dispatchEvent(evt);
            };
            this.removeEventListener = delegate.removeEventListener;
          }
          __name(FileReader2, "FileReader");
          function _read(fr, blob2, kind) {
            if (!(blob2 instanceof Blob3)) {
              throw new TypeError("Failed to execute '" + kind + "' on 'FileReader': parameter 1 is not of type 'Blob'.");
            }
            fr.result = "";
            setTimeout(function() {
              this.readyState = FileReader2.LOADING;
              fr.dispatchEvent(new Event("load"));
              fr.dispatchEvent(new Event("loadend"));
            });
          }
          __name(_read, "_read");
          FileReader2.EMPTY = 0;
          FileReader2.LOADING = 1;
          FileReader2.DONE = 2;
          FileReader2.prototype.error = null;
          FileReader2.prototype.onabort = null;
          FileReader2.prototype.onerror = null;
          FileReader2.prototype.onload = null;
          FileReader2.prototype.onloadend = null;
          FileReader2.prototype.onloadstart = null;
          FileReader2.prototype.onprogress = null;
          FileReader2.prototype.readAsDataURL = function(blob2) {
            _read(this, blob2, "readAsDataURL");
            this.result = "data:" + blob2.type + ";base64," + array2base64(blob2._buffer);
          };
          FileReader2.prototype.readAsText = function(blob2) {
            _read(this, blob2, "readAsText");
            this.result = textDecode(blob2._buffer);
          };
          FileReader2.prototype.readAsArrayBuffer = function(blob2) {
            _read(this, blob2, "readAsText");
            this.result = (blob2._buffer.buffer || blob2._buffer).slice();
          };
          FileReader2.prototype.abort = function() {
          };
          URL.createObjectURL = function(blob2) {
            return blob2 instanceof Blob3 ? "data:" + blob2.type + ";base64," + array2base64(blob2._buffer) : createObjectURL.call(URL, blob2);
          };
          URL.revokeObjectURL = function(url) {
            revokeObjectURL && revokeObjectURL.call(URL, url);
          };
          var _send = global2.XMLHttpRequest && global2.XMLHttpRequest.prototype.send;
          if (_send) {
            XMLHttpRequest.prototype.send = function(data) {
              if (data instanceof Blob3) {
                this.setRequestHeader("Content-Type", data.type);
                _send.call(this, textDecode(data._buffer));
              } else {
                _send.call(this, data);
              }
            };
          }
          exports2.Blob = Blob3;
          exports2.File = File2;
          exports2.FileReader = FileReader2;
          exports2.URL = URL;
        }
        __name(FakeBlobBuilder, "FakeBlobBuilder");
        function fixFileAndXHR() {
          var isIE = !!global2.ActiveXObject || "-ms-scroll-limit" in document.documentElement.style && "-ms-ime-align" in document.documentElement.style;
          var _send = global2.XMLHttpRequest && global2.XMLHttpRequest.prototype.send;
          if (isIE && _send) {
            XMLHttpRequest.prototype.send = function(data) {
              if (data instanceof Blob) {
                this.setRequestHeader("Content-Type", data.type);
                _send.call(this, data);
              } else {
                _send.call(this, data);
              }
            };
          }
          try {
            new File([], "");
            exports2.File = global2.File;
            exports2.FileReader = global2.FileReader;
          } catch (e) {
            try {
              exports2.File = new Function(
                'class File extends Blob {constructor(chunks, name, opts) {opts = opts || {};super(chunks, opts || {});this.name = name.replace(/\\//g, ":");this.lastModifiedDate = opts.lastModified ? new Date(opts.lastModified) : new Date();this.lastModified = +this.lastModifiedDate;}};return new File([], ""), File'
              )();
            } catch (e2) {
              exports2.File = function(b, d, c) {
                var blob2 = new Blob(b, c);
                var t = c && void 0 !== c.lastModified ? new Date(c.lastModified) : new Date();
                blob2.name = d.replace(/\//g, ":");
                blob2.lastModifiedDate = t;
                blob2.lastModified = +t;
                blob2.toString = function() {
                  return "[object File]";
                };
                if (strTag) {
                  blob2[strTag] = "File";
                }
                return blob2;
              };
            }
          }
        }
        __name(fixFileAndXHR, "fixFileAndXHR");
        if (blobSupported) {
          fixFileAndXHR();
          exports2.Blob = blobSupportsArrayBufferView ? global2.Blob : BlobConstructor;
        } else if (blobBuilderSupported) {
          fixFileAndXHR();
          exports2.Blob = BlobBuilderConstructor;
        } else {
          FakeBlobBuilder();
        }
        if (strTag) {
          if (!exports2.File.prototype[strTag])
            exports2.File.prototype[strTag] = "File";
          if (!exports2.Blob.prototype[strTag])
            exports2.Blob.prototype[strTag] = "Blob";
          if (!exports2.FileReader.prototype[strTag])
            exports2.FileReader.prototype[strTag] = "FileReader";
        }
        var blob = exports2.Blob.prototype;
        var stream;
        try {
          new ReadableStream({ type: "bytes" });
          stream = /* @__PURE__ */ __name(function stream2() {
            var position = 0;
            var blob2 = this;
            return new ReadableStream({
              type: "bytes",
              autoAllocateChunkSize: 524288,
              pull: function(controller) {
                var v = controller.byobRequest.view;
                var chunk = blob2.slice(position, position + v.byteLength);
                return chunk.arrayBuffer().then(function(buffer) {
                  var uint8array = new Uint8Array(buffer);
                  var bytesRead = uint8array.byteLength;
                  position += bytesRead;
                  v.set(uint8array);
                  controller.byobRequest.respond(bytesRead);
                  if (position >= blob2.size)
                    controller.close();
                });
              }
            });
          }, "stream");
        } catch (e) {
          try {
            new ReadableStream({});
            stream = /* @__PURE__ */ __name(function stream2(blob2) {
              var position = 0;
              return new ReadableStream({
                pull: function(controller) {
                  var chunk = blob2.slice(position, position + 524288);
                  return chunk.arrayBuffer().then(function(buffer) {
                    position += buffer.byteLength;
                    var uint8array = new Uint8Array(buffer);
                    controller.enqueue(uint8array);
                    if (position == blob2.size)
                      controller.close();
                  });
                }
              });
            }, "stream");
          } catch (e2) {
            try {
              new Response("").body.getReader().read();
              stream = /* @__PURE__ */ __name(function stream2() {
                return new Response(this).body;
              }, "stream");
            } catch (e3) {
              stream = /* @__PURE__ */ __name(function stream2() {
                throw new Error("Include https://github.com/MattiasBuelens/web-streams-polyfill");
              }, "stream");
            }
          }
        }
        function promisify(obj) {
          return new Promise(function(resolve, reject) {
            obj.onload = obj.onerror = function(evt) {
              obj.onload = obj.onerror = null;
              evt.type === "load" ? resolve(obj.result || obj) : reject(new Error("Failed to read the blob/file"));
            };
          });
        }
        __name(promisify, "promisify");
        if (!blob.arrayBuffer) {
          blob.arrayBuffer = /* @__PURE__ */ __name(function arrayBuffer() {
            var fr = new FileReader();
            fr.readAsArrayBuffer(this);
            return promisify(fr);
          }, "arrayBuffer");
        }
        if (!blob.text) {
          blob.text = /* @__PURE__ */ __name(function text() {
            var fr = new FileReader();
            fr.readAsText(this);
            return promisify(fr);
          }, "text");
        }
        if (!blob.stream) {
          blob.stream = stream;
        }
      });
    })(
      typeof self !== "undefined" && self || typeof window !== "undefined" && window || typeof global !== "undefined" && global || exports
    );
  }
});

// src/primitives/blob.js
var blob_exports = {};
__export(blob_exports, {
  Blob: () => import_blob_polyfill.Blob
});
module.exports = __toCommonJS(blob_exports);
init_define_process();
var import_blob_polyfill = __toESM(require_Blob());
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Blob
});
