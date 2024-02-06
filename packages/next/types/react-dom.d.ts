declare module 'react-dom/server-rendering-stub'
declare module 'react-dom/server.browser'

declare module 'react-dom/server.edge' {
  /**
   * https://github.com/facebook/react/blob/aec521a96d3f1bebc2ba38553d14f4989c6e88e0/packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js#L329-L333
   */
  type BootstrapScriptDescriptor = {
    src: string
    integrity?: string
    crossOrigin?: string
  }

  /**
   * Options for `resume`.
   *
   * https://github.com/facebook/react/blob/aec521a96d3f1bebc2ba38553d14f4989c6e88e0/packages/react-dom/src/server/ReactDOMFizzServerEdge.js#L54-L60
   */
  export type ResumeOptions = {
    nonce?: string
    signal?: AbortSignal
    onError?: (error: unknown) => string | undefined
    onPostpone?: (reason: string) => void
    unstable_externalRuntimeSrc?: string | BootstrapScriptDescriptor
  }

  export function resume(
    children: JSX.Element,
    postponedState: object,
    options?: {
      onError?: (error: Error) => void
    }
  ): Promise<ReadableStream<Uint8Array>>

  /**
   * Options for `renderToReadableStream`.
   *
   * https://github.com/facebook/react/blob/aec521a96d3f1bebc2ba38553d14f4989c6e88e0/packages/react-dom/src/server/ReactDOMFizzServerEdge.js#L36-L52
   */
  export type Options = {
    identifierPrefix?: string
    namespaceURI?: string
    nonce?: string
    bootstrapScriptContent?: string
    bootstrapScripts?: Array<string | BootstrapScriptDescriptor>
    bootstrapModules?: Array<string | BootstrapScriptDescriptor>
    progressiveChunkSize?: number
    signal?: AbortSignal
    onError?: (error: unknown) => string | undefined
    onPostpone?: (reason: string) => void
    unstable_externalRuntimeSrc?: string | BootstrapScriptDescriptor
    importMap?: {
      imports?: {
        [specifier: string]: string
      }
      scopes?: {
        [scope: string]: {
          [specifier: string]: string
        }
      }
    }
    formState?: unknown
    onHeaders?: (headers: Headers) => void
    maxHeadersLength?: number
  }

  export function renderToReadableStream(
    children: JSX.Element,
    options?: Options
  ): Promise<
    ReadableStream<Uint8Array> & {
      allReady: Promise<void>
    }
  >
}

declare module 'react-dom/static.edge' {
  /**
   * https://github.com/facebook/react/blob/aec521a96d3f1bebc2ba38553d14f4989c6e88e0/packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js#L329-L333
   */
  type BootstrapScriptDescriptor = {
    src: string
    integrity?: string
    crossOrigin?: string
  }

  /**
   * Options for `prerender`.
   *
   * https://github.com/facebook/react/blob/aec521a96d3f1bebc2ba38553d14f4989c6e88e0/packages/react-dom/src/server/ReactDOMFizzStaticEdge.js#L35-L49
   */
  export type Options = {
    identifierPrefix?: string
    namespaceURI?: string
    bootstrapScriptContent?: string
    bootstrapScripts?: Array<string | BootstrapScriptDescriptor>
    bootstrapModules?: Array<string | BootstrapScriptDescriptor>
    progressiveChunkSize?: number
    signal?: AbortSignal
    onError?: (error: unknown) => string | undefined
    onPostpone?: (reason: string) => void
    unstable_externalRuntimeSrc?: string | BootstrapScriptDescriptor
    importMap?: {
      imports?: {
        [specifier: string]: string
      }
      scopes?: {
        [scope: string]: {
          [specifier: string]: string
        }
      }
    }
    onHeaders?: (headers: Headers) => void
    maxHeadersLength?: number
  }

  export function prerender(
    children: JSX.Element,
    options?: {
      onError?: (error: Error) => void
      onHeaders?: (headers: Headers) => void
    }
  ): Promise<{
    prelude: ReadableStream<Uint8Array>
    postponed: object | null
  }>
}
