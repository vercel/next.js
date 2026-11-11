const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const [consumer, variant] = process.argv.slice(2)
const load = require('node:module').createRequire(
  path.join(consumer, 'package.json')
)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'next-edge-options-'))
const { openTestEnvironment } = load(
  'next/dist/experimental/testing/environments/runtime'
)
const { parseExecutionEnvironment } = load(
  'next/dist/experimental/testing/environments/config'
)
const variants = {
  default: {},
  initial: {
    'edge-runtime': { initialCode: 'globalThis.__edgeOptionSentinel=91' },
  },
  codeGeneration: {
    'edge-runtime': { codeGeneration: { strings: true, wasm: false } },
  },
  unknown: { ignored: { enabled: true } },
}

;(async () => {
  try {
    if (variant === 'nonserializable') {
      assert.throws(
        () =>
          parseExecutionEnvironment(
            'edge-runtime',
            { initialCode() {} },
            'test'
          ),
        /serializable across the file worker boundary/
      )
      console.log(
        JSON.stringify({
          variant,
          parserRefusalPreserved: true,
          providerNotExposed: !('EdgeRuntime' in globalThis),
        })
      )
      return
    }
    if (variant === 'cold' || variant === 'authored-nonconfig') {
      const owned = await openTestEnvironment(root, {
        name: 'edge-runtime',
        options: variants.initial,
      })
      assert.equal(EdgeRuntime, 'edge-runtime')
      assert.equal(
        await (await fetch('data:text/plain,cold-provider')).text(),
        'cold-provider'
      )
      if (variant === 'authored-nonconfig') {
        Object.defineProperty(globalThis, 'authoredEdgeBoundary', {
          value: true,
          configurable: false,
        })
        await assert.rejects(owned.dispose(), (error) => {
          assert.equal(
            error.message,
            'Test environment global restoration failed.'
          )
          assert.deepEqual(
            error.errors.map((value) => value.message),
            ['Cannot remove environment global authoredEdgeBoundary.']
          )
          return true
        })
      } else {
        await owned.dispose()
        await owned.dispose()
      }
      assert(!('EdgeRuntime' in globalThis))
      assert(!('FetchEvent' in globalThis))
      assert(!('__edgeOptionSentinel' in globalThis))
      console.log(
        JSON.stringify({
          variant,
          coldRealProvider: true,
          providerGlobalsRestored: true,
          authoredNonconfigGuardHeld: variant === 'authored-nonconfig',
        })
      )
      return
    }
    assert(Object.hasOwn(variants, variant))
    const options = variants[variant]
    const originalBytes = JSON.stringify(options)
    const host = { Response, Request, fetch, setTimeout, Event, Uint8Array }
    const names = [
      'EdgeRuntime',
      'FetchEvent',
      'URLPattern',
      'window',
      'self',
      'parent',
      'top',
      'addEventListener',
      'removeEventListener',
    ]
    const descriptors = new Map(
      names.map((name) => [
        name,
        Object.getOwnPropertyDescriptor(globalThis, name),
      ])
    )
    const selected = parseExecutionEnvironment('edge-runtime', options, 'test')
    const owned = await openTestEnvironment(root, selected)
    const event = new FetchEvent(new Request('https://example.test/edge/item'))
    event.respondWith(
      Promise.resolve(new Response('real-edge-response', { status: 201 }))
    )
    const response = await event.response
    const row = {
      edge: EdgeRuntime,
      ignoredInitialCode: typeof globalThis.__edgeOptionSentinel,
      functionCode: Function('return 7')(),
      response: { status: response.status, text: await response.text() },
      request: event.request.url,
      fetched: await (await fetch('data:text/plain,actual-data-fetch')).text(),
      matched: new URLPattern({ pathname: '/edge/:value' }).exec(
        'https://example.test/edge/item'
      ).pathname.groups.value,
      buffer: Buffer.from('edge').toString('hex'),
    }
    assert.deepEqual(row, {
      edge: 'edge-runtime',
      ignoredInitialCode: 'undefined',
      functionCode: 7,
      response: { status: 201, text: 'real-edge-response' },
      request: 'https://example.test/edge/item',
      fetched: 'actual-data-fetch',
      matched: 'item',
      buffer: '65646765',
    })
    assert(
      Object.entries(host).every(([key, value]) => globalThis[key] === value)
    )
    await owned.dispose()
    await owned.dispose()
    for (const [name, descriptor] of descriptors)
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(globalThis, name),
        descriptor,
        name
      )
    assert.equal(JSON.stringify(options), originalBytes)
    assert(!('__edgeOptionSentinel' in globalThis))
    console.log(
      JSON.stringify({
        variant,
        realProviderRow: true,
        optionsIgnoredAndUnmodified: true,
        hostGlobalsKept: true,
        providerGlobalsRestored: true,
        repeatedDispose: true,
      })
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
