import type { Edge } from 'react-server-dom-webpack/server.edge'
import type { Node } from 'react-server-dom-webpack/server.node'
import type { PipeableStream } from 'react-dom/server.node'
import type {
  DecodeAction,
  DecodeFormState,
  DecodeReply,
} from '../../../../types/react-server-dom-webpack'
import type { AppRenderContext } from '../app-render'

export function renderToStream(
  model: any,
  webpackMap: AppRenderContext['clientReferenceManifest']['clientModules'],
  options?: Edge.RenderToReadableStreamOptions &
    Node.RenderToPipeableStreamOptions
): ReadableStream<Uint8Array> | PipeableStream

export function decodeReply<T>(
  ...args: Parameters<DecodeReply<T>>
): ReturnType<DecodeReply<T>>
export function decodeAction<T>(
  ...args: Parameters<DecodeAction<T>>
): ReturnType<DecodeAction<T>>
export function decodeFormState<S>(
  ...args: Parameters<DecodeFormState<S>>
): ReturnType<DecodeFormState<S>>
