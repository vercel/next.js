import { runInNewContext } from 'vm'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  classifyClientReferenceManifestSource,
  evalClientReferenceManifestSource,
  evalManifest,
} from 'next/dist/server/load-manifest.external'
import { deepFreeze } from 'next/dist/shared/lib/deep-freeze'

const manifest = {
  moduleLoading: { prefix: '/_next/', crossOrigin: null },
  clientModules: {
    '[project]/app/page.tsx <module evaluation>': {
      id: 1,
      name: '*',
      chunks: ['static/chunks/a.js', ['static/chunks/b.js', 1, 2]],
      async: false,
    },
  },
  entryCSSFiles: { '[project]/app/page': [{ path: 'static/{css}/a.css' }] },
  entryJSFiles: { '[project]/app/page': ['static/chunks/a.js'] },
}

// Mirrors `build/webpack/plugins/flight-manifest-plugin.ts`.
function webpackSource(key: string, value: unknown = manifest) {
  return `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(
    key
  )}]=${JSON.stringify(value)};`
}

// Mirrors `crates/next-core/src/next_manifests/client_reference_manifest.rs`.
function turbopackSource(
  key: string,
  { deploymentId = false, value = manifest as unknown } = {}
) {
  const k = JSON.stringify(key)
  let source = `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST[${k}] = ${JSON.stringify(value)};
`
  if (deploymentId) {
    source += `for (const key in globalThis.__RSC_MANIFEST[${k}].clientModules) {
    const val = { ...globalThis.__RSC_MANIFEST[${k}].clientModules[key] }
    globalThis.__RSC_MANIFEST[${k}].clientModules[key] = val
    val.chunks = val.chunks.map((c) =>
        typeof c === 'string'
            ? \`\${c}?dpl=\${process.env.NEXT_DEPLOYMENT_ID}\`
            : [\`\${c[0]}?dpl=\${process.env.NEXT_DEPLOYMENT_ID}\`, c[1], c[2]])
}
`
  }
  return source
}

function evalInNewContext(source: string) {
  const contextObject = {
    process: { env: { NEXT_DEPLOYMENT_ID: process.env.NEXT_DEPLOYMENT_ID } },
  }
  runInNewContext(source, contextObject)
  return contextObject
}

// Objects created in another V8 context have different prototypes, so compare
// a structural JSON copy.
function plain(value: unknown) {
  return JSON.parse(JSON.stringify(value))
}

function expectSameAsNewContext(source: string) {
  expect(plain(evalClientReferenceManifestSource(source))).toEqual(
    plain(evalInNewContext(source))
  )
}

describe('evalClientReferenceManifestSource', () => {
  const originalDeploymentId = process.env.NEXT_DEPLOYMENT_ID

  afterEach(() => {
    if (originalDeploymentId === undefined) {
      delete process.env.NEXT_DEPLOYMENT_ID
    } else {
      process.env.NEXT_DEPLOYMENT_ID = originalDeploymentId
    }
  })

  it.each([
    ['webpack', webpackSource('/page')],
    ['turbopack', turbopackSource('/page')],
  ])('parses the %s shape as JSON', (_, source) => {
    expect(classifyClientReferenceManifestSource(source)).toEqual({
      type: 'json',
      key: '/page',
      value: manifest,
    })
    expectSameAsNewContext(source)
  })

  it('includes NEXT_DEPLOYMENT_ID in the result like the VM context', () => {
    process.env.NEXT_DEPLOYMENT_ID = 'dpl_123'
    const source = webpackSource('/page')
    expect(evalClientReferenceManifestSource(source).process).toEqual({
      env: { NEXT_DEPLOYMENT_ID: 'dpl_123' },
    })
    expectSameAsNewContext(source)
  })

  it.each([
    '/[teamSlug]/page',
    '/(group)/[...slug]/page',
    '/a"b]c\\d/page',
    '/\u00e9\u2028/page',
  ])('handles the entry name %j', (key) => {
    for (const source of [webpackSource(key), turbopackSource(key)]) {
      const kind = classifyClientReferenceManifestSource(source)
      expect(kind).toEqual({ type: 'json', key, value: manifest })
      expectSameAsNewContext(source)
    }
  })

  it('accepts escaped entry names', () => {
    const source = `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["\\u002fpage"]={"a":1};`
    expect(classifyClientReferenceManifestSource(source)).toEqual({
      type: 'json',
      key: '/page',
      value: { a: 1 },
    })
    expectSameAsNewContext(source)
  })

  it('evaluates the turbopack deployment ID shape in a reused context', () => {
    const source = turbopackSource('/page', { deploymentId: true })
    expect(classifyClientReferenceManifestSource(source)).toEqual({
      type: 'deployment-id',
    })

    process.env.NEXT_DEPLOYMENT_ID = 'dpl_1'
    const result = evalClientReferenceManifestSource(source)
    expect(
      plain(result.__RSC_MANIFEST!['/page']).clientModules[
        '[project]/app/page.tsx <module evaluation>'
      ].chunks
    ).toEqual([
      'static/chunks/a.js?dpl=dpl_1',
      ['static/chunks/b.js?dpl=dpl_1', 1, 2],
    ])
    expectSameAsNewContext(source)
  })

  it('does not leak state between deployment ID evaluations', () => {
    process.env.NEXT_DEPLOYMENT_ID = 'dpl_1'
    const first = deepFreeze(
      evalClientReferenceManifestSource(
        turbopackSource('/a/page', { deploymentId: true })
      )
    )

    process.env.NEXT_DEPLOYMENT_ID = 'dpl_2'
    const secondSource = turbopackSource('/b/page', { deploymentId: true })
    const second = evalClientReferenceManifestSource(secondSource)

    expect(Object.keys(first.__RSC_MANIFEST!)).toEqual(['/a/page'])
    expect(Object.keys(second.__RSC_MANIFEST!)).toEqual(['/b/page'])
    expect(first.process.env.NEXT_DEPLOYMENT_ID).toBe('dpl_1')
    expect(second.process.env.NEXT_DEPLOYMENT_ID).toBe('dpl_2')
    expect(plain(second)).toEqual(plain(evalInNewContext(secondSource)))
    expect(
      plain(first.__RSC_MANIFEST!['/a/page']).clientModules[
        '[project]/app/page.tsx <module evaluation>'
      ].chunks[0]
    ).toBe('static/chunks/a.js?dpl=dpl_1')
  })

  it('falls back to a new context when `__proto__` is present', () => {
    const source = webpackSource('/page', { __proto__: { polluted: true } })
    // JSON.stringify drops the prototype, so build the source by hand.
    const withProto = source.replace(
      /=\{\};$/,
      '={"__proto__":{"polluted":true}};'
    )
    expect(classifyClientReferenceManifestSource(withProto)).toEqual({
      type: 'unknown',
    })
    const result = evalClientReferenceManifestSource(withProto)
    expect(Object.keys(result.__RSC_MANIFEST!['/page'] as object)).toEqual([])
    expect((result.__RSC_MANIFEST!['/page'] as any).polluted).toBe(true)
  })

  it.each([
    [
      'webpack',
      `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/page"]={"a":{"__pr\\u006fto__":{"polluted":true}}};`,
    ],
    [
      'turbopack deployment ID',
      turbopackSource('/page', { deploymentId: true }).replace(
        '{"moduleLoading":',
        '{"__pr\\u006fto__":{"polluted":true},"moduleLoading":'
      ),
    ],
  ])(
    'falls back to a new context for an escaped `__proto__` key (%s)',
    (_, source) => {
      expect(classifyClientReferenceManifestSource(source)).toEqual({
        type: 'unknown',
      })
      expectSameAsNewContext(source)
      const result = evalClientReferenceManifestSource(source)
      const value = result.__RSC_MANIFEST!['/page'] as any
      const target = value.a ?? value
      expect(Object.hasOwn(target, '__proto__')).toBe(false)
      expect(target.polluted).toBe(true)
    }
  )

  it('falls back to a new context for an escaped `__proto__` entry name', () => {
    const source = `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["__pr\\u006fto__"]={"a":1};`
    expect(classifyClientReferenceManifestSource(source)).toEqual({
      type: 'unknown',
    })
    const result = evalClientReferenceManifestSource(source)
    expect(Object.hasOwn(result.__RSC_MANIFEST!, '__proto__')).toBe(false)
    expect((result.__RSC_MANIFEST as any).a).toBe(1)
  })

  it.each([
    ['trailing code', webpackSource('/page') + 'globalThis.extra = 1;'],
    [
      'trailing code on a new line',
      turbopackSource('/page') + 'globalThis.extra = 1;\n',
    ],
    [
      'a modified deployment ID suffix',
      turbopackSource('/page', { deploymentId: true }).replace(
        '?dpl=',
        '?other='
      ),
    ],
    [
      'an extra statement in the deployment ID suffix',
      turbopackSource('/page', { deploymentId: true }) +
        'globalThis.extra = 1\n',
    ],
    [
      'a non-JSON body',
      `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/page"]={a:1};`,
    ],
    [
      'code inside the body',
      `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/page"]={"a":1};globalThis.extra={"b":2};`,
    ],
    ['a missing prefix', `globalThis.__RSC_MANIFEST = {"/page": {"a": 1}};`],
    [
      'a single quoted key',
      `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST['/page']={"a":1};`,
    ],
  ])('falls back to a new context for %s', (_, source) => {
    expect(classifyClientReferenceManifestSource(source)).toEqual({
      type: 'unknown',
    })
    expectSameAsNewContext(source)
  })

  it('propagates errors from the fallback', () => {
    expect(() =>
      evalClientReferenceManifestSource('throw new Error("boom")')
    ).toThrow('boom')
  })

  it('isolates globals and intrinsics of unrecognized sources', () => {
    const first = evalClientReferenceManifestSource(
      'globalThis.leaked = 1; Array.prototype.polluted = true;'
    )
    expect(first.leaked).toBe(1)

    const second = evalClientReferenceManifestSource(
      'globalThis.sawLeak = typeof leaked; globalThis.sawPollution = [].polluted;'
    )
    expect(second.sawLeak).toBe('undefined')
    expect(second.sawPollution).toBeUndefined()
    expect((Array.prototype as any).polluted).toBeUndefined()
  })

  it('handles tricky entry names in the deployment ID shape', () => {
    process.env.NEXT_DEPLOYMENT_ID = 'dpl_1'
    for (const key of ['/[teamSlug]/page', '/a"b]c\\d/page']) {
      const source = turbopackSource(key, { deploymentId: true })
      expect(classifyClientReferenceManifestSource(source)).toEqual({
        type: 'deployment-id',
      })
      expectSameAsNewContext(source)
    }
  })

  it('falls back to a new context for a non-JSON body with the deployment ID suffix', () => {
    const source = turbopackSource('/page', { deploymentId: true }).replace(
      '{"moduleLoading":',
      '{moduleLoading:'
    )
    expect(classifyClientReferenceManifestSource(source)).toEqual({
      type: 'unknown',
    })
    expectSameAsNewContext(source)
  })

  it('recovers the reused context after a failing deployment ID evaluation', () => {
    process.env.NEXT_DEPLOYMENT_ID = 'dpl_1'
    // Recognized shape whose suffix throws because a chunk is not a string or
    // an array.
    const failing = turbopackSource('/bad/page', {
      deploymentId: true,
      value: { clientModules: { m: { chunks: null } } },
    })
    expect(classifyClientReferenceManifestSource(failing)).toEqual({
      type: 'deployment-id',
    })
    expect(() => evalClientReferenceManifestSource(failing)).toThrow()

    const source = turbopackSource('/page', { deploymentId: true })
    const result = evalClientReferenceManifestSource(source)
    expect(Object.keys(result.__RSC_MANIFEST!)).toEqual(['/page'])
    expect(plain(result)).toEqual(plain(evalInNewContext(source)))
  })
})

describe('evalManifest', () => {
  const originalDeploymentId = process.env.NEXT_DEPLOYMENT_ID
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'eval-manifest-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalDeploymentId === undefined) {
      delete process.env.NEXT_DEPLOYMENT_ID
    } else {
      process.env.NEXT_DEPLOYMENT_ID = originalDeploymentId
    }
  })

  function write(name: string, source: string) {
    const file = join(dir, name)
    writeFileSync(file, source)
    return file
  }

  it('caches and freezes the result', () => {
    const cache = new Map<string, unknown>()
    const file = write('page.js', webpackSource('/page'))
    const result = evalManifest<any>(file, true, cache)

    expect(plain(result.__RSC_MANIFEST['/page'])).toEqual(manifest)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.__RSC_MANIFEST['/page'].clientModules)).toBe(
      true
    )
    expect(evalManifest(file, true, cache)).toBe(result)
  })

  it('does not cache or freeze when caching is disabled', () => {
    const cache = new Map<string, unknown>()
    const file = write('page.js', turbopackSource('/page'))
    const result = evalManifest<any>(file, false, cache)
    expect(Object.isFrozen(result)).toBe(false)
    expect(cache.size).toBe(0)
  })

  it('returns undefined for a missing file when handleMissing is set', () => {
    const cache = new Map<string, unknown>()
    expect(
      evalManifest(join(dir, 'missing.js'), true, cache, true)
    ).toBeUndefined()
  })

  it('throws for an empty file', () => {
    const file = write('empty.js', '')
    expect(() => evalManifest(file, false)).toThrow('Manifest file is empty')
  })

  it('keeps frozen deployment ID results independent', () => {
    const cache = new Map<string, unknown>()
    process.env.NEXT_DEPLOYMENT_ID = 'dpl_a'
    const a = evalManifest<any>(
      write('a.js', turbopackSource('/a/page', { deploymentId: true })),
      true,
      cache
    )
    process.env.NEXT_DEPLOYMENT_ID = 'dpl_b'
    const b = evalManifest<any>(
      write('b.js', turbopackSource('/b/page', { deploymentId: true })),
      true,
      cache
    )

    expect(Object.isFrozen(a)).toBe(true)
    expect(Object.keys(a.__RSC_MANIFEST)).toEqual(['/a/page'])
    expect(Object.keys(b.__RSC_MANIFEST)).toEqual(['/b/page'])
    expect(b.process.env.NEXT_DEPLOYMENT_ID).toBe('dpl_b')
    expect(
      b.__RSC_MANIFEST['/b/page'].clientModules[
        '[project]/app/page.tsx <module evaluation>'
      ].chunks[0]
    ).toBe('static/chunks/a.js?dpl=dpl_b')
  })
})
