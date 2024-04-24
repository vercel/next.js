import type { RenderResult, Renderer } from './static-renderer'

export class ServerRenderer implements Renderer {
  constructor(options: unknown)
  render(children: JSX.Element): Promise<RenderResult>
}
