const END_OF_OPERATION = process.argv[2];

import "next/dist/server/node-polyfill-fetch.js";
import { renderToHTML } from "next/dist/server/render";
import App from "@vercel/turbopack-next/pages/_app";
import Document from "@vercel/turbopack-next/pages/_document";
import Component, * as otherExports from ".";
("TURBOPACK { transition: next-client }");
import chunkGroup from ".";

process.stdout.write("READY\n");

const NEW_LINE = "\n".charCodeAt(0);
let buffer = [];
process.stdin.on("data", async (data) => {
  let idx = data.indexOf(NEW_LINE);
  while (idx >= 0) {
    buffer.push(data.slice(0, idx));
    try {
      let json = JSON.parse(Buffer.concat(buffer).toString("utf-8"));
      buffer.length = 0;
      let result = await operation(json);
      console.log(`RESULT=${JSON.stringify(result)}`);
    } catch (e) {
      console.log(`ERROR=${JSON.stringify(e.stack)}`);
    }
    console.log(END_OF_OPERATION);
    data = data.slice(idx + 1);
    idx = data.indexOf(NEW_LINE);
  }
  buffer.push(data);
});

/**
 * Shim for Node.js's http.ServerResponse
 */
class ServerResponse {
  headersSent = false;
  #headers = new Map();

  constructor(req) {
    this.req = req;
  }

  setHeader(name, value) {
    this.#headers.set(name.toLowerCase(), value);
    return this;
  }

  getHeader(name) {
    return this.#headers.get(name.toLowerCase());
  }

  getHeaderNames() {
    return Array.from(this.#headers.keys());
  }

  getHeaders() {
    return Object.fromEntries(this.#headers);
  }

  hasHeader(name) {
    return this.#headers.has(name.toLowerCase());
  }

  removeHeader(name) {
    this.#headers.delete(name.toLowerCase());
  }

  get statusCode() {
    throw new Error("statusCode is not implemented");
  }

  set statusCode(code) {
    throw new Error("set statusCode is not implemented");
  }

  get statusMessage() {
    throw new Error("statusMessage is not implemented");
  }

  set statusMessage(message) {
    throw new Error("set statusMessage is not implemented");
  }

  get socket() {
    throw new Error("socket is not implemented");
  }

  get sendDate() {
    throw new Error("sendDate is not implemented");
  }

  flushHeaders() {
    throw new Error("flushHeaders is not implemented");
  }

  end() {
    throw new Error("end is not implemented");
  }

  cork() {
    throw new Error("cork is not implemented");
  }

  uncork() {
    throw new Error("uncork is not implemented");
  }

  addTrailers() {
    throw new Error("addTrailers is not implemented");
  }

  setTimeout(_msecs, _callback) {
    throw new Error("setTimeout is not implemented");
  }

  get writableEnded() {
    throw new Error("writableEnded is not implemented");
  }

  get writableFinished() {
    throw new Error("writableFinished is not implemented");
  }

  write(_chunk, _encoding, _callback) {
    throw new Error("write is not implemented");
  }

  writeContinue() {
    throw new Error("writeContinue is not implemented");
  }

  writeHead(_statusCode, _statusMessage, _headers) {
    throw new Error("writeHead is not implemented");
  }

  writeProcessing() {
    throw new Error("writeProcessing is not implemented");
  }
}

async function operation(renderData) {
  // TODO(alexkirsz) This is missing *a lot* of data, but it's enough to get a
  // basic render working.

  /* BuildManifest */
  const buildManifest = {
    pages: {
      // TODO(alexkirsz) We should separate _app and page chunks. Right now, we
      // computing the chunk items of `next-hydrate.js`, so they contain both
      // _app and page chunks.
      "/_app": [],
      [renderData.path]: chunkGroup,
    },

    devFiles: [],
    ampDevFiles: [],
    polyfillFiles: [],
    lowPriorityFiles: [],
    rootMainFiles: [],
    ampFirstPages: [],
  };

  const renderOpts = {
    /* LoadComponentsReturnType */
    Component,
    App,
    Document,
    pageConfig: {},
    buildManifest,
    reactLoadableManifest: {},
    ComponentMod: {
      default: Component,
      ...otherExports,
    },
    pathname: renderData.path,
    buildId: "",

    /* RenderOptsPartial */
    assetPrefix: "",
    canonicalBase: "",
    previewProps: {
      previewModeId: "",
      previewModeEncryptionKey: "",
      previewModeSigningKey: "",
    },
    basePath: "",
    optimizeFonts: false,
    optimizeCss: false,
    nextScriptWorkers: false,
    images: {
      deviceSizes: [],
      imageSizes: [],
      loader: "default",
      path: "",
      domains: [],
      disableStaticImages: false,
      minimumCacheTTL: 0,
      formats: [],
      dangerouslyAllowSVG: false,
      contentSecurityPolicy: "",
      remotePatterns: [],
      unoptimized: true,
    },
  };

  if ("getStaticProps" in otherExports) {
    renderOpts.getStaticProps = otherExports.getStaticProps;
  }
  if ("getServerSideProps" in otherExports) {
    renderOpts.getServerSideProps = otherExports.getServerSideProps;
  }

  const req = {
    url: renderData.url,
    method: "GET",
    headers: renderData.headers,
  };
  const res = new ServerResponse(req);
  const query = { ...renderData.query, ...renderData.params };

  return (
    await renderToHTML(
      /* req: IncomingMessage */
      req,
      /* res: ServerResponse */
      res,
      /* pathname: string */
      renderData.path,
      /* query: ParsedUrlQuery */
      query,
      /* renderOpts: RenderOpts */
      renderOpts
    )
  ).toUnchunkedString();
}
