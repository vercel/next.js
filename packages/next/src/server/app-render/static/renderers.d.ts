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

export type RenderResult = {
  stream: ReadableStream<Uint8Array> | Readable
  postponed?: PostponedState | null
  resumed?: boolean
}

export interface Renderer {
  render(children: JSX.Element): Promise<RenderResult>
}

export type ServerRendererOptions = Omit<
  RenderToReadableStreamOptions,
  'onHeaders'
> &
  Omit<RenderToPipeableStreamOptions, 'onHeaders'> & {
    onHeaders?: (headers: Headers | HeadersDescriptor) => void
  }

export class ServerRenderer implements Renderer {
  constructor(options: ServerRendererOptions)
  render(children: JSX.Element): Promise<RenderResult>
}

export type StaticRendererOptions = Omit<PrerenderOptions, 'onHeaders'> &
  Omit<PrerenderToNodeStreamOptions, 'onHeaders'> & {
    onHeaders?: (headers: Headers | HeadersDescriptor) => void
  }

export class StaticRenderer implements Renderer {
  constructor(options: StaticRendererOptions)
  render(children: JSX.Element): Promise<RenderResult>
}

export type StaticResumeRendererOptions = Omit<
  ResumeOptionsEdge,
  'onError' | 'onPostpone'
> &
  Omit<ResumeOptionsNode, 'onError' | 'onPostpone'> & {
    onError?: (
      error: unknown,
      errorInfo?: ErrorInfo
    ) => string | undefined | null | void
    onPostpone?: (reason: string, postponeInfo?: PostponeInfo) => void
  }

export class StaticResumeRenderer implements Renderer {
  constructor(postponed: PostponedState, options: StaticResumeRendererOptions)
  render(children: JSX.Element): Promise<RenderResult>
}
