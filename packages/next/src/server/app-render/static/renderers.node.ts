import type {
  Options as RenderToPipeableStreamOptions,
  ResumeOptions,
} from 'react-dom/server.node'
import type { Options as PrerenderToNodeStreamOptions } from 'react-dom/static.node'
import type { RenderResult, Renderer } from './renderers'
import { PassThrough } from 'node:stream'
import type { PostponedState } from 'react-dom/types'
import type { JSX } from 'react'

export class ServerRenderer implements Renderer {
  private readonly renderToPipeableStream = require('react-dom/server.node')
    .renderToPipeableStream as (typeof import('react-dom/server.node'))['renderToPipeableStream']

  constructor(private readonly options: RenderToPipeableStreamOptions) {}

  public async render(children: JSX.Element): Promise<RenderResult> {
    return new Promise((resolve, reject) => {
      const { pipe } = this.renderToPipeableStream(children, {
        ...this.options,
        onShellReady() {
          resolve({ stream: pipe(new PassThrough()) })
        },
        onShellError(error) {
          reject(error)
        },
      })
    })
  }
}

export class StaticRenderer implements Renderer {
  private readonly prerenderToNodeStream = require('react-dom/static.node')
    .prerenderToNodeStream as (typeof import('react-dom/static.node'))['prerenderToNodeStream']

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
    .resumeToPipeableStream as (typeof import('react-dom/server.node'))['resumeToPipeableStream']

  constructor(
    private readonly postponed: PostponedState,
    private readonly options: ResumeOptions
  ) {}

  public async render(children: JSX.Element): Promise<RenderResult> {
    return new Promise((resolve, reject) => {
      const { pipe } = this.resumeToPipeableStream(children, this.postponed, {
        ...this.options,
        onShellReady() {
          resolve({ stream: pipe(new PassThrough()), resumed: true })
        },
        onShellError(error) {
          reject(error)
        },
      })
    })
  }
}
