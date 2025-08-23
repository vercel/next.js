import { createPrerenderResumeDataCache } from '../resume-data-cache/resume-data-cache'
import {
  streamFromString,
  streamToString,
} from '../stream-utils/node-web-streams-helper'
import {
  DynamicState,
  getDynamicDataPostponedState,
  getDynamicHTMLPostponedState,
  parsePostponedState,
  DynamicHTMLPreludeState,
  type PostponedState,
} from './postponed-state'

it('can serialize and deserialize a HTML postponed state with fallback params and a nonempty resume data cache', async () => {
  const fallbackParam = '%%drp:slug:e9615126684e5%%'
  const fallbackRouteParams = new Map([['slug', fallbackParam]])
  const prerenderResumeDataCache = createPrerenderResumeDataCache()

  prerenderResumeDataCache.cache.set(
    '1',
    Promise.resolve({
      value: streamFromString('hello'),
      tags: [],
      stale: 0,
      timestamp: 0,
      expire: 0,
      revalidate: 0,
    })
  )

  const state = await getDynamicHTMLPostponedState(
    {
      [fallbackParam]: fallbackParam,
      nested: { [fallbackParam]: fallbackParam },
    },
    DynamicHTMLPreludeState.Full,
    fallbackRouteParams,
    prerenderResumeDataCache
  )

  const paramValue = '123'
  const parsed = parsePostponedState(state, { slug: paramValue })
  expect(parsed).toEqual({
    type: DynamicState.HTML,
    data: [
      DynamicHTMLPreludeState.Full,
      {
        [paramValue]: paramValue,
        nested: {
          [paramValue]: paramValue,
        },
      },
    ],
    renderResumeDataCache: expect.any(Object),
  } satisfies PostponedState)

  // Ensure that the replacement worked and removed all the placeholders.
  expect(JSON.stringify(parsed)).not.toContain(fallbackParam)

  const cacheValue = await parsed.renderResumeDataCache.cache.get('1')
  expect(cacheValue).toBeDefined()
  await expect(streamToString(cacheValue!.value)).resolves.toEqual('hello')
})

it('can serialize and deserialize a HTML postponed state with fallback params and an empty resume data cache', async () => {
  const fallbackParam = '%%drp:slug:e9615126684e5%%'
  const fallbackRouteParams = new Map([['slug', fallbackParam]])
  const state = await getDynamicHTMLPostponedState(
    { [fallbackParam]: fallbackParam },
    DynamicHTMLPreludeState.Full,
    fallbackRouteParams,
    createPrerenderResumeDataCache()
  )

  const paramValue = 'hello'
  const params = { slug: paramValue }
  const parsed = parsePostponedState(state, params)
  expect(parsed).toEqual({
    type: DynamicState.HTML,
    data: [DynamicHTMLPreludeState.Full, { [paramValue]: paramValue }],
    renderResumeDataCache: createPrerenderResumeDataCache(),
  } satisfies PostponedState)

  // The replacements have been replaced.
  expect(JSON.stringify(parsed)).not.toContain(fallbackParam)
})

it.each([
  {
    description: 'empty prelude',
    preludeState: DynamicHTMLPreludeState.Empty,
  },
  {
    description: 'non-empty prelude',
    preludeState: DynamicHTMLPreludeState.Full,
  },
])(
  'can serialize and deserialize a HTML postponed state with no fallback params - $description',
  async ({ preludeState }) => {
    const fallbackRouteParams = new Map()
    const postponed = { fake: 'state' }
    const state = await getDynamicHTMLPostponedState(
      postponed,
      preludeState,
      fallbackRouteParams,
      createPrerenderResumeDataCache()
    )

    const parsed = parsePostponedState(state, {})
    expect(parsed).toEqual({
      type: DynamicState.HTML,
      data: [preludeState, postponed],
      renderResumeDataCache: createPrerenderResumeDataCache(),
    } satisfies PostponedState)
  }
)

it('can serialize and deserialize a data postponed state', async () => {
  const prerenderResumeDataCache = createPrerenderResumeDataCache()
  prerenderResumeDataCache.cache.set(
    '1',
    Promise.resolve({
      value: streamFromString('hello'),
      tags: [],
      stale: 0,
      timestamp: 0,
      expire: 0,
      revalidate: 0,
    })
  )

  const state = await getDynamicDataPostponedState(prerenderResumeDataCache)
  const parsed = parsePostponedState(state, {})

  expect(parsed.type).toBe(DynamicState.DATA)

  const cacheValue = await parsed.renderResumeDataCache.cache.get('1')
  expect(cacheValue).toBeDefined()
  await expect(streamToString(cacheValue!.value)).resolves.toEqual('hello')
})
