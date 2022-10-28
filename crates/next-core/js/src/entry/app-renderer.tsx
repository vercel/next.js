import type { Ipc } from "@vercel/turbopack-next/internal/ipc";

// Provided by the rust generate code
declare global {
  // an array of all layouts and the page
  const LAYOUT_INFO: { segment: string; module: any; chunks: string[] }[];
  // array of chunks for the bootstrap script
  const BOOTSTRAP: string[];
  const IPC: Ipc<unknown, unknown>;
}

import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  FlightCSSManifest,
  FlightManifest,
} from "next/dist/build/webpack/plugins/flight-manifest-plugin";
import type { RenderData } from "types/turbopack";

import "next/dist/server/node-polyfill-fetch";
import "next/dist/server/node-polyfill-web-streams";
import { RenderOpts, renderToHTMLOrFlight } from "next/dist/server/app-render";
import { PassThrough } from "stream";
import { ServerResponseShim } from "@vercel/turbopack-next/internal/http";
import { structuredError } from "@vercel/turbopack-next/internal/error";
import { ParsedUrlQuery } from "node:querystring";

globalThis.__next_require__ = (data) => {
  const [, , ssr_id] = JSON.parse(data);
  return __turbopack_require__(ssr_id);
};
globalThis.__next_chunk_load__ = () => Promise.resolve();

process.env.__NEXT_NEW_LINK_BEHAVIOR = "true";

const ipc = IPC as Ipc<IpcIncomingMessage, IpcOutgoingMessage>;

type IpcIncomingMessage = {
  type: "headers";
  data: RenderData;
};

type IpcOutgoingMessage = {
  type: "result";
  result: string | { body: string; contentType?: string };
};

(async () => {
  while (true) {
    const msg = await ipc.recv();

    let renderData: RenderData;
    switch (msg.type) {
      case "headers": {
        renderData = msg.data;
        break;
      }
      default: {
        console.error("unexpected message type", msg.type);
        process.exit(1);
      }
    }

    const html = await runOperation(renderData);

    if (html == null) {
      throw new Error("no html returned");
    }

    ipc.send({
      type: "result",
      result: html,
    });
  }
})().catch((err) => {
  ipc.sendError(err);
});

// TODO expose these types in next.js
type ComponentModule = () => any;
export type ComponentsType = {
  readonly [componentKey in
    | "layout"
    | "template"
    | "error"
    | "loading"
    | "not-found"]?: ComponentModule;
} & {
  readonly layoutOrPagePath?: string;
  readonly page?: ComponentModule;
};
type LoaderTree = [
  segment: string,
  parallelRoutes: { [parallelRouterKey: string]: LoaderTree },
  components: ComponentsType
];

type ServerComponentsManifest = {
  [id: string]: ServerComponentsManifestModule;
};
type ServerComponentsManifestModule = {
  [exportName: string]: { id: string; chunks: string[]; name: string };
};

async function runOperation(renderData: RenderData) {
  const pageItem = LAYOUT_INFO[LAYOUT_INFO.length - 1];
  const pageModule = pageItem.module;
  const Page = pageModule.default;
  let tree: LoaderTree = [
    "",
    {},
    { page: () => Page, layoutOrPagePath: "page.js" },
  ];
  for (let i = LAYOUT_INFO.length - 2; i >= 0; i--) {
    const info = LAYOUT_INFO[i];
    const mod = info.module;
    if (mod) {
      const Layout = mod.default;
      tree = [
        info.segment,
        { children: tree },
        { layout: () => Layout, layoutOrPagePath: `layout${i}.js` },
      ];
    } else {
      tree = [
        info.segment,
        { children: tree },
        { layoutOrPagePath: `layout${i}.js` },
      ];
    }
  }

  const proxyMethodsForModule = (
    id: string,
    css: boolean
  ): ProxyHandler<FlightManifest[""]> => ({
    get(target, name, receiver) {
      return {
        id,
        chunks: JSON.parse(id)[1],
        name,
      };
    },
  });
  const proxyMethods = (css: boolean): ProxyHandler<FlightManifest> => {
    return {
      get(target, name, receiver) {
        if (name === "__ssr_module_mapping__") {
          return manifest;
        }
        if (name === "__client_css_manifest__") {
          return {};
        }
        return new Proxy({}, proxyMethodsForModule(name as string, css));
      },
    };
  };
  const manifest: FlightManifest = new Proxy({} as any, proxyMethods(false));
  const serverCSSManifest: FlightCSSManifest = {};
  serverCSSManifest.__entry_css__ = {};
  for (let i = 0; i < LAYOUT_INFO.length - 1; i++) {
    const { chunks } = LAYOUT_INFO[i];
    const cssChunks = (chunks || []).filter((path) => path.endsWith(".css"));
    serverCSSManifest[`layout${i}.js`] = cssChunks.map((chunk) =>
      JSON.stringify([chunk, [chunk]])
    );
  }
  serverCSSManifest.__entry_css__ = {
    page: pageItem.chunks
      .filter((path) => path.endsWith(".css"))
      .map((chunk) => JSON.stringify([chunk, [chunk]])),
  };
  serverCSSManifest["page.js"] = serverCSSManifest.__entry_css__.page;
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
      rootMainFiles: LAYOUT_INFO.flatMap(({ chunks }) => chunks || [])
        .concat(BOOTSTRAP)
        .filter((path) => !path.endsWith(".css")),
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
      pages: ["page.js"],
    },
    serverComponentManifest: manifest,
    serverCSSManifest,
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
