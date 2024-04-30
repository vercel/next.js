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
    onError?: (error: unknown, errorInfo: unknown) => string | undefined
    onPostpone?: (reason: string) => void
    unstable_externalRuntimeSrc?: string | BootstrapScriptDescriptor
  }

  export function resume(
    children: JSX.Element,
    postponedState: object,
    options?: {
      onError?: (error: Error, errorInfo: unknown) => void
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
    onError?: (error: unknown, errorInfo: unknown) => string | undefined
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
    onError?: (error: unknown, errorInfo: unknown) => string | undefined
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
      onError?: (error: Error, errorInfo: unknown) => void
      onHeaders?: (headers: Headers) => void
    }
  ): Promise<{
    prelude: ReadableStream<Uint8Array>
    postponed: object | null
  }>
}

declare module 'react-dom/server.node' {
  import type { Writable } from 'node:stream'

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js#L320
  interface BootstrapScriptDescriptor {
    src: string
    integrity?: string
    crossOrigin?: string
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-server/src/ReactFizzServer.js#L790
  interface ThrownInfo {
    componentStack?: string
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-server/src/ReactFizzServer.js#L793
  type ErrorInfo = ThrownInfo
  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-server/src/ReactFizzServer.js#L794
  type PostponeInfo = ThrownInfo

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/shared/ReactDOMTypes.js#L110
  interface ImportMap {
    imports?: {
      [specifier: string]: string
    }
    scopes?: {
      [scope: string]: {
        [specifier: string]: string
      }
    }
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/shared/ReactTypes.js#L164
  type ReactFormState<S, ReferenceId> = [
    S /* actual state value */,
    string /* key path */,
    ReferenceId /* Server Reference ID */,
    number /* number of bound arguments */
  ]

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js#L103
  interface HeadersDescriptor {
    Link?: string
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzServerNode.js#L56
  export interface Options {
    identifierPrefix?: string
    namespaceURI?: string
    nonce?: string
    bootstrapScriptContent?: string
    bootstrapScripts?: Array<string | BootstrapScriptDescriptor>
    bootstrapModules?: Array<string | BootstrapScriptDescriptor>
    progressiveChunkSize?: number
    onShellReady?: () => void
    onShellError?: (error: unknown) => void
    onAllReady?: () => void
    onError?: (
      error: unknown,
      errorInfo: ErrorInfo
    ) => string | undefined | null
    onPostpone?: (reason: string, postponeInfo: PostponeInfo) => void
    unstable_externalRuntimeSrc?: string | BootstrapScriptDescriptor
    importMap?: ImportMap
    formState?: ReactFormState<any, any> | null
    onHeaders?: (headers: HeadersDescriptor) => void
    maxHeadersLength?: number
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzServerNode.js#L85
  interface PipeableStream {
    abort(reason: unknown): void
    pipe<T extends Writable>(destination: T): T
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzServerNode.js#L123
  export function renderToPipeableStream(
    children: JSX.Element,
    options?: Options
  ): Promise<PipeableStream>
}
