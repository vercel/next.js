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

export class ServerRenderer implements Renderer {
  constructor(
    options: RenderToReadableStreamOptions | RenderToPipeableStreamOptions
  )
  render(children: JSX.Element): Promise<RenderResult>
}

export class StaticRenderer implements Renderer {
  constructor(options: PrerenderOptions | PrerenderToNodeStreamOptions)
  render(children: JSX.Element): Promise<RenderResult>
}

export class StaticResumeRenderer implements Renderer {
  constructor(
    postponed: PostponedState,
    options: ResumeOptionsEdge | ResumeOptionsNode
  )
  render(children: JSX.Element): Promise<RenderResult>
}
