type StreamOptions = {
  onError?: (error: Error) => void
  onHeaders?: (headers: Headers) => void
  maxHeadersLength?: number
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
  // this is for tree shaking. Couldn't find a better way to do it for some reason
  private readonly prerender = (process.env.__NEXT_EXPERIMENTAL_REACT
    ? require('react-dom/static.edge').prerender
    : null) as typeof import('react-dom/static.edge')['prerender']

  public async render(children: JSX.Element, streamOptions: StreamOptions) {
    const { prelude, postponed } = await this.prerender(children, streamOptions)

    return { stream: prelude, postponed }
  }
}

class StaticResumeRenderer implements Renderer {
  private readonly resume = require('react-dom/server.edge')
    .resume as typeof import('react-dom/server.edge')['resume']

  constructor(private readonly postponed: object) {}

  public async render(children: JSX.Element, streamOptions: StreamOptions) {
    // TODO: Refactor StreamOptions because not all options apply to all React
    // functions so this factoring of trying to reuse a single render() doesn't
    // make sense. This is passing multiple invalid options that React should
    // error for.
    const stream = await this.resume(children, this.postponed, streamOptions)

    return { stream }
  }
}

export class ServerRenderer implements Renderer {
  private readonly renderToReadableStream = require('react-dom/server.edge')
    .renderToReadableStream as typeof import('react-dom/server.edge')['renderToReadableStream']

  public async render(
    children: JSX.Element,
    options: StreamOptions
  ): Promise<RenderResult> {
    const stream = await this.renderToReadableStream(children, options)
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
