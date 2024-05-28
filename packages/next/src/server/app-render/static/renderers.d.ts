import type {
  Options as RenderToReadableStreamOptions,
  ResumeOptions as ResumeOptionsEdge,
} from 'react-dom/server.edge'
import type { Options as PrerenderOptions } from 'react-dom/static.edge'
import type {
  Options as RenderToPipeableStreamOptions,
  ResumeOptions as ResumeOptionsNode,
} from 'react-dom/server.node'
import type { Options as PrerenderToNodeStreamOptions } from 'react-dom/static.node'
import type { Readable } from 'node:stream'
import type { PostponedState } from 'react-dom/types'
import type { JSX } from 'react'

export type RenderResult = {
  stream: ReadableStream<Uint8Array> | Readable
  postponed?: PostponedState | null
  resumed?: boolean
}

export interface Renderer {
  render(children: JSX.Element): Promise<RenderResult>
}

type InteropEdgeAndNodeTypes<A, B> = Omit<A, keyof B> & B

export type ServerRendererOptions = InteropEdgeAndNodeTypes<
  RenderToReadableStreamOptions & RenderToPipeableStreamOptions,
  { onHeaders?: (headers: Headers | HeadersDescriptor) => void }
>

export class ServerRenderer implements Renderer {
  constructor(options: ServerRendererOptions)
  render(children: JSX.Element): Promise<RenderResult>
}

export type StaticRendererOptions = InteropEdgeAndNodeTypes<
  PrerenderOptions & PrerenderToNodeStreamOptions,
  { onHeaders?: (headers: Headers | HeadersDescriptor) => void }
>

export class StaticRenderer implements Renderer {
  constructor(options: StaticRendererOptions)
  render(children: JSX.Element): Promise<RenderResult>
}

export type StaticResumeRendererOptions = InteropEdgeAndNodeTypes<
  ResumeOptionsEdge & ResumeOptionsNode,
  {
    onError?: (
      error: unknown,
      errorInfo?: ErrorInfo
    ) => string | undefined | null | void
    onPostpone?: (reason: string, postponeInfo?: PostponeInfo) => void
  }
>

export class StaticResumeRenderer implements Renderer {
  constructor(postponed: PostponedState, options: StaticResumeRendererOptions)
  render(children: JSX.Element): Promise<RenderResult>
}
