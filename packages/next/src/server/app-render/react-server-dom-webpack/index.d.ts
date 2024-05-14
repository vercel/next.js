import type { Edge } from 'react-server-dom-webpack/server.edge'
import type { Node } from 'react-server-dom-webpack/server.node'
import type { PipeableStream } from 'react-dom/server.node'
import type { DecodeAction, DecodeFormState, DecodeReply } from '../../../../types/react-server-dom-webpack'
import type { AppRenderContext } from '../app-render'

export function renderToStream(
    model: any,
    webpackMap: AppRenderContext['clientReferenceManifest']['clientModules'],
    options?: Edge.RenderToReadableStreamOptions & Node.RenderToPipeableStreamOptions
): ReadableStream | PipeableStream


export type decodeReply<T> = DecodeReply<T>

export type decodeAction<T> = DecodeAction<T>

export type decodeFormState<S> = DecodeFormState<S>