import type {
  Options as RenderToReadableStreamOptions,
  ResumeOptions,
} from 'react-dom/server.edge'
import type { Options as PrerenderOptions } from 'react-dom/static.edge'

type RenderResult = {
  stream: ReadableStream<Uint8Array>
  postponed?: object | null
  resumed?: boolean
}

export interface Renderer {
  render(children: JSX.Element): Promise<RenderResult>
}

class StaticRenderer implements Renderer {
  // this is for tree shaking. Couldn't find a better way to do it for some reason
  private readonly prerender = (process.env.__NEXT_EXPERIMENTAL_REACT
    ? require('react-dom/static.edge').prerender
    : null) as typeof import('react-dom/static.edge')['prerender']

  constructor(private readonly options: PrerenderOptions) {}

  public async render(children: JSX.Element) {
    const { prelude, postponed } = await this.prerender(children, this.options)

    return { stream: prelude, postponed }
  }
}

class StaticResumeRenderer implements Renderer {
  private readonly resume = require('react-dom/server.edge')
    .resume as typeof import('react-dom/server.edge')['resume']

  constructor(
    private readonly postponed: object,
    private readonly options: ResumeOptions
  ) {}

  public async render(children: JSX.Element) {
    const stream = await this.resume(children, this.postponed, this.options)

    return { stream, resumed: true }
  }
}

export class ServerRenderer implements Renderer {
  private readonly renderToReadableStream = require('react-dom/server.edge')
    .renderToReadableStream as typeof import('react-dom/server.edge')['renderToReadableStream']

  constructor(private readonly options: RenderToReadableStreamOptions) {}

  public async render(children: JSX.Element): Promise<RenderResult> {
    const stream = await this.renderToReadableStream(children, this.options)
    return { stream }
  }
}

export class VoidRenderer implements Renderer {
  public async render(_children: JSX.Element): Promise<RenderResult> {
    return {
      stream: new ReadableStream({
        start(controller) {
          // Close the stream immediately
          controller.close()
        },
      }),
      resumed: false,
    }
  }
}

/**
 * This represents all the possible configuration options for each of the
 * available renderers. We pick the specific options we need for each renderer
 * to help the `createStaticRenderer` function. If more options are added to
 * this type they should be added to the `createStaticRenderer` function as
 * well.
 */
type StreamOptions = Pick<
  ResumeOptions & RenderToReadableStreamOptions & PrerenderOptions,
  | 'onError'
  | 'onPostpone'
  | 'onHeaders'
  | 'maxHeadersLength'
  | 'nonce'
  | 'bootstrapScripts'
  | 'formState'
  | 'signal'
>

export const DYNAMIC_DATA = 1 as const

type Options = {
  /**
   * Whether or not PPR is enabled. This is used to determine which renderer to
   * use.
   */
  ppr: boolean

  /**
   * Whether or not this is a static generation render. This is used to
   * determine which renderer to use.
   */
  isStaticGeneration: boolean

  /**
   * The postponed state for the render. This is only used when resuming a
   * prerender that has postponed.
   */
  postponed: object | typeof DYNAMIC_DATA | null

  /**
   * The options for any of the renderers. This is a union of all the possible
   * options for each renderer. If additional configuration options are required
   * for a renderer, they should be added to the `StreamOptions` type and then
   * added via the `createStaticRenderer` function.
   */
  streamOptions: StreamOptions
}

export function createStaticRenderer({
  ppr,
  isStaticGeneration,
  postponed,
  streamOptions: {
    onError,
    onPostpone,
    onHeaders,
    maxHeadersLength,
    nonce,
    bootstrapScripts,
    formState,
  },
}: Options): Renderer {
  if (ppr) {
    if (isStaticGeneration) {
      return new StaticRenderer({
        onError,
        onPostpone,
        onHeaders,
        maxHeadersLength,
        bootstrapScripts,
      })
    }

    if (postponed === DYNAMIC_DATA) {
      return new VoidRenderer()
    } else if (postponed) {
      return new StaticResumeRenderer(postponed, {
        onError,
        nonce,
      })
    }
  }

  return new ServerRenderer({
    onError,
    onHeaders,
    maxHeadersLength,
    nonce,
    bootstrapScripts,
    formState,
  })
}
