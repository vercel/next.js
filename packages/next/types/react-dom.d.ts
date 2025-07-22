import type { JSX } from 'react'

declare module 'react-dom/server' {
  /**
   * Options for `resume`.
   *
   * https://github.com/facebook/react/blob/aec521a96d3f1bebc2ba38553d14f4989c6e88e0/packages/react-dom/src/server/ReactDOMFizzServerEdge.js#L54-L60
   */
  export type ResumeOptions = {
    nonce?: string
    signal?: AbortSignal
    onError?: (error: unknown) => string | undefined | void
    onPostpone?: (reason: string) => void
    unstable_externalRuntimeSrc?: string | BootstrapScriptDescriptor
  }

  export function resume(
    children: JSX.Element,
    postponedState: object,
    options?: ResumeOptions
  ): Promise<ReadableStream<Uint8Array>>

  /**
   * Options for `renderToReadableStream`.
   *
   * https://github.com/facebook/react/blob/aec521a96d3f1bebc2ba38553d14f4989c6e88e0/packages/react-dom/src/server/ReactDOMFizzServerEdge.js#L36-L52
   */
  export interface RenderToReadableStreamOptions {
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
}

declare module 'react-dom/static' {
  /**
   * Options for `prerender`.
   *
   * https://github.com/facebook/react/blob/aec521a96d3f1bebc2ba38553d14f4989c6e88e0/packages/react-dom/src/server/ReactDOMFizzStaticEdge.js#L35-L49
   */
  export interface PrerenderOptions {
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

  interface PrerenderResult {
    postponed: object | null
  }
}
