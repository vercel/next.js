declare module 'react-dom/server-rendering-stub'
declare module 'react-dom/server.browser'

declare module 'react-dom/server.edge' {
  export function resume(
    children: JSX.Element,
    postponedState: object,
    options?: {
      onError?: (error: Error) => void
    }
  ): Promise<ReadableStream<Uint8Array>>

  export function renderToReadableStream(
    children: JSX.Element,
    options?: {
      onError?: (error: Error) => void
      nonce?: string
    }
  ): Promise<
    ReadableStream<Uint8Array> & {
      allReady: Promise<void>
    }
  >
}

declare module 'react-dom/static.edge' {
  export function prerender(
    children: JSX.Element,
    options?: {
      onError?: (error: Error) => void
    }
  ): Promise<{
    prelude: ReadableStream<Uint8Array>
    postponed: object | null
  }>
}
