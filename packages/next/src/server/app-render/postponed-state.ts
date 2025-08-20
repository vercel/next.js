import type { FallbackRouteParams } from '../../server/request/fallback-params'
import { InvariantError } from '../../shared/lib/invariant-error'
import type { Params } from '../request/params'
import {
  createPrerenderResumeDataCache,
  createRenderResumeDataCache,
  type PrerenderResumeDataCache,
  type RenderResumeDataCache,
} from '../resume-data-cache/resume-data-cache'
import { stringifyResumeDataCache } from '../resume-data-cache/resume-data-cache'
import {
  lengthDecodeTupleWithTag,
  lengthEncodeTupleWithTag,
} from './length-encoding'

export enum DynamicState {
  /**
   * A dynamic access prevented us from rendering any HTML.
   */
  EmptyHtml = 1,

  /**
   * We rendered partial HTML, with some dynamic holes.
   */
  PartialHtml = 2,

  /**
   * A dynamic access occurred during the RSC render phase,
   * but did not result in any dynamic holes in the HTML.
   */
  FullHtml = 3,
}

type ReactPostponed = NonNullable<
  import('react-dom/static').PrerenderResult['postponed']
>

/**
 * The postponed state for a prerender that used dynamic data on the server, but produced complete HTML.
 *
 * This can happen if dynamic data is passed as a prop to a client component but was not used during SSR.
 * (it may be used in an effect, or the usage is guarded behind a `typeof window !== undefined` check)
 * We won't get a dynamic hole in the HTML, but still need to render RSC dynamically.
 */
export type FullHtmlPostponedState = {
  readonly type: DynamicState.FullHtml

  /**
   * The immutable resume data cache.
   */
  readonly renderResumeDataCache: RenderResumeDataCache
}

export type DynamicHTMLPostponedStateBase = {
  /**
   * The postponed data used by React.
   */
  readonly postponed: ReactPostponed

  /**
   * The immutable resume data cache.
   */
  readonly renderResumeDataCache: RenderResumeDataCache
}

/**
 * The postponed state for a partial prerender that produced an HTML shell,
 * but has dynamic holes.
 */
export type PartialHTMLPostponedState = {
  readonly type: DynamicState.PartialHtml
} & DynamicHTMLPostponedStateBase

/**
 * The postponed state for a partial prerender that produced no HTML shell.
 */
export type EmptyHTMLPostponedState = {
  readonly type: DynamicState.EmptyHtml
} & DynamicHTMLPostponedStateBase

export type PostponedState =
  | EmptyHTMLPostponedState
  | PartialHTMLPostponedState
  | FullHtmlPostponedState

function serializeStateParts(state: SerializedStateParts) {
  return lengthEncodeTupleWithTag(state)
}

function deserializeStateParts(serialized: string) {
  return lengthDecodeTupleWithTag(serialized) as SerializedStateParts
}

type SerializedStateParts =
  | SerializedFullHtml
  | SerializedEmptyHTML
  | SerializedPartialHTML

type SerializedFullHtml = [tag: DynamicState.FullHtml, resumeDataCache: string]

type SerializedDynamicHTMLBase = [
  resumeDataCache: string,
  /** JSON, but might need to have `replacements` applied before decoding */
  postponed: string,
  /** JSON */
  replacements: string,
]

type SerializedEmptyHTML = [
  tag: DynamicState.EmptyHtml,
  ...SerializedDynamicHTMLBase,
]

type SerializedPartialHTML = [
  tag: DynamicState.PartialHtml,
  ...SerializedDynamicHTMLBase,
]

type ParamReplacements = Array<[string, string]> | null

export async function getDynamicHTMLPostponedState(
  type: DynamicState.EmptyHtml | DynamicState.PartialHtml,
  postponed: ReactPostponed,
  fallbackRouteParams: FallbackRouteParams | null,
  resumeDataCache: PrerenderResumeDataCache | RenderResumeDataCache
): Promise<string> {
  const dataString = JSON.stringify(postponed)

  let replacements: ParamReplacements = null
  if (!fallbackRouteParams || fallbackRouteParams.size === 0) {
    replacements = null
  } else {
    replacements = Array.from(fallbackRouteParams)
  }
  const replacementsString = JSON.stringify(replacements)

  return serializeStateParts([
    type,
    await stringifyResumeDataCache(resumeDataCache),
    dataString,
    replacementsString,
  ])
}

export async function getFullHtmlPostponedState(
  resumeDataCache: PrerenderResumeDataCache | RenderResumeDataCache
): Promise<string> {
  return serializeStateParts([
    DynamicState.FullHtml,
    await stringifyResumeDataCache(
      createRenderResumeDataCache(resumeDataCache)
    ),
  ])
}

export function parsePostponedState(
  state: string,
  params: Params | undefined
): PostponedState {
  // If the deserialization fails, we can fall back to treating thisa s a `FullHtml` render,
  // i.e. as if the prerender produced full HTML but still needs dynamic RSC.
  // The HTML shell may in fact be incomplete or empty, but we should produce an RSC payload
  // that will let the browser client-render a functional page.
  try {
    const parts = deserializeStateParts(state)
    const tag = parts[0]
    switch (tag) {
      case DynamicState.FullHtml: {
        const [, resumeDataCacheString] = parts
        const renderResumeDataCache = createRenderResumeDataCache(
          resumeDataCacheString
        )
        return {
          type: DynamicState.FullHtml,
          renderResumeDataCache,
        }
      }
      case DynamicState.EmptyHtml:
      case DynamicState.PartialHtml: {
        let [, resumeDataCacheString, postponedString, replacementsString] =
          parts

        const renderResumeDataCache = createRenderResumeDataCache(
          resumeDataCacheString
        )
        try {
          const replacements = JSON.parse(
            replacementsString
          ) as ParamReplacements
          if (replacements) {
            for (const [key, searchValue] of replacements) {
              const value = params?.[key] ?? ''
              const replaceValue = Array.isArray(value)
                ? value.join('/')
                : value
              postponedString = postponedString.replaceAll(
                searchValue,
                replaceValue
              )
            }
          }

          return {
            type: tag,
            postponed: JSON.parse(postponedString),
            renderResumeDataCache,
          }
        } catch (err) {
          console.error('Failed to parse postponed state', err)
          return { type: DynamicState.FullHtml, renderResumeDataCache }
        }
      }
      default: {
        parts satisfies never
        throw new InvariantError(`Invalid postponed state tag: ${tag}`)
      }
    }
  } catch (err) {
    console.error('Failed to parse postponed state', err)
    return {
      type: DynamicState.FullHtml,
      renderResumeDataCache: createPrerenderResumeDataCache(),
    }
  }
}
