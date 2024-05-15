import type { Thenable } from 'react'

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server/src/ReactFlightServerTemporaryReferences.js#L18
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TemporaryReference<T> = {}

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server/src/ReactFlightServerTemporaryReferences.js#L12
type TemporaryReferenceSet = WeakMap<TemporaryReference<any>, string>

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server/src/ReactFlightServer.js#L319
export type ReactClientValue = any

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
export type ClientManifest = {
  [id: string]: ClientReferenceManifestEntry
}

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server/src/ReactFlightActionServer.js#L25
type ServerReferenceId = any

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server/src/ReactFlightActionServer.js#L83
export type DecodeAction<T> = (
  body: FormData,
  ServerManifest: ServerModuleMap
) => Promise<() => T> | null

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server/src/ReactFlightActionServer.js#L125
export type DecodeFormState<S> = (
  actionResult: S,
  body: FormData,
  ServerManifest?: ServerModuleMap
) => Promise<ReactFormState<S, ServerReferenceId> | null>

// https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-webpack/src/ReactFlightDOMServerEdge.js#L101
export type DecodeReply<T> = (
  body: string | FormData,
  webpackMap?: ServerModuleMap,
  option?: {
    temporaryReferences?: TemporaryReferenceSet
  }
) => Thenable<T>

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

  export type decodeReply<T> = DecodeReply<T>

  export type decodeAction<T> = DecodeAction<T>

  export type decodeFormState<S> = DecodeFormState<S>
}

import type { PipeableStream } from 'react-dom/server.node'
import type { ServerModuleMap } from '../src/server/app-render/action-handler'

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

  // If this is needed, ensure to add it to the `packages/next/src/server/app-render/react-server-dom-webpack/{react-server-dom-webpack.node.ts, index.js}` exports
  export type decodeReplyFromBusboy = never
  //   // https://github.com/facebook/react/blob/26f24960935cc395dd9892b3ac48249c9dbcc195/packages/react-server-dom-webpack/src/ReactFlightDOMServerNode.js#L127
  //   export function decodeReplyFromBusboy<T>(
  //     busboyStream: unknown,
  //     webpackMap: ServerManifest
  //   ): Thenable<T>

  export type decodeReply<T> = DecodeReply<T>

  export type decodeAction<T> = DecodeAction<T>

  export type decodeFormState<S> = DecodeFormState<S>
}
