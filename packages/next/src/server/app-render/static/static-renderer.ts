import type {
  RenderResult,
  Renderer,
  ServerRendererOptions,
  StaticRendererOptions,
  StaticResumeRendererOptions,
} from './renderers'
import {
  ServerRenderer,
  StaticRenderer,
  StaticResumeRenderer,
} from './renderers'
import type { PostponedState } from 'react-dom/types'
import type { JSX } from 'react'

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

export const DYNAMIC_DATA = 1 as const
export const DYNAMIC_HTML = 2 as const

type DynamicDataPostponedState = typeof DYNAMIC_DATA
type DynamicHTMLPostponedState = [typeof DYNAMIC_HTML, PostponedState]
export type DynamicPostponedState =
  | DynamicDataPostponedState
  | DynamicHTMLPostponedState

export function getDynamicHTMLPostponedState(
  data: PostponedState
): DynamicHTMLPostponedState {
  return [DYNAMIC_HTML, data]
}

export function getDynamicDataPostponedState(): DynamicDataPostponedState {
  return DYNAMIC_DATA
}

type Options = {
  /**
   * Whether or not PPR is enabled for this page. This is used to determine
   * which renderer to use.
   */
  isRoutePPREnabled: boolean

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
    | StaticResumeRendererOptions
    | ServerRendererOptions
    | StaticRendererOptions
}

export function createStaticRenderer({
  isRoutePPREnabled,
  isStaticGeneration,
  postponed,
  streamOptions,
}: Options): Renderer {
  if (isRoutePPREnabled) {
    if (isStaticGeneration) {
      let _streamOptions = streamOptions as StaticRendererOptions
      // This is a Prerender
      return new StaticRenderer({
        signal: _streamOptions.signal,
        onError: _streamOptions.onError,
        onPostpone: _streamOptions.onPostpone,
        // We want to capture headers because we may not end up with a shell
        // and being able to send headers is the next best thing
        onHeaders: _streamOptions.onHeaders,
        maxHeadersLength: _streamOptions.maxHeadersLength,
        bootstrapScripts: _streamOptions.bootstrapScripts,
      })
    } else {
      // This is a Resume
      if (postponed === DYNAMIC_DATA) {
        // The HTML was complete, we don't actually need to render anything
        return new VoidRenderer()
      } else if (postponed) {
        const reactPostponedState = postponed[1]
        let _streamOptions = streamOptions as StaticResumeRendererOptions
        // The HTML had dynamic holes and we need to resume it
        return new StaticResumeRenderer(reactPostponedState, {
          signal: _streamOptions.signal,
          onError: _streamOptions.onError,
          onPostpone: _streamOptions.onPostpone,
          nonce: _streamOptions.nonce,
        })
      }
    }
  }

  let _streamOptions = streamOptions as ServerRendererOptions

  if (isStaticGeneration) {
    // This is a static render (without PPR)
    // @ts-ignore
    delete streamOptions.onHeaders
    return new ServerRenderer({
      signal: _streamOptions.signal,
      onError: _streamOptions.onError,
      // We don't pass onHeaders. In static builds we will either have no output
      // or the entire page. In either case preload headers aren't necessary and could
      // alter the prioritiy of relative loading of resources so we opt to keep them
      // as tags exclusively.
      nonce: _streamOptions.nonce,
      bootstrapScripts: _streamOptions.bootstrapScripts,
      formState: _streamOptions.formState,
    })
  }

  // This is a dynamic render (without PPR)
  return new ServerRenderer({
    signal: _streamOptions.signal,
    onError: _streamOptions.onError,
    // Static renders are streamed in realtime so sending headers early is
    // generally good because it will likely go out before the shell is ready.
    onHeaders: _streamOptions.onHeaders,
    maxHeadersLength: _streamOptions.maxHeadersLength,
    nonce: _streamOptions.nonce,
    bootstrapScripts: _streamOptions.bootstrapScripts,
    formState: _streamOptions.formState,
  })
}
