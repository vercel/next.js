// Next.js resolves these to its vendored React builds; declare what the fixture uses.
declare module 'react-server-dom-webpack/server' {
  export function renderToReadableStream(
    model: unknown,
    clientModules: unknown
  ): ReadableStream<Uint8Array>
}

declare module 'react-server-dom-webpack/client' {
  export function createFromFetch<T>(response: Promise<Response>): Promise<T>
}
