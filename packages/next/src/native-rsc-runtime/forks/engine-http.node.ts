// The Node engine fork of `#engine-http` (see engine-http.d.ts). It uses App Router's
// helpers, so a response behaves the same on either runtime when the client goes away.

import type { IncomingMessage, ServerResponse } from 'node:http'
import { pipeToNodeResponse } from 'next/dist/server/pipe-readable'
import { createAbortController } from 'next/dist/server/web/spec-extension/adapters/next-request'

export function requestMethod(req: IncomingMessage): string {
  return req.method ?? 'GET'
}

export function requestSignal(res: ServerResponse): AbortSignal {
  return createAbortController(res).signal
}

export async function writeResponse(
  res: ServerResponse,
  status: number,
  headers: ReadonlyArray<readonly [string, string]>,
  body: ReadableStream<Uint8Array>
): Promise<void> {
  res.statusCode = status
  // Replaces what router-server already set from the config or middleware, as App
  // Router does.
  for (const [name, value] of headers) res.setHeader(name, value)
  await pipeToNodeResponse(body, res)
}
