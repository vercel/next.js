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
   * The dynamic access occurred during the RSC render phase.
   */
  DATA = 1,

  /**
   * The dynamic access occurred during the HTML shell render phase.
   */
  HTML = 2,
}

/**
 * The postponed state for dynamic data.
 */
export type DynamicDataPostponedState = {
  /**
   * The type of dynamic state.
   */
  readonly type: DynamicState.DATA

  /**
   * The immutable resume data cache.
   */
  readonly renderResumeDataCache: RenderResumeDataCache
}

/**
 * The postponed state for dynamic HTML.
 */
export type DynamicHTMLPostponedState = {
  /**
   * The type of dynamic state.
   */
  readonly type: DynamicState.HTML

  /**
   * The postponed data used by React.
   */
  readonly data: [
    preludeState: DynamicHTMLPreludeState,
    postponed: ReactPostponed,
  ]

  /**
   * The immutable resume data cache.
   */
  readonly renderResumeDataCache: RenderResumeDataCache
}

export const enum DynamicHTMLPreludeState {
  Empty = 0,
  Full = 1,
}

type ReactPostponed = NonNullable<
  import('react-dom/static').PrerenderResult['postponed']
>

export type PostponedState =
  | DynamicDataPostponedState
  | DynamicHTMLPostponedState

function serializeStateParts(state: SerializedStateParts) {
  return lengthEncodeTupleWithTag(state)
}

function deserializeStateParts(serialized: string) {
  return lengthDecodeTupleWithTag(serialized) as SerializedStateParts
}

type SerializedStateParts = SerializedDynamicData | SerializedDynamicHTML

type SerializedDynamicData = [tag: DynamicState.DATA, resumeDataCache: string]

type SerializedDynamicHTML = [
  tag: DynamicState.HTML,
  resumeDataCache: string,
  /** JSON, but might need to have `replacements` applied before decoding */
  postponed: string,
  /** JSON */
  replacements: string,
]

type ParamReplacements = Array<[string, string]> | null

export async function getDynamicHTMLPostponedState(
  postponed: ReactPostponed,
  preludeState: DynamicHTMLPreludeState,
  fallbackRouteParams: FallbackRouteParams | null,
  resumeDataCache: PrerenderResumeDataCache | RenderResumeDataCache
): Promise<string> {
  const data: DynamicHTMLPostponedState['data'] = [preludeState, postponed]
  const dataString = JSON.stringify(data)

  let replacements: ParamReplacements = null
  if (!fallbackRouteParams || fallbackRouteParams.size === 0) {
    replacements = null
  } else {
    replacements = Array.from(fallbackRouteParams)
  }
  const replacementsString = JSON.stringify(replacements)

  return serializeStateParts([
    DynamicState.HTML,
    await stringifyResumeDataCache(resumeDataCache),
    dataString,
    replacementsString,
  ])
}

export async function getDynamicDataPostponedState(
  resumeDataCache: PrerenderResumeDataCache | RenderResumeDataCache
): Promise<string> {
  return serializeStateParts([
    DynamicState.DATA,
    await stringifyResumeDataCache(
      createRenderResumeDataCache(resumeDataCache)
    ),
  ])
}

export function parsePostponedState(
  state: string,
  params: Params | undefined
): PostponedState {
  try {
    const parts = deserializeStateParts(state)
    const tag = parts[0]
    switch (tag) {
      case DynamicState.DATA: {
        const [, resumeDataCacheString] = parts
        const renderResumeDataCache = createRenderResumeDataCache(
          resumeDataCacheString
        )
        return {
          type: DynamicState.DATA,
          renderResumeDataCache,
        }
      }
      case DynamicState.HTML: {
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
            type: DynamicState.HTML,
            data: JSON.parse(postponedString),
            renderResumeDataCache,
          }
        } catch (err) {
          console.error('Failed to parse postponed state', err)
          return { type: DynamicState.DATA, renderResumeDataCache }
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
      type: DynamicState.DATA,
      renderResumeDataCache: createPrerenderResumeDataCache(),
    }
  }
}

export function getPostponedFromState(state: DynamicHTMLPostponedState) {
  const [preludeState, postponed] = state.data
  return { preludeState, postponed }
}
