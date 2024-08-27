import { DynamicState, parsePostponedState } from './postponed-state'

describe('parsePostponedState', () => {
  it('parses a HTML postponed state with fallback params', () => {
    const state = `F:39:[["slug","%%drp:slug:e9615126684e5%%"]]:{"t":2,"d":{"nextSegmentId":2,"rootFormatContext":{"insertionMode":0,"selectedValue":null,"tagScope":0},"progressiveChunkSize":12800,"resumableState":{"idPrefix":"","nextFormID":0,"streamingFormat":0,"instructions":0,"hasBody":true,"hasHtml":true,"unknownResources":{},"dnsResources":{},"connectResources":{"default":{},"anonymous":{},"credentials":{}},"imageResources":{},"styleResources":{},"scriptResources":{"/_next/static/chunks/webpack-6b2534a6458c6fe5.js":null,"/_next/static/chunks/f5e865f6-5e04edf75402c5e9.js":null,"/_next/static/chunks/9440-26a4cfbb73347735.js":null,"/_next/static/chunks/main-app-315ef55d588dbeeb.js":null,"/_next/static/chunks/8630-8e01a4bea783c651.js":null,"/_next/static/chunks/app/layout-1b900e1a3caf3737.js":null},"moduleUnknownResources":{},"moduleScriptResources":{"/_next/static/chunks/webpack-6b2534a6458c6fe5.js":null}},"replayNodes":[["oR",0,[["Context.Provider",0,[["ServerInsertedHTMLProvider",0,[["Context.Provider",0,[["n7",0,[["nU",0,[["nF",0,[["n9",0,[["Fragment",0,[["Context.Provider",2,[["Context.Provider",0,[["Context.Provider",0,[["Context.Provider",0,[["Context.Provider",0,[["Context.Provider",0,[["nY",0,[["nX",0,[["Fragment","c",[["Fragment",0,[["html",1,[["body",0,[["main",3,[["j",0,[["Fragment",0,[["Context.Provider","validation",[["i",2,[["Fragment",0,[["E",0,[["R",0,[["h",0,[["Fragment",0,[["O",0,[["Fragment",0,[["s",0,[["c",0,[["s",0,[["c",0,[["v",0,[["Context.Provider",0,[["Fragment","c",[["j",1,[["Fragment",0,[["Context.Provider","slug|%%drp:slug:e9615126684e5%%|d",[["i",2,[["Fragment",0,[["E",0,[["R",0,[["h",0,[["Fragment",0,[["O",0,[["Fragment",0,[["s",0,[["Fragment",0,[["s",0,[["c",0,[["v",0,[["Context.Provider",0,[["Fragment","c",[["j",1,[["Fragment",0,[["Context.Provider","__PAGE__",[["i",2,[["Fragment",0,[["E",0,[["R",0,[["h",0,[["Fragment",0,[["O",0,[["Suspense",0,[["s",0,[["Fragment",0,[["s",0,[["c",0,[["v",0,[["Context.Provider",0,[["Fragment","c",[["Fragment",0,[],{"1":1}]],null]],null]],null]],null]],null]],null]],null]],null,["Suspense Fallback",0,[],null],0]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],null]],"replaySlots":null}}`
    const params = {
      slug: Math.random().toString(16).slice(3),
    }
    const parsed = parsePostponedState(state, params)

    // Ensure that it parsed it correctly.
    expect(parsed).toEqual({
      type: DynamicState.HTML,
      data: expect.any(Object),
    })

    // Ensure that the replacement worked and removed all the placeholders.
    expect(JSON.stringify(parsed)).not.toMatch(/%%drp:slug:e9615126684e5%%/)
  })

  it('parses a HTML postponed state without fallback params', () => {
    const state = `{}`
    const params = {}
    const parsed = parsePostponedState(state, params)

    // Ensure that it parsed it correctly.
    expect(parsed).toEqual({
      type: DynamicState.HTML,
      data: expect.any(Object),
    })
  })

  it('parses a data postponed state', () => {
    const state = 'null'
    const parsed = parsePostponedState(state, undefined)

    // Ensure that it parsed it correctly.
    expect(parsed).toEqual({
      type: DynamicState.DATA,
    })
  })
})
