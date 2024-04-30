import type {
  Options as RenderToReadableStreamOptions,
  ResumeOptions as ResumeOptionsEdge,
} from 'react-dom/server.edge'
import type { Options as PrerenderOptions } from 'react-dom/static.edge'
import type {
  Options as RenderToPipeableStreamOptions,
  ResumeOptions as ResumeOptionsNode,
} from 'react-dom/server.node'
import type { Options as PrerenderToNodeStreamOptions } from 'react-dom/static.node'
import type { RenderResult, Renderer } from './renderers'
import {
  ServerRenderer,
  StaticRenderer,
  StaticResumeRenderer,
} from './renderers'
import type { PostponedState } from 'react-dom'

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
// type StreamOptions = Pick<
//   ResumeOptions & RenderToReadableStreamOptions & PrerenderOptions & RenderToPipeableStreamOptions & PrerenderToNodeStreamOptions,
//   | 'onError'
//   | 'onPostpone'
//   | 'onHeaders'
//   | 'maxHeadersLength'
//   | 'nonce'
//   | 'bootstrapScripts'
//   | 'formState'
//   | 'signal'
// >

// type O = 'onError'
// | 'onPostpone'
// | 'onHeaders'
// | 'maxHeadersLength'
// | 'nonce'
// | 'bootstrapScripts'
// | 'formState'
// | 'signal'

// type R1 = Pick<ResumeOptions, 'onError' | 'onPostpone' | 'nonce' | 'signal'>
// type R2 = Pick<RenderToReadableStreamOptions, O>
// type R3 = Pick<PrerenderOptions, 'onError' | 'onPostpone' | 'onHeaders' | 'maxHeadersLength' | 'bootstrapScripts' | 'signal'>
// type R4 = Pick<RenderToPipeableStreamOptions, 'onError'
// | 'onPostpone'
// | 'onHeaders'
// | 'maxHeadersLength'
// | 'nonce'
// | 'bootstrapScripts'
// | 'formState'
// >
// type R5 = Pick<PrerenderToNodeStreamOptions, 'onError'
// | 'onPostpone'
// | 'onHeaders'
// | 'maxHeadersLength'
// | 'bootstrapScripts'
// | 'signal'
// >

// type StreamOptions2 = R1 | R2 | R3 | R4 | R5

export const DYNAMIC_DATA = 1 as const
export const DYNAMIC_HTML = 2 as const

type DynamicDataPostponedState = typeof DYNAMIC_DATA
type DynamicHTMLPostponedState = [typeof DYNAMIC_HTML, object]
export type DynamicPostponedState =
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
  postponed: null | DynamicPostponedState

  /**
   * The options for any of the renderers. This is a union of all the possible
   * options for each renderer. If additional configuration options are required
   * for a renderer, they should be added to the `StreamOptions` type and then
   * added via the `createStaticRenderer` function.
   */
  streamOptions:
    | ResumeOptionsEdge
    | ResumeOptionsNode
    | RenderToReadableStreamOptions
    | PrerenderOptions
    | RenderToPipeableStreamOptions
    | PrerenderToNodeStreamOptions
}

// export function createStaticRenderer(options: PrerenderOptions | PrerenderToNodeStreamOptions) {
//   return new StaticRenderer(options);
// }

// export function createServerRenderer(options: RenderToReadableStreamOptions | RenderToPipeableStreamOptions) {
//   return new ServerRenderer(options);
// }

// export function createStaticResumeRenderer(postponed: null | Dyn, options: ResumeOptionsEdge | ResumeOptionsNode) {
//   if (postponed === DYNAMIC_DATA) {
//     // The HTML was complete, we don't actually need to render anything
//     return new VoidRenderer()
//   } else if (postponed) {
//     const reactPostponedState = postponed[1]
//     // The HTML had dynamic holes and we need to resume it
//     return new StaticResumeRenderer(reactPostponedState, streamOptions)
//   }
// }

// export function createStaticRenderer(options: {
//   ppr: true,
//   isStaticGeneration: false,
//   postponed: null | DynamicPostponedState,
//   streamOptions: ResumeOptionsEdge | ResumeOptionsNode
// }): Renderer
// export function createStaticRenderer(options: {
//   ppr: true,
//   isStaticGeneration: true,
//   postponed: null | DynamicPostponedState,
//   streamOptions: PrerenderOptions | PrerenderToNodeStreamOptions
// }): Renderer
// export function createStaticRenderer(options: {
//   ppr: false,
//   isStaticGeneration: boolean,
//   postponed: null | DynamicPostponedState,
//   streamOptions: RenderToReadableStreamOptions | RenderToPipeableStreamOptions
// }): Renderer
export function createStaticRenderer({
  ppr,
  isStaticGeneration,
  postponed,
  streamOptions,
}: Options): Renderer {
  if (ppr) {
    if (isStaticGeneration) {
      // This is a Prerender
      return new StaticRenderer(streamOptions)
    } else {
      // This is a Resume
      if (postponed === DYNAMIC_DATA) {
        // The HTML was complete, we don't actually need to render anything
        return new VoidRenderer()
      } else if (postponed) {
        const reactPostponedState = postponed[1]
        // The HTML had dynamic holes and we need to resume it
        return new StaticResumeRenderer(reactPostponedState, streamOptions)
      }
    }
  }

  if (isStaticGeneration) {
    // This is a static render (without PPR)
    // @ts-ignore
    delete streamOptions.onHeaders
    return new ServerRenderer(streamOptions)
  }

  // This is a dynamic render (without PPR)
  return new ServerRenderer(streamOptions)
}
