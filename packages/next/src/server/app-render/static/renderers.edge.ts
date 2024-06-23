import type {
  Options as RenderToReadableStreamOptions,
  ResumeOptions,
} from 'react-dom/server.edge'
import type { Options as PrerenderOptions } from 'react-dom/static.edge'
import type { RenderResult, Renderer } from './renderers'
import type { PostponedState } from 'react-dom/types'
import type { JSX } from 'react'

export class ServerRenderer implements Renderer {
  private readonly renderToReadableStream = require('react-dom/server.edge')
    .renderToReadableStream as (typeof import('react-dom/server.edge'))['renderToReadableStream']

  constructor(private readonly options: RenderToReadableStreamOptions) {}

  public async render(children: JSX.Element): Promise<RenderResult> {
    const stream = await this.renderToReadableStream(children, this.options)
    return { stream }
  }
}

export class StaticRenderer implements Renderer {
  // this is for tree shaking. Couldn't find a better way to do it for some reason
  private readonly prerender = (process.env.__NEXT_EXPERIMENTAL_REACT
    ? require('react-dom/static.edge').prerender
    : null) as (typeof import('react-dom/static.edge'))['prerender']

  constructor(private readonly options: PrerenderOptions) {}

  public async render(children: JSX.Element) {
    const { prelude, postponed } = await this.prerender(children, this.options)

    return { stream: prelude, postponed }
  }
}

export class StaticResumeRenderer implements Renderer {
  private readonly resume = require('react-dom/server.edge')
    .resume as (typeof import('react-dom/server.edge'))['resume']

  constructor(
    private readonly postponed: PostponedState,
    private readonly options: ResumeOptions
  ) {}

  public async render(children: JSX.Element) {
    const stream = await this.resume(children, this.postponed, this.options)

    return { stream, resumed: true }
  }
}
