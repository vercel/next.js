import {
  createPrerenderResumeDataCache,
  deflateResumeDataCache,
  stringifyResumeDataCache,
} from '../resume-data-cache/resume-data-cache'
import {
  streamFromString,
  streamToString,
} from '../stream-utils/node-web-streams-helper'
import {
  DynamicState,
  getDynamicDataPostponedState,
  getDynamicHTMLPostponedState,
  parseResumeDataCacheFromPostponedState,
  parsePostponedState,
  DynamicHTMLPreludeState,
  isEmptyHTMLPrelude,
} from './postponed-state'
import type { OpaqueFallbackRouteParams } from '../request/fallback-params'
import { CachedRouteKind } from '../response-cache/types'

export function createMockOpaqueFallbackRouteParams(
  params: Record<string, string>
): OpaqueFallbackRouteParams {
  return new Map(Object.entries(params))
}

const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('getDynamicHTMLPostponedState', () => {
  it('serializes a HTML postponed state with fallback params', async () => {
    const key = '%%drp:slug:e9615126684e5%%'
    const fallbackRouteParams = createMockOpaqueFallbackRouteParams({
      slug: key,
    })
    const prerenderResumeDataCache = createPrerenderResumeDataCache()

    prerenderResumeDataCache.cache.set(
      '1',
      Promise.resolve({
        entry: {
          value: streamFromString('hello'),
          tags: [],
          stale: 0,
          timestamp: 0,
          expire: 300,
          revalidate: 1,
        },
        hasExplicitRevalidate: true,
        hasExplicitExpire: true,
        readRootParamNames: undefined,
        dynamicNestedCacheError: undefined,
      })
    )

    const state = await getDynamicHTMLPostponedState(
      { key: 'slug|d', nested: { key: 'slug|d' } } as any,
      DynamicHTMLPreludeState.Full,
      fallbackRouteParams,
      prerenderResumeDataCache,
      isCacheComponentsEnabled
    )

    const parsed = parsePostponedState(state, undefined)

    expect(state).not.toContain(key)
    expect(parsed).toMatchInlineSnapshot(`
     {
       "data": [
         1,
         {
           "key": "slug|d",
           "nested": {
             "key": "slug|d",
           },
         },
       ],
       "renderResumeDataCache": {
         "cache": Map {
           "1" => Promise {},
         },
         "decryptedBoundArgs": Map {},
         "encryptedBoundArgs": Map {},
         "fetch": Map {},
         "imageResponses": Map {},
         "mutable": false,
       },
       "stagedFallbackParams": Set {
         "slug",
       },
       "type": 2,
     }
    `)

    const value = await parsed.renderResumeDataCache.cache.get('1')

    expect(value).toBeDefined()

    await expect(streamToString(value!.entry.value)).resolves.toEqual('hello')
  })

  it('serializes a HTML postponed state without fallback params', async () => {
    const state = await getDynamicHTMLPostponedState(
      { key: 'value' } as any,
      DynamicHTMLPreludeState.Full,
      null,
      createPrerenderResumeDataCache(),
      isCacheComponentsEnabled
    )
    expect(state).toMatchInlineSnapshot(`"19:[1,{"key":"value"}]null"`)
  })

  it.each(['d', 'c', 'oc'] as const)(
    'only persists param names when resuming an HTML state with %s params',
    async (paramType) => {
      const key = '%%drp:slug:e9615126684e5%%'
      const fallbackRouteParams = createMockOpaqueFallbackRouteParams({
        slug: key,
      })
      const postponed = {
        replayNodes: [['Context.Provider', `slug|${paramType}`, [], null]],
      }
      const state = await getDynamicHTMLPostponedState(
        postponed as any,
        DynamicHTMLPreludeState.Full,
        fallbackRouteParams,
        createPrerenderResumeDataCache(),
        isCacheComponentsEnabled
      )

      const dataString = JSON.stringify([
        DynamicHTMLPreludeState.Full,
        postponed,
      ])
      const postponedString = `8["slug"]${dataString}`
      expect(state).toBe(`${postponedString.length}:${postponedString}null`)
      const parsed = parsePostponedState(state, undefined)
      expect(parsed).toEqual({
        type: DynamicState.HTML,
        stagedFallbackParams: new Set(['slug']),
        data: [1, postponed],
        renderResumeDataCache: {
          cache: new Map(),
          fetch: new Map(),
          encryptedBoundArgs: new Map(),
          decryptedBoundArgs: new Map(),
          imageResponses: new Map(),
          mutable: false,
        },
      })
    }
  )
})

describe('getDynamicDataPostponedState', () => {
  it.each([undefined, null, new Map()])(
    'serializes a data postponed state with no fallback params (%p)',
    async (fallbackRouteParams) => {
      const state = await getDynamicDataPostponedState(
        createPrerenderResumeDataCache(),
        isCacheComponentsEnabled,
        undefined,
        false,
        fallbackRouteParams
      )
      expect(state).toBe(
        fallbackRouteParams === undefined ? '4:nullnull' : '7:2[]nullnull'
      )
      const parsed = parsePostponedState(state, undefined)
      expect(parsed.type).toBe(DynamicState.DATA)
      expect(isEmptyHTMLPrelude(state)).toBe(false)
      expect(parsed.stagedFallbackParams).toBe(
        fallbackRouteParams === undefined ? undefined : null
      )
    }
  )

  it.each([false, true])(
    'serializes and parses fallback params and a cache (disableResumeDataCacheCompression: %s)',
    async (disableResumeDataCacheCompression) => {
      const fallbackRouteParams = createMockOpaqueFallbackRouteParams({
        slug: '%%drp:slug:e9615126684e5%%',
      })
      const resumeDataCache = createPrerenderResumeDataCache()
      resumeDataCache.fetch.set('cache-key', {
        kind: CachedRouteKind.FETCH,
        data: {
          headers: {},
          body: 'cached body',
          url: 'https://example.com',
        },
        revalidate: 60,
      })

      const serializedResumeDataCache = await stringifyResumeDataCache(
        resumeDataCache,
        isCacheComponentsEnabled
      )
      const state = await getDynamicDataPostponedState(
        resumeDataCache,
        isCacheComponentsEnabled,
        undefined,
        disableResumeDataCacheCompression,
        fallbackRouteParams
      )

      expect(state).toBe(
        `13:8["slug"]null${
          disableResumeDataCacheCompression
            ? serializedResumeDataCache
            : deflateResumeDataCache(serializedResumeDataCache)
        }`
      )

      const parsed = parsePostponedState(
        state,
        undefined,
        disableResumeDataCacheCompression
      )
      expect(parsed.type).toBe(DynamicState.DATA)
      expect(isEmptyHTMLPrelude(state)).toBe(false)
      expect(parsed.stagedFallbackParams).toEqual(new Set(['slug']))
      expect(parsed.renderResumeDataCache.fetch.get('cache-key')).toEqual(
        resumeDataCache.fetch.get('cache-key')
      )
      expect(
        parseResumeDataCacheFromPostponedState(
          state,
          undefined,
          disableResumeDataCacheCompression
        ).fetch.get('cache-key')
      ).toEqual(resumeDataCache.fetch.get('cache-key'))
    }
  )

  it('warns when the uncompressed state would exceed the size limit', async () => {
    const resumeDataCache = createPrerenderResumeDataCache()
    resumeDataCache.fetch.set('cache-key', {
      kind: CachedRouteKind.FETCH,
      data: {
        headers: {},
        body: '💥'.repeat(2048),
        url: 'https://example.com',
      },
      revalidate: 60,
    })

    const serializedResumeDataCache = await stringifyResumeDataCache(
      resumeDataCache,
      isCacheComponentsEnabled
    )
    const uncompressedStateByteLength = Buffer.byteLength(
      `4:null${serializedResumeDataCache}`
    )
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    await getDynamicDataPostponedState(
      resumeDataCache,
      isCacheComponentsEnabled,
      uncompressedStateByteLength
    )
    expect(warn).not.toHaveBeenCalled()

    await getDynamicDataPostponedState(
      resumeDataCache,
      isCacheComponentsEnabled,
      uncompressedStateByteLength - 1
    )
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `The uncompressed postponed state is ${uncompressedStateByteLength} bytes`
      )
    )

    warn.mockRestore()
  })
})

describe('isEmptyHTMLPrelude', () => {
  it.each([DynamicHTMLPreludeState.Empty, DynamicHTMLPreludeState.Full])(
    'reads prelude state %s independently of the fallback names',
    async (preludeState) => {
      for (const fallbackRouteParams of [
        null,
        new Map(),
        createMockOpaqueFallbackRouteParams({
          category: '%%drp:category:1%%',
          parts: '%%drp:parts:1%%',
        }),
      ]) {
        const state = await getDynamicHTMLPostponedState(
          { key: 'category|d' } as any,
          preludeState,
          fallbackRouteParams,
          createPrerenderResumeDataCache(),
          isCacheComponentsEnabled
        )

        expect(isEmptyHTMLPrelude(state)).toBe(
          preludeState === DynamicHTMLPreludeState.Empty
        )
        expect(
          parsePostponedState(state, undefined).stagedFallbackParams
        ).toEqual(
          fallbackRouteParams?.size ? new Set(['category', 'parts']) : null
        )
      }
    }
  )
})

describe('parseResumeDataCacheFromPostponedState', () => {
  it('extracts the resume data cache without parsing the React state', async () => {
    const key = '%%drp:slug:e9615126684e5%%'
    const fallbackRouteParams = createMockOpaqueFallbackRouteParams({
      slug: key,
    })
    const prerenderResumeDataCache = createPrerenderResumeDataCache()

    prerenderResumeDataCache.cache.set(
      'cache-key',
      Promise.resolve({
        entry: {
          value: streamFromString('cached value'),
          tags: [],
          stale: 0,
          timestamp: 0,
          expire: 300,
          revalidate: 1,
        },
        hasExplicitRevalidate: true,
        hasExplicitExpire: true,
        readRootParamNames: undefined,
        dynamicNestedCacheError: undefined,
      })
    )

    const state = await getDynamicHTMLPostponedState(
      { [key]: key } as any,
      DynamicHTMLPreludeState.Full,
      fallbackRouteParams,
      prerenderResumeDataCache,
      isCacheComponentsEnabled
    )

    const resumeDataCache = parseResumeDataCacheFromPostponedState(
      state,
      undefined
    )
    const value = await resumeDataCache.cache.get('cache-key')

    expect(value).toBeDefined()
    await expect(streamToString(value!.entry.value)).resolves.toBe(
      'cached value'
    )
  })
})

describe('parsePostponedState', () => {
  it('parses a HTML postponed state with fallback params', () => {
    const state = `68:8["slug"][1,{"replayNodes":[["Context.Provider","slug|d",[],null]]}]null`
    const parsed = parsePostponedState(state, undefined)

    // Ensure that it parsed it correctly.
    expect(parsed).toEqual({
      type: DynamicState.HTML,
      stagedFallbackParams: new Set(['slug']),
      data: [
        DynamicHTMLPreludeState.Full,
        { replayNodes: [['Context.Provider', 'slug|d', [], null]] },
      ],
      renderResumeDataCache: {
        cache: new Map(),
        fetch: new Map(),
        encryptedBoundArgs: new Map(),
        decryptedBoundArgs: new Map(),
        imageResponses: new Map(),
        mutable: false,
      },
    })
  })

  it('parses a HTML postponed state without fallback params', () => {
    const state = `2:{}null`
    const parsed = parsePostponedState(state, undefined)

    // Ensure that it parsed it correctly.
    expect(parsed).toEqual({
      type: DynamicState.HTML,
      stagedFallbackParams: null,
      data: expect.any(Object),
      renderResumeDataCache: {
        cache: new Map(),
        fetch: new Map(),
        encryptedBoundArgs: new Map(),
        decryptedBoundArgs: new Map(),
        imageResponses: new Map(),
        mutable: false,
      },
    })
  })

  it('parses a legacy data postponed state', () => {
    const state = '4:nullnull'
    const parsed = parsePostponedState(state, undefined)

    // Ensure that it parsed it correctly.
    expect(parsed).toEqual({
      type: DynamicState.DATA,
      renderResumeDataCache: {
        cache: new Map(),
        fetch: new Map(),
        encryptedBoundArgs: new Map(),
        decryptedBoundArgs: new Map(),
        imageResponses: new Map(),
        mutable: false,
      },
    })
    expect(parsed).not.toHaveProperty('stagedFallbackParams')
  })
})
