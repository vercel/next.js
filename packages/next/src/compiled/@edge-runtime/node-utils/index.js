"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/index.ts
var src_exports = {};
__export(src_exports, {
  buildToFetchEvent: () => buildToFetchEvent,
  buildToHeaders: () => buildToHeaders,
  buildToNodeHandler: () => buildToNodeHandler,
  buildToReadableStream: () => buildToReadableStream,
  buildToRequest: () => buildToRequest,
  mergeIntoServerResponse: () => mergeIntoServerResponse,
  toOutgoingHeaders: () => toOutgoingHeaders,
  toToReadable: () => toToReadable
});
module.exports = __toCommonJS(src_exports);

// src/node-to-edge/fetch-event.ts
function buildToFetchEvent(dependencies) {
  return function toFetchEvent(request) {
    const event = new dependencies.FetchEvent(request);
    Object.defineProperty(event, "waitUntil", {
      configurable: false,
      enumerable: true,
      get: () => {
        throw new Error("waitUntil is not supported yet.");
      }
    });
    return event;
  };
}

// src/node-to-edge/headers.ts
function buildToHeaders({ Headers }) {
  return function toHeaders(nodeHeaders) {
    const headers = new Headers();
    for (let [key, value] of Object.entries(nodeHeaders)) {
      const values = Array.isArray(value) ? value : [value];
      for (let v of values) {
        if (v !== void 0) {
          headers.append(key, v);
        }
      }
    }
    return headers;
  };
}

// src/node-to-edge/stream.ts
function buildToReadableStream(dependencies) {
  const { ReadableStream, Uint8Array: Uint8Array2 } = dependencies;
  return function toReadableStream(stream) {
    return new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => {
          controller.enqueue(new Uint8Array2([...new Uint8Array2(chunk)]));
        });
        stream.on("end", () => {
          controller.close();
        });
        stream.on("error", (err) => {
          controller.error(err);
        });
      }
    });
  };
}

// src/node-to-edge/request.ts
function buildToRequest(dependencies) {
  const toHeaders = buildToHeaders(dependencies);
  const toReadableStream = buildToReadableStream(dependencies);
  const { Request } = dependencies;
  return function toRequest(request, options) {
    var _a;
    return new Request(
      String(
        new URL(
          request.url || "/",
          computeOrigin(request, options.defaultOrigin)
        )
      ),
      {
        method: request.method,
        headers: toHeaders(request.headers),
        body: !["HEAD", "GET"].includes((_a = request.method) != null ? _a : "") ? toReadableStream(request) : null
      }
    );
  };
}
function computeOrigin({ headers }, defaultOrigin) {
  const authority = headers.host;
  if (!authority) {
    return defaultOrigin;
  }
  const [, port] = authority.split(":");
  return `${port === "443" ? "https" : "http"}://${authority}`;
}

// src/edge-to-node/headers.ts
var import_cookies = require("@edge-runtime/cookies");
function toOutgoingHeaders(headers) {
  var _a, _b;
  const outputHeaders = {};
  if (headers) {
    for (const [name, value] of typeof headers.raw !== "undefined" ? Object.entries(headers.raw()) : headers.entries()) {
      outputHeaders[name] = value;
      if (name.toLowerCase() === "set-cookie") {
        outputHeaders[name] = (_b = (_a = headers.getAll) == null ? void 0 : _a.call(headers, "set-cookie")) != null ? _b : (0, import_cookies.splitCookiesString)(value);
      }
    }
  }
  return outputHeaders;
}
function mergeIntoServerResponse(headers, serverResponse) {
  for (const [name, value] of Object.entries(headers)) {
    if (value !== void 0) {
      serverResponse.setHeader(name, value);
    }
  }
}

// src/edge-to-node/stream.ts
var import_node_stream = require("stream");
function toToReadable(webStream, options = {}) {
  const reader = webStream.getReader();
  let closed = false;
  const { highWaterMark, encoding, objectMode = false, signal } = options;
  const readable = new import_node_stream.Readable({
    objectMode,
    highWaterMark,
    encoding,
    // @ts-ignore signal exist only since Node@17
    signal,
    read() {
      reader.read().then(
        (chunk) => {
          if (chunk.done) {
            readable.push(null);
          } else {
            readable.push(chunk.value);
          }
        },
        (error) => readable.destroy(error)
      );
    },
    destroy(error, callback) {
      function done() {
        try {
          callback(error);
        } catch (error2) {
          process.nextTick(() => {
            throw error2;
          });
        }
      }
      if (!closed) {
        reader.cancel(error).then(done, done);
        return;
      }
      done();
    }
  });
  reader.closed.then(
    () => {
      closed = true;
    },
    (error) => {
      closed = true;
      readable.destroy(error);
    }
  );
  return readable;
}

// src/edge-to-node/handler.ts
function buildToNodeHandler(dependencies, options) {
  const toRequest = buildToRequest(dependencies);
  const toFetchEvent = buildToFetchEvent(dependencies);
  return function toNodeHandler(webHandler) {
    return (incomingMessage, serverResponse) => {
      const request = toRequest(incomingMessage, options);
      const maybePromise = webHandler(request, toFetchEvent(request));
      if (maybePromise instanceof Promise) {
        maybePromise.then(
          (response) => toServerResponse(response, serverResponse)
        );
      } else {
        toServerResponse(maybePromise, serverResponse);
      }
    };
  };
}
function toServerResponse(webResponse, serverResponse) {
  if (!webResponse) {
    serverResponse.end();
    return;
  }
  mergeIntoServerResponse(
    // @ts-ignore getAll() is not standard https://fetch.spec.whatwg.org/#headers-class
    toOutgoingHeaders(webResponse.headers),
    serverResponse
  );
  serverResponse.statusCode = webResponse.status;
  serverResponse.statusMessage = webResponse.statusText;
  if (!webResponse.body) {
    serverResponse.end();
    return;
  }
  toToReadable(webResponse.body).pipe(serverResponse);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildToFetchEvent,
  buildToHeaders,
  buildToNodeHandler,
  buildToReadableStream,
  buildToRequest,
  mergeIntoServerResponse,
  toOutgoingHeaders,
  toToReadable
});
