import type { Ipc } from "@vercel/turbopack-next/ipc/index";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Buffer } from "node:buffer";
import { createServer, makeRequest } from "@vercel/turbopack-next/ipc/server";
import loadNextConfig from "@vercel/turbopack-next/entry/config/next";

import "next/dist/server/node-polyfill-fetch.js";

type RouterRequest = {
  method: string;
  pathname: string;
  // TODO: not passed to request
  headers: Record<string, string>;
  query: Record<string, string>;
};

type RouteResult = {
  url: string;
  headers: Record<string, string>;
};

type IpcOutgoingMessage = {
  type: "jsonValue";
  data: string;
};

type MessageData =
  | { type: "middleware-headers"; data: MiddlewareHeadersResponse }
  | { type: "middleware-body"; data: Uint8Array }
  | {
      type: "full-middleware";
      data: { headers: MiddlewareHeadersResponse; body: number[] };
    }
  | {
      type: "rewrite";
      data: RewriteResponse;
    };

type RewriteResponse = {
  url: string;
  headers: string[];
};

type MiddlewareHeadersResponse = {
  statusCode: number;
  headers: string[];
};

let resolveRouteMemo: Promise<
  (req: IncomingMessage, res: ServerResponse) => Promise<unknown>
>;
async function getResolveRoute(dir: string) {
  // Deferring the import allows us to not error while we wait for Next.js to implement.
  const { makeResolver } = (await import("next/dist/server/router.js")) as any;
  const nextConfig = await loadNextConfig();
  return await makeResolver(dir, nextConfig);
}

export default async function route(
  ipc: Ipc<RouterRequest, IpcOutgoingMessage>,
  routerRequest: RouterRequest,
  dir: string
) {
  const [resolveRoute, server] = await Promise.all([
    (resolveRouteMemo ??= getResolveRoute(dir)),
    createServer(),
  ]);

  try {
    const {
      clientRequest,
      clientResponsePromise,
      serverRequest,
      serverResponse,
    } = await makeRequest(
      server,
      routerRequest.method,
      routerRequest.pathname,
      routerRequest.query,
      routerRequest.headers
    );

    // Send the clientRequest, so the server parses everything. We can then pass
    // the serverRequest to Next.js to handle.
    clientRequest.end();

    const [_, response] = await Promise.all([
      resolveRoute(serverRequest, serverResponse),
      handleClientResponse(ipc, clientResponsePromise),
    ]);
    server.close();

    return response;
  } catch (e) {
    ipc.sendError(e as Error);
  }
}

async function handleClientResponse(
  _ipc: Ipc<RouterRequest, IpcOutgoingMessage>,
  clientResponsePromise: Promise<IncomingMessage>
): Promise<MessageData | void> {
  const clientResponse = await clientResponsePromise;

  if (clientResponse.headers["x-nextjs-route-result"] === "1") {
    clientResponse.setEncoding("utf8");
    // We're either a redirect or a rewrite
    let buffer = "";
    for await (const chunk of clientResponse) {
      buffer += chunk;
    }

    const data = JSON.parse(buffer) as RouteResult;
    return {
      type: "rewrite",
      data: {
        url: data.url,
        headers: Object.entries(data.headers).flat(),
      },
    };
  }

  const responseHeaders: MiddlewareHeadersResponse = {
    statusCode: clientResponse.statusCode!,
    headers: clientResponse.rawHeaders,
  };

  // TODO: support streaming middleware
  // ipc.send({
  //   type: "jsonValue",
  //   data: JSON.stringify({
  //     type: "middleware-headers",
  //     data: responseHeaders,
  //   }),
  // });
  // ipc.send({
  //   type: "jsonValue",
  //   data: JSON.stringify({
  //     type: "middleware-body",
  //     data: chunk as Buffer,
  //   }),
  // });

  const buffers = [];
  for await (const chunk of clientResponse) {
    buffers.push(chunk as Buffer);
  }
  return {
    type: "full-middleware",
    data: {
      headers: responseHeaders,
      body: Buffer.concat(buffers).toJSON().data,
    },
  };
}
