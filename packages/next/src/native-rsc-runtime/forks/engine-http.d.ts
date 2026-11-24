// `#engine-http`: the engine's side of the adapter contract (`handler(req, res, ctx)` on
// Node), for the bridge. Only the bridge imports it: the renderer never sees HTTP. This
// is the type every engine fork (`engine-http.<engine>.ts`) must satisfy; the
// precompile resolves the alias to one fork per bundle type.

declare const hostRequest: unique symbol
declare const hostResponse: unique symbol

// The engine's request, opaque outside the fork. On Node, it's the server's `req`.
export interface HostRequest {
  readonly [hostRequest]: true
}

// The engine's response, opaque outside the fork. On Node, it's the server's `res`.
export interface HostResponse {
  readonly [hostResponse]: true
}

// The request's method, in upper case.
export function requestMethod(req: HostRequest): string

// A signal that aborts when the client goes away.
export function requestSignal(res: HostResponse): AbortSignal

// Writes the status, then the headers, each replacing any value already set for it, then
// the body. Resolves when the response is done. A client that went away isn't an error.
export function writeResponse(
  res: HostResponse,
  status: number,
  headers: ReadonlyArray<readonly [string, string]>,
  body: ReadableStream<Uint8Array>
): Promise<void>
