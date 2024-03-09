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
export const DYNAMIC_HTML = 2 as const

type DynamicDataPostponedState = typeof DYNAMIC_DATA
type DynamicHTMLPostponedState = [typeof DYNAMIC_HTML, object]
export type PostponedState =
  | DynamicDataPostponedState
  | DynamicHTMLPostponedState

export function getDynamicHTMLPostponedState(
  data: object
): DynamicHTMLPostponedState {
  return [DYNAMIC_HTML, data]
}

export function getDynamicDataPostponedState(): DynamicDataPostponedState {
  return DYNAMIC_DATA
}

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
  postponed: null | PostponedState

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
    signal,
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
      // This is a Prerender
      return new StaticRenderer({
        signal,
        onError,
        onPostpone,
        // We want to capture headers because we may not end up with a shell
        // and being able to send headers is the next best thing
        onHeaders,
        maxHeadersLength,
        bootstrapScripts,
      })
    } else {
      // This is a Resume
      if (postponed === DYNAMIC_DATA) {
        // The HTML was complete, we don't actually need to render anything
        return new VoidRenderer()
      } else if (postponed) {
        const reactPostponedState = postponed[1]
        // The HTML had dynamic holes and we need to resume it
        return new StaticResumeRenderer(reactPostponedState, {
          signal,
          onError,
          onPostpone,
          nonce,
        })
      }
    }
  }

  if (isStaticGeneration) {
    // This is a static render (without PPR)
    return new ServerRenderer({
      signal,
      onError,
      // We don't pass onHeaders. In static builds we will either have no output
      // or the entire page. In either case preload headers aren't necessary and could
      // alter the prioritiy of relative loading of resources so we opt to keep them
      // as tags exclusively.
      nonce,
      bootstrapScripts,
      formState,
    })
  }

  // This is a dynamic render (without PPR)
  return new ServerRenderer({
    signal,
    onError,
    // Static renders are streamed in realtime so sending headers early is
    // generally good because it will likely go out before the shell is ready.
    onHeaders,
    maxHeadersLength,
    nonce,
    bootstrapScripts,
    formState,
  })
}
