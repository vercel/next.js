// Provided by the rust generate code
declare global {
  // an array of all layouts and the page
  const LAYOUT_INFO: { segment: string; module: any; chunks: string[] }[];
  // array of chunks for the bootstrap script
  const BOOTSTRAP: string[];
}

import type { IncomingMessage, ServerResponse } from "node:http";
import type { FlightManifest } from "next/dist/build/webpack/plugins/flight-manifest-plugin";
import type { RenderData } from "types/turbopack";

import "next/dist/server/node-polyfill-fetch";
import "next/dist/server/node-polyfill-web-streams";
import { RenderOpts, renderToHTMLOrFlight } from "next/dist/server/app-render";
import { PassThrough } from "stream";
import { ServerResponseShim } from "@vercel/turbopack-next/internal/http";
import { ParsedUrlQuery } from "node:querystring";
import { parse as parseStackTrace } from "@vercel/turbopack-next/compiled/stacktrace-parser";

globalThis.__next_require__ = (data) => {
  const [ssr_id] = JSON.parse(data);
  return __turbopack_require__(ssr_id);
};
globalThis.__next_chunk_load__ = () => Promise.resolve();

process.env.__NEXT_NEW_LINK_BEHAVIOR = "true";

const [MARKER, _OPERATION_STEP, OPERATION_SUCCESS, _OPERATION_ERROR] =
  process.argv.slice(2, 6).map((arg) => Buffer.from(arg, "utf8"));

const NEW_LINE = "\n".charCodeAt(0);
const OPERATION_SUCCESS_MARKER = Buffer.concat([
  OPERATION_SUCCESS,
  Buffer.from(" ", "utf8"),
  MARKER,
]);

process.stdout.write("READY\n");

const buffer: Buffer[] = [];
process.stdin.on("data", async (data) => {
  let idx = data.indexOf(NEW_LINE);
  while (idx >= 0) {
    buffer.push(data.slice(0, idx));
    const str = Buffer.concat(buffer).toString("utf-8");
    buffer.length = 0;
    let json: any;
    try {
      json = JSON.parse(str);
      buffer.length = 0;
    } catch (e: any) {
      const input =
        str.length > 100 ? `${str.slice(0, 30)}...${str.slice(-30)}` : str;
      e.message += `\nduring processing input ${input}`;
      console.log(`ERROR=${JSON.stringify(structuredError(e))}`);
    }
    try {
      const result = await operation(json);
      console.log(`RESULT=${JSON.stringify(result)}`);
    } catch (e: any) {
      console.log(`ERROR=${JSON.stringify(structuredError(e))}`);
    }
    console.log(OPERATION_SUCCESS_MARKER.toString("utf8"));
    data = data.slice(idx + 1);
    idx = data.indexOf(NEW_LINE);
  }
  buffer.push(data);
});

type LayoutTree = [
  string,
  { children?: LayoutTree },
  { page: () => any } | { layout: () => any }
];

type ServerComponentsManifest = {
  [id: string]: ServerComponentsManifestModule;
};
type ServerComponentsManifestModule = {
  [exportName: string]: { id: string; chunks: string[]; name: string };
};

async function operation(renderData: RenderData) {
  const pageModule = LAYOUT_INFO[LAYOUT_INFO.length - 1].module;
  const Page = pageModule.default;
  let tree: LayoutTree = ["", {}, { page: () => Page }];
  for (let i = LAYOUT_INFO.length - 2; i >= 0; i--) {
    const info = LAYOUT_INFO[i];
    const Layout = info.module.default;
    tree = [info.segment, { children: tree }, { layout: () => Layout }];
  }

  const proxyMethodsForModule = (
    id: string
  ): ProxyHandler<FlightManifest[""]> => ({
    get(target, name, receiver) {
      return {
        id,
        chunks: JSON.parse(id)[2],
        name,
      };
    },
  });
  const proxyMethods: ProxyHandler<FlightManifest> = {
    get(target, name, receiver) {
      if (name === "__ssr_module_mapping__") {
        return manifest;
      }
      return new Proxy({}, proxyMethodsForModule(name as string));
    },
  };
  const manifest: FlightManifest = new Proxy({} as any, proxyMethods);
  const req: IncomingMessage = {
    url: renderData.url,
    method: renderData.method,
    headers: renderData.headers,
  } as any;
  const res: ServerResponse = new ServerResponseShim(req) as any;
  const renderOpt: Omit<
    RenderOpts,
    "App" | "Document" | "Component" | "pathname"
  > & { params: ParsedUrlQuery } = {
    params: renderData.params,
    supportsDynamicHTML: true,
    dev: true,
    buildManifest: {
      polyfillFiles: [],
      rootMainFiles: LAYOUT_INFO.flatMap(({ chunks }) => chunks).concat(
        BOOTSTRAP
      ),
      devFiles: [],
      ampDevFiles: [],
      lowPriorityFiles: [],
      pages: {
        "/_app": [],
      },
      ampFirstPages: [],
    },
    ComponentMod: {
      ...pageModule,
      default: undefined,
      tree,
      pages: [],
    },
    serverComponentManifest: manifest,
    serverCSSManifest: {},
    runtime: "nodejs",
    serverComponents: true,
    assetPrefix: "",
    pageConfig: pageModule.config,
    reactLoadableManifest: {},
  };
  const result = await renderToHTMLOrFlight(
    req,
    res,
    renderData.path,
    {
      ...renderData.query,
      ...renderData.params,
    },
    renderOpt as any as RenderOpts
  );

  if (!result) throw new Error("rendering was not successful");

  let body;
  if (result.isDynamic()) {
    const stream = new PassThrough();
    result.pipe(stream);

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString();
  } else {
    body = result.toUnchunkedString();
  }
  return {
    contentType: result.contentType(),
    body,
  };
}

// This utility is based on https://github.com/zertosh/htmlescape
// License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE

const ESCAPE_LOOKUP = {
  "&": "\\u0026",
  ">": "\\u003e",
  "<": "\\u003c",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

const ESCAPE_REGEX = /[&><\u2028\u2029]/g;

export function htmlEscapeJsonString(str: string) {
  return str.replace(
    ESCAPE_REGEX,
    (match) => ESCAPE_LOOKUP[match as keyof typeof ESCAPE_LOOKUP]
  );
}

function structuredError(e: Error) {
  return {
    name: e.name,
    message: e.message,
    stack: parseStackTrace(e.stack!),
  };
}
