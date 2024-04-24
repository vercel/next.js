import type { Options as RenderToReadableStreamOptions } from 'react-dom/server.edge'
import type { RenderResult, Renderer } from './static-renderer'

export class ServerRenderer implements Renderer {
  private readonly renderToReadableStream = require('react-dom/server.edge')
    .renderToReadableStream as typeof import('react-dom/server.edge')['renderToReadableStream']

  constructor(private readonly options: RenderToReadableStreamOptions) {}

  public async render(children: JSX.Element): Promise<RenderResult> {
    const stream = await this.renderToReadableStream(children, this.options)
    return { stream }
  }
}
