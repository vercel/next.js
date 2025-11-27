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
} from './postponed-state'
import type {
  OpaqueFallbackRouteParams,
  OpaqueFallbackRouteParamValue,
} from '../request/fallback-params'

export function createMockOpaqueFallbackRouteParams(
  params: Record<string, OpaqueFallbackRouteParamValue>
): OpaqueFallbackRouteParams {
  return new Map(Object.entries(params))
}

const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('getDynamicHTMLPostponedState', () => {
  it('serializes a HTML postponed state with fallback params', async () => {
    const key = '%%drp:slug:e9615126684e5%%'
    const fallbackRouteParams = createMockOpaqueFallbackRouteParams({
      slug: [key, 'd'],
    })
    const prerenderResumeDataCache = createPrerenderResumeDataCache()

    prerenderResumeDataCache.cache.set(
      '1',
      Promise.resolve({
        value: streamFromString('hello'),
        tags: [],
        stale: 0,
        timestamp: 0,
        expire: 300,
        revalidate: 1,
      })
    )

    const state = await getDynamicHTMLPostponedState(
      { [key]: key, nested: { [key]: key } } as any,
      DynamicHTMLPreludeState.Full,
      fallbackRouteParams,
      prerenderResumeDataCache,
      isCacheComponentsEnabled
    )

    const parsed = parsePostponedState(state, { slug: '123' })

    expect(parsed).toMatchInlineSnapshot(`
     {
       "data": [
         1,
         {
           "123": "123",
           "nested": {
             "123": "123",
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
       },
       "type": 2,
     }
    `)

    const value = await parsed.renderResumeDataCache.cache.get('1')

    expect(value).toBeDefined()

    await expect(streamToString(value!.value)).resolves.toEqual('hello')
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

  it('can serialize and deserialize a HTML postponed state with fallback params', async () => {
    const key = '%%drp:slug:e9615126684e5%%'
    const fallbackRouteParams = createMockOpaqueFallbackRouteParams({
      slug: [key, 'd'],
    })
    const state = await getDynamicHTMLPostponedState(
      { [key]: key } as any,
      DynamicHTMLPreludeState.Full,
      fallbackRouteParams,
      createPrerenderResumeDataCache(),
      isCacheComponentsEnabled
    )

    const value = 'hello'
    const params = { slug: value }
    const parsed = parsePostponedState(state, params)
    expect(parsed).toEqual({
      type: DynamicState.HTML,
      data: [1, { [value]: value }],
      renderResumeDataCache: createPrerenderResumeDataCache(),
    })

    // The replacements have been replaced.
    expect(JSON.stringify(parsed)).not.toMatch(key)
  })
})

describe('getDynamicDataPostponedState', () => {
  it('serializes a data postponed state with fallback params', async () => {
    const state = await getDynamicDataPostponedState(
      createPrerenderResumeDataCache(),
      isCacheComponentsEnabled
    )
    expect(state).toMatchInlineSnapshot(`"4:nullnull"`)
  })
})

describe('parsePostponedState', () => {
  it('parses a HTML postponed state with fallback params', () => {
    const state = `2593:39[["slug","%%drp:slug:e9615126684e5%%"]][1,{"t":2,"d":{"nextSegmentId":2,"rootFormatContext":{"insertionMode":0,"selectedValue":null,"tagScope":0},"progressiveChunkSize":12800,"resumableState":{"idPrefix":"","nextFormID":0,"streamingFormat":0,"instructions":0,"hasBody":true,"hasHtml":true,"unknownResources":{},"dnsResources":{},"connectResources":{"default":{},"anonymous":{},"credentials":{}},"imageResources":{},"styleResources":{},"scriptResources":{"/_next/static/chunks/webpack-6b2534a6458c6fe5.js":null,"/_next/static/chunks/f5e865f6-5e04edf75402c5e9.js":null,"/_next/static/chunks/9440-26a4cfbb73347735.js":null,"/_next/static/chunks/main-app-315ef55d588dbeeb.js":null,"/_next/static/chunks/8630-8e01a4bea783c651.js":null,"/_next/static/chunks/app/layout-1b900e1a3caf3737.js":null},"moduleUnknownResources":{},"moduleScriptResources":{"/_next/static/chunks/webpack-6b2534a6458c6fe5.js":null}},"replayNodes":[["oR",0,[["Context.Provider",0,[["ServerInsertedHTMLProvider",0,[["Context.Provider",0,[["n7",0,[["nU",0,[["nF",0,[["n9",0,[["Fragment",0,[["Context.Provider",2,[["Context.Provider",0,[["Context.Provider",0,[["Context.Provider",0,[["Context.Provider",0,[["Context.Provider",0,[["nY",0,[["nX",0,[["Fragment","c",[["Fragment",0,[["html",1,[["body",0,[["main",3,[["j",0,[["Fragment",0,[["Context.Provider","validation",[["i",2,[["Fragment",0,[["E",0,[["R",0,[["h",0,[["Fragment",0,[["O",0,[["Fragment",0,[["s",0,[["c",0,[["s",0,[["c",0,[["v",0,[["Context.Provider",0,[["Fragment","c",[["j",1,[["Fragment",0,[["Context.Provider","slug|%%drp:slug:e9615126684e5%%|d",[["i",2,[["Fragment",0,[["E",0,[["R",0,[["h",0,[["Fragment",0,[["O",0,[["Fragment",0,[["s",0,[["Fragment",0,[["s",0,[["c",0,[["v",0,[["Context.Provider",0,[["Fragment","c",[["j",1,[["Fragment",0,[["Context.Provider","__PAGE__",[["i",2,[["Fragment",0,[["E",0,[["R",0,[["h",0,[["Fragment",0,[["O",0,[["Suspense",0,[["s",0,[["Fragment",0,[["s",0,[["c",0,[["v",0,[["Context.Provider",0,[["Fragment","c",[["Fragment",0,[],{"1":1}]],null]],null]],null]],null]],null]],null]],null]],null,["Suspense Fallback",0,[],null],0]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],"replaySlots":null}}]null`
    const params = {
      slug: Math.random().toString(16).slice(3),
    }
    const parsed = parsePostponedState(state, params)

    // Ensure that it parsed it correctly.
    expect(parsed).toEqual({
      type: DynamicState.HTML,
      data: expect.any(Object),
      renderResumeDataCache: createPrerenderResumeDataCache(),
    })

    // Ensure that the replacement worked and removed all the placeholders.
    expect(JSON.stringify(parsed)).not.toMatch(/%%drp:slug:e9615126684e5%%/)
  })

  it('parses a HTML postponed state without fallback params', () => {
    const state = `2:{}null`
    const params = {}
    const parsed = parsePostponedState(state, params)

    // Ensure that it parsed it correctly.
    expect(parsed).toEqual({
      type: DynamicState.HTML,
      data: expect.any(Object),
      renderResumeDataCache: createPrerenderResumeDataCache(),
    })
  })

  it('parses a data postponed state', () => {
    const state = '4:nullnull'
    const parsed = parsePostponedState(state, {})

    // Ensure that it parsed it correctly.
    expect(parsed).toEqual({
      type: DynamicState.DATA,
      renderResumeDataCache: createPrerenderResumeDataCache(),
    })
  })
})
