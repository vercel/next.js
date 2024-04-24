import type { RenderResult, Renderer } from './static-renderer'
import { PassThrough, type Writable } from 'node:stream'

type PipeableStream = {
  pipe<T extends Writable>(destination: T): T
}

type RenderToPipeableStream = (
  children: JSX.Element,
  options?: unknown
) => Promise<PipeableStream>

export class ServerRenderer implements Renderer {
  private readonly renderToPipeableStream = require('react-dom/server')
    .renderToPipeableStream as RenderToPipeableStream

  constructor(private readonly options: unknown) {}

  public async render(children: JSX.Element): Promise<RenderResult> {
    const stream = await this.renderToPipeableStream(children, {
      // FIXME: we aren't passing the options through here, we should
    })

    // Create the passthrough stream that'll be used to pipe the React stream
    // into the final response.
    const passthrough = new PassThrough()
    stream.pipe(passthrough)

    return { stream: passthrough }
  }
}
