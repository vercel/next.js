import { prerender } from 'react-dom/static.edge'
import { resume, renderToReadableStream } from 'react-dom/server.edge'

type StreamOptions = {
  onError?: (error: Error) => void
  nonce?: string
  bootstrapScripts?: {
    src: string
    integrity?: string
    crossOrigin?: string
  }[]
  formState?: boolean
}

type RenderResult = {
  stream: ReadableStream<Uint8Array>
  postponed?: object | null
}

export interface Renderer {
  render(children: JSX.Element, options: StreamOptions): Promise<RenderResult>
}

class StaticRenderer implements Renderer {
  public async render(children: JSX.Element, streamOptions: StreamOptions) {
    const { prelude, postponed } = await prerender(children, streamOptions)
    return { stream: prelude, postponed }
  }
}

class StaticResumeRenderer implements Renderer {
  constructor(private readonly postponed: object) {}

  public async render(children: JSX.Element, streamOptions: StreamOptions) {
    const stream = await resume(children, this.postponed, streamOptions)

    return { stream }
  }
}

export class ServerRenderer implements Renderer {
  public async render(
    children: JSX.Element,
    options: StreamOptions
  ): Promise<RenderResult> {
    const stream = await renderToReadableStream(children, options)
    return { stream }
  }
}

type Options = {
  ppr: boolean
  isStaticGeneration: boolean
  postponed: object | null
}

export function createStaticRenderer({
  ppr,
  isStaticGeneration,
  postponed,
}: Options): Renderer {
  if (ppr) {
    if (isStaticGeneration) {
      return new StaticRenderer()
    }

    if (postponed) {
      return new StaticResumeRenderer(postponed)
    }
  }

  return new ServerRenderer()
}
