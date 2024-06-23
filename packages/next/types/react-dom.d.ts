declare module 'react-dom/server.browser'

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
  number /* number of bound arguments */,
]

// https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js#L103
// interface HeadersDescriptor {
//   Link?: string
// }
type HeadersDescriptor = Record<string, string | string[]>

declare module 'react-dom/types' {
  // https://github.com/facebook/react/blob/4508873393058e86bed308b56e49ec883ece59d1/packages/react-server/src/ReactFizzServer.js#L4482
  interface PostponedState {
    nextSegmentId: number
    // Unused in `packages/next/src`
    rootFormatContext: unknown
    progressiveChunkSize: number
    // Unused in `packages/next/src`
    resumableState: unknown
    // Unused in `packages/next/src`
    replayNodes: unknown
    // Unused in `packages/next/src`
    replaySlots: unknown
  }
}

declare module 'react-dom/server.edge' {
  import type { JSX } from 'react'

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzServerEdge.js#L67
  export type ReactDOMServerReadableStream = ReadableStream<Uint8Array> & {
    allReady: Promise<void>
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzServerEdge.js#L58
  export type ResumeOptions = {
    nonce?: string
    signal?: AbortSignal
    onError?: (error: unknown) => string | undefined | null | void
    onPostpone?: (reason: string) => void
    unstable_externalRuntimeSrc?: string | BootstrapScriptDescriptor
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzServerEdge.js#L162
  export function resume(
    children: JSX.Element,
    postponedState: unknown,
    options?: ResumeOptions
  ): Promise<ReactDOMServerReadableStream>

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzServerEdge.js#L40
  export type Options = {
    identifierPrefix?: string
    namespaceURI?: string
    nonce?: string
    bootstrapScriptContent?: string
    bootstrapScripts?: Array<string | BootstrapScriptDescriptor>
    bootstrapModules?: Array<string | BootstrapScriptDescriptor>
    progressiveChunkSize?: number
    signal?: AbortSignal
    onError?: (
      error: unknown,
      errorInfo: ErrorInfo
    ) => string | undefined | null | void
    onPostpone?: (reason: string, postponeInfo: PostponeInfo) => void
    unstable_externalRuntimeSrc?: string | BootstrapScriptDescriptor
    importMap?: ImportMap
    formState?: ReactFormState<any, any> | null
    onHeaders?: (headers: Headers) => void
    maxHeadersLength?: number
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzServerEdge.js#L71
  export function renderToReadableStream(
    children: JSX.Element,
    options?: Options
  ): Promise<ReactDOMServerReadableStream>
}

declare module 'react-dom/static.edge' {
  import type { PostponedState } from 'react-dom/types'
  import type { JSX } from 'react'

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzStaticEdge.js#L39
  export type Options = {
    identifierPrefix?: string
    namespaceURI?: string
    bootstrapScriptContent?: string
    bootstrapScripts?: Array<string | BootstrapScriptDescriptor>
    bootstrapModules?: Array<string | BootstrapScriptDescriptor>
    progressiveChunkSize?: number
    signal?: AbortSignal
    onError?: (
      error: unknown,
      errorInfo: ErrorInfo
    ) => string | undefined | null | void
    onPostpone?: (reason: string, postponeInfo: PostponeInfo) => void
    unstable_externalRuntimeSrc?: string | BootstrapScriptDescriptor
    importMap?: ImportMap
    onHeaders?: (headers: Headers) => void
    maxHeadersLength?: number
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzStaticEdge.js#L55
  export type StaticResult = {
    postponed: null | PostponedState
    prelude: ReadableStream<Uint8Array>
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzStaticEdge.js#L60
  export function prerender(
    children: JSX.Element,
    options?: Options
  ): Promise<StaticResult>
}

declare module 'react-dom/server.node' {
  import type { JSX } from 'react'
  import type { Writable } from 'node:stream'
  import type { PostponedState } from 'react-dom/types'

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
    ) => string | undefined | null | void
    onPostpone?: (reason: string, postponeInfo: PostponeInfo) => void
    unstable_externalRuntimeSrc?: string | BootstrapScriptDescriptor
    importMap?: ImportMap
    formState?: ReactFormState<any, any> | null
    onHeaders?: (headers: HeadersDescriptor) => void
    maxHeadersLength?: number
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzServerNode.js#L85
  export interface PipeableStream {
    abort(reason: unknown): void
    pipe<T extends Writable>(destination: T): T
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzServerNode.js#L123
  export function renderToPipeableStream(
    children: JSX.Element,
    options?: Options
  ): PipeableStream

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzServerNode.js#L76
  export interface ResumeOptions {
    nonce?: string
    onShellReady?: () => void
    onShellError?: (error: unknown) => void
    onAllReady?: () => void
    onError?: (
      error: unknown,
      errorInfo: ErrorInfo
    ) => string | undefined | null | void
    onPostpone?: (reason: string, postponeInfo: PostponeInfo) => void
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzServerNode.js#L181
  export function resumeToPipeableStream(
    children: JSX.Element,
    postponedState: PostponedState,
    options?: ResumeOptions
  ): PipeableStream
}

declare module 'react-dom/static.node' {
  import type { JSX } from 'react'
  import type { Readable } from 'node:stream'
  import type { PostponedState } from 'react-dom/types'

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzStaticNode.js#L40
  export interface Options {
    identifierPrefix?: string
    namespaceURI?: string
    bootstrapScriptContent?: string
    bootstrapScripts?: Array<string | BootstrapScriptDescriptor>
    bootstrapModules?: Array<string | BootstrapScriptDescriptor>
    progressiveChunkSize?: number
    signal?: AbortSignal
    onError?: (
      error: unknown,
      errorInfo: ErrorInfo
    ) => string | undefined | null | void
    onPostpone?: (reason: string, postponeInfo: PostponeInfo) => void
    unstable_externalRuntimeSrc?: string | BootstrapScriptDescriptor
    importMap?: ImportMap
    onHeaders?: (headers: HeadersDescriptor) => void
    maxHeadersLength?: number
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzStaticNode.js#L56
  export type StaticResult = {
    postponed: null | PostponedState
    prelude: Readable
  }

  // https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/react-dom/src/server/ReactDOMFizzStaticNode.js#L77
  export function prerenderToNodeStream(
    children: JSX.Element,
    options?: Options
  ): Promise<StaticResult>
}
