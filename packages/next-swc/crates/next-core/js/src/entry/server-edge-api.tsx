// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from "@vercel/turbopack-next/internal/api-server-handler";

import { join } from "path";

import "next/dist/server/node-polyfill-fetch.js";

("TURBOPACK { transition: next-edge }");
import chunkGroup from ".";

import type {
  BaseNextRequest,
  BaseNextResponse,
} from "next/dist/server/base-http";
import {
  NodeNextRequest,
  NodeNextResponse,
} from "next/dist/server/base-http/node";
import type { ParsedUrlQuery } from "querystring";
import type { Params } from "next/dist/shared/lib/router/utils/route-matcher";
import { FetchEventResult } from "next/dist/server/web/types";
import { getClonableBody } from "next/dist/server/body-streams";

startHandler(async ({ request, response, query, params, path }) => {
  await runEdgeFunction({
    req: new NodeNextRequest(request),
    res: new NodeNextResponse(response),
    query,
    params,
    path,
    onWarning(warning) {
      console.warn(warning);
    },
  });
});

async function runEdgeFunction({
  req,
  res,
  query,
  params,
  path,
  onWarning,
}: {
  req: BaseNextRequest | NodeNextRequest;
  res: BaseNextResponse | NodeNextResponse;
  query: ParsedUrlQuery;
  path: string;
  params: Params | undefined;
  onWarning?: (warning: Error) => void;
}): Promise<FetchEventResult | null> {
  const edgeInfo = {
    name: "edge",
    paths: chunkGroup.map((chunk: string) => join(process.cwd(), chunk)),
    wasm: [],
    env: [],
    assets: [],
  };

  // For edge to "fetch" we must always provide an absolute URL
  const initialUrl = new URL(path, "http://n");
  const queryString = urlQueryToSearchParams({
    ...Object.fromEntries(initialUrl.searchParams),
    ...query,
  }).toString();

  initialUrl.search = queryString;
  const url = initialUrl.toString();

  if (!url.startsWith("http")) {
    throw new Error(
      "To use middleware you must provide a `hostname` and `port` to the Next.js Server"
    );
  }

  const { run } = require("next/dist/server/web/sandbox");
  const result = (await run({
    distDir: process.cwd(),
    name: edgeInfo.name,
    paths: edgeInfo.paths,
    env: edgeInfo.env,
    edgeFunctionEntry: edgeInfo,
    request: {
      headers: req.headers,
      method: req.method,
      nextConfig: {
        basePath: "/",
        i18n: undefined,
        trailingSlash: true,
      },
      url,
      page: {
        name: path,
        ...(params && { params: params }),
      },
      body: getClonableBody(req.body),
    },
    useCache: false,
    onWarning,
  })) as FetchEventResult;

  res.statusCode = result.response.status;
  res.statusMessage = result.response.statusText;

  result.response.headers.forEach((value: string, key) => {
    // the append handling is special cased for `set-cookie`
    if (key.toLowerCase() === "set-cookie") {
      res.setHeader(key, value);
    } else {
      res.appendHeader(key, value);
    }
  });

  if (result.response.body) {
    // TODO(gal): not sure that we always need to stream
    const nodeResStream = (res as NodeNextResponse).originalResponse;
    const {
      consumeUint8ArrayReadableStream,
    } = require("next/dist/compiled/edge-runtime");
    try {
      for await (const chunk of consumeUint8ArrayReadableStream(
        result.response.body
      )) {
        nodeResStream.write(chunk);
      }
    } finally {
      nodeResStream.end();
    }
  } else {
    (res as NodeNextResponse).originalResponse.end();
  }

  return result;
}

function stringifyUrlQueryParam(param: unknown): string {
  if (
    typeof param === "string" ||
    (typeof param === "number" && !isNaN(param)) ||
    typeof param === "boolean"
  ) {
    return String(param);
  } else {
    return "";
  }
}

function urlQueryToSearchParams(urlQuery: ParsedUrlQuery): URLSearchParams {
  const result = new URLSearchParams();
  Object.entries(urlQuery).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => result.append(key, stringifyUrlQueryParam(item)));
    } else {
      result.set(key, stringifyUrlQueryParam(value));
    }
  });
  return result;
}
