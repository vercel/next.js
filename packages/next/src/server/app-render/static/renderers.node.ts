import type {
  Options as RenderToPipeableStreamOptions,
  ResumeOptions,
} from 'react-dom/server.node'
import type { Options as PrerenderToNodeStreamOptions } from 'react-dom/static.node'
import type { RenderResult, Renderer } from './renderers'
import { PassThrough } from 'node:stream'
import type { PostponedState } from 'react-dom/types'

export class ServerRenderer implements Renderer {
  private readonly renderToPipeableStream = require('react-dom/server.node')
    .renderToPipeableStream as typeof import('react-dom/server.node')['renderToPipeableStream']

  constructor(private readonly options: RenderToPipeableStreamOptions) {}

  public async render(children: JSX.Element): Promise<RenderResult> {
    const stream = this.renderToPipeableStream(children, this.options)

    // Create the passthrough stream that'll be used to pipe the React stream
    // into the final response.
    const passthrough = new PassThrough()
    stream.pipe(passthrough)

    return { stream: passthrough }
  }
}

export class StaticRenderer implements Renderer {
  // this is for tree shaking. Couldn't find a better way to do it for some reason
  private readonly prerenderToNodeStream = require('react-dom/static.node')
    .prerenderToNodeStream as typeof import('react-dom/static.node')['prerenderToNodeStream']

  constructor(private readonly options: PrerenderToNodeStreamOptions) {}

  public async render(children: JSX.Element) {
    const { prelude, postponed } = await this.prerenderToNodeStream(
      children,
      this.options
    )

    return { stream: prelude, postponed }
  }
}

export class StaticResumeRenderer implements Renderer {
  private readonly resumeToPipeableStream = require('react-dom/server.node')
    .resume as typeof import('react-dom/server.node')['resumeToPipeableStream']

  constructor(
    private readonly postponed: PostponedState,
    private readonly options: ResumeOptions
  ) {}

  public async render(children: JSX.Element): Promise<RenderResult> {
    const stream = this.resumeToPipeableStream(
      children,
      this.postponed,
      this.options
    )

    // Create the passthrough stream that'll be used to pipe the React stream
    // into the final response.
    const passthrough = new PassThrough()
    stream.pipe(passthrough)

    return { stream: passthrough, resumed: true }
  }
}
