import type { Thenable } from 'react'
import type { PipeableStream } from 'react-dom/server.node'

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server/src/ReactFlightServerTemporaryReferences.js#L18
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TemporaryReference<T> = {}

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server/src/ReactFlightServerTemporaryReferences.js#L12
type TemporaryReferenceSet = WeakMap<TemporaryReference<any>, string>

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server/src/ReactFlightServer.js#L319
type ReactClientValue = any

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-webpack/src/shared/ReactFlightImportMetadata.js#L10
type ImportManifestEntry = {
  id: string
  chunks: string[]
  name: string
}

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-turbopack/src/ReactFlightClientConfigBundlerTurbopack.js#L39
type ServerManifest = {
  [id: string]: ImportManifestEntry
}

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-webpack/src/ReactFlightServerConfigWebpackBundler.js#L30
type ClientReferenceManifestEntry = ImportManifestEntry

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-webpack/src/ReactFlightServerConfigWebpackBundler.js#L23
type ClientManifest = {
  [id: string]: ClientReferenceManifestEntry
}

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server/src/ReactFlightActionServer.js#L25
type ServerReferenceId = any

// https://github.com/facebook/react/blob/d779eba4b375134f373b7dfb9ea98d01c84bc48e/packages/shared/ReactTypes.js#L164
type ReactFormState<S, ReferenceId> = [
  S /* actual state value */,
  string /* key path */,
  ReferenceId /* Server Reference ID */,
  number /* number of bound arguments */,
]

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server/src/ReactFlightActionServer.js#L83
type DecodeAction<T> = (
  body: FormData,
  ServerManifest: ServerManifest
) => Promise<() => T> | null

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server/src/ReactFlightActionServer.js#L125
type DecodeFormState<S> = (
  actionResult: S,
  body: FormData,
  ServerManifest: ServerManifest
) => Promise<ReactFormState<S, ServerReferenceId> | null>

declare module 'react-server-dom-webpack/server.edge' {
  // https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-webpack/src/ReactFlightDOMServerEdge.js#L46
  export interface RenderToReadableStreamOptions {
    environmentName?: string
    identifierPrefix?: string
    signal?: AbortSignal
    temporaryReferences?: TemporaryReferenceSet
    onError?: (error: unknown) => void
    onPostpone?: (reason: string) => void
  }

  // https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-webpack/src/ReactFlightDOMServerEdge.js#L55
  export function renderToReadableStream(
    model: ReactClientValue,
    webpackMap: ClientManifest,
    option?: RenderToReadableStreamOptions
  ): ReadableStream

  // https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-webpack/src/ReactFlightDOMServerEdge.js#L101
  export function decodeReply<T>(
    body: string | FormData,
    webpackMap: ServerManifest,
    options?: {
      temporaryReferences?: TemporaryReferenceSet
    }
  ): Thenable<T>

  export type decodeAction<T> = DecodeAction<T>

  export type decodeFormState<S> = DecodeFormState<S>
}

declare module 'react-server-dom-webpack/server.node' {
  // https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-webpack/src/ReactFlightDOMServerNode.js#L69
  export interface RenderToPipeableStreamOptions {
    environmentName?: string
    onError?: (error: unknown) => void
    onPostpone?: (reason: string) => void
    identifierPrefix?: string
    temporaryReferences?: TemporaryReferenceSet
  }
  // https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-webpack/src/ReactFlightDOMServerNode.js#L82
  export function renderToPipeableStream(
    model: ReactClientValue,
    webpackMap: ClientManifest,
    options?: RenderToPipeableStreamOptions
  ): PipeableStream

  // https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-webpack/src/ReactFlightDOMServerNode.js#L127
  export function decodeReplyFromBusboy<T>(
    busboyStream: unknown,
    webpackMap: ServerManifest
  ): Thenable<T>

  // https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-webpack/src/ReactFlightDOMServerNode.js#L182
  export function decodeReply<T>(
    body: string | FormData,
    webpackMap: ServerManifest,
    option?: {
      temporaryReferences?: TemporaryReferenceSet
    }
  ): Thenable<T>

  export type decodeAction<T> = DecodeAction<T>

  export type decodeFormState<S> = DecodeFormState<S>
}
