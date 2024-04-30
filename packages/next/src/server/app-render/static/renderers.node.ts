import type { Options as RenderToPipeableStreamOptions } from 'react-dom/server.node'
import type { RenderResult, Renderer } from './static-renderer'
import { PassThrough } from 'node:stream'

export class ServerRenderer implements Renderer {
  private readonly renderToPipeableStream = require('react-dom/server')
    .renderToPipeableStream as typeof import('react-dom/server.node')['renderToPipeableStream']

  constructor(private readonly options: RenderToPipeableStreamOptions) {}

  public async render(children: JSX.Element): Promise<RenderResult> {
    const stream = await this.renderToPipeableStream(children, this.options)

    // Create the passthrough stream that'll be used to pipe the React stream
    // into the final response.
    const passthrough = new PassThrough()
    stream.pipe(passthrough)

    return { stream: passthrough }
  }
}
