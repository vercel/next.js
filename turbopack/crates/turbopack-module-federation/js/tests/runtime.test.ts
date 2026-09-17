import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { afterEach, describe, it } from 'node:test'

import { consumeShared, consumeSharedAsync } from '../src/consume-shared'
import { createContainer } from '../src/container'
import {
  loadRemoteContainer,
  loadRemoteContainerFromFallbacks,
  loadRemoteModuleFromContainer,
  parseRemoteConfig,
  parseRemoteSyntax,
  REMOTE_SCRIPT_LOAD_TIMEOUT_MS,
  REMOTE_SCRIPT_RETRY_BASE_DELAY_MS,
  REMOTE_SCRIPT_RETRY_MAX_JITTER_MS,
} from '../src/remote-loader'
import reservedContainerNames from '../src/reserved-container-names.json'
import {
  createShareScope,
  getSharedVersions,
  registerShared,
  registerSharedGetter,
  setShareScope,
  type ShareScope,
} from '../src/share-runtime'
import { parseRange, parseVersion, satisfy, versionLt } from '../src/semver'

const require = createRequire(import.meta.url)
const webpackSemver = require('webpack/lib/util/semver') as {
  parseRange(value: string): unknown[]
  parseVersion(value: string): unknown[]
  satisfy(range: unknown[], version: string): boolean
  versionLt(left: string, right: string): boolean
}

let id = 0
const installedGlobals: string[] = []

function uniqueName(prefix: string): string {
  id++
  return `${prefix}${process.pid}_${id}`
}

function installGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
    writable: true,
  })
  installedGlobals.push(name)
}

afterEach(() => {
  for (const name of installedGlobals.splice(0)) {
    Reflect.deleteProperty(globalThis, name)
  }
})

describe('Webpack semver compatibility', () => {
  const versions = [
    '0.0.0',
    '0.1.0',
    '1.0.0',
    '1.2.3',
    '1.2.3-alpha.1',
    '1.2.3+build.5',
    '1.10.0',
    '2.0.0',
    '10.0.0',
  ]
  const ranges = [
    '',
    '*',
    '1',
    '1.2',
    '1.2.3',
    '^1.2.3',
    '^0.2.3',
    '^0.0.3',
    '~1.2.3',
    '>=1.0.0',
    '>1.0.0',
    '<2.0.0',
    '<=1.2.3',
    '1.0.0 - 2.0.0',
    '^1.0.0 || >=2.0.0',
    '!=1.2.3',
    '1.0.0-alpha ',
    '>=1.0.0-alpha ',
    '!1.2.3 ',
  ]

  it('uses Webpack-compatible version parsing and ordering', () => {
    for (const version of versions) {
      assert.deepEqual(
        parseVersion(version),
        webpackSemver.parseVersion(version)
      )
    }

    for (const left of versions) {
      for (const right of versions) {
        assert.equal(
          versionLt(left, right),
          webpackSemver.versionLt(left, right),
          `${left} < ${right}`
        )
      }
    }
  })

  it('uses Webpack-compatible range parsing and satisfaction', () => {
    for (const value of ranges) {
      const range = parseRange(value)
      const webpackRange = webpackSemver.parseRange(value)
      assert.deepEqual(range, webpackRange, `parseRange(${value})`)

      for (const version of versions) {
        assert.equal(
          satisfy(range, version),
          webpackSemver.satisfy(webpackRange, version),
          `${version} satisfies ${value}`
        )
      }
    }
  })
})

describe('Webpack share ABI', () => {
  it('registers a getter which returns a module factory', () => {
    const scope = createShareScope()
    const module = { source: 'turbopack' }
    registerShared(scope, 'react', '19.0.0', () => module, false, 'remote')

    const entry = getSharedVersions(scope, 'react')?.['19.0.0']
    assert.ok(entry)
    const factory = entry.get()
    assert.equal(typeof factory, 'function')
    assert.equal((factory as () => unknown)(), module)
  })

  it('consumes a synchronous Webpack-shaped getter', () => {
    const shareScope = uniqueName('share')
    const scope = createShareScope()
    const module = { source: 'webpack' }
    registerSharedGetter(
      scope,
      'react',
      '19.0.0',
      () => () => module,
      false,
      'webpack-host'
    )

    const consumed = consumeFrom(scope, shareScope, {
      shareKey: 'react',
      requiredVersion: '^19.0.0',
    })
    assert.equal(consumed, module)
    assert.equal(getSharedVersions(scope, 'react')?.['19.0.0'].loaded, 1)
  })

  it('consumes an asynchronous Webpack-shaped getter', async () => {
    const shareScope = uniqueName('share')
    const scope = createShareScope()
    const module = { source: 'webpack-async' }
    registerSharedGetter(
      scope,
      'react',
      '19.0.0',
      async () => () => module,
      false,
      'webpack-host'
    )

    const consumed = await consumeFromAsync(scope, shareScope, {
      shareKey: 'react',
      requiredVersion: '^19.0.0',
    })
    assert.equal(consumed, module)
  })

  it('selects the highest satisfying version', () => {
    const shareScope = uniqueName('share')
    const scope = createShareScope()
    registerShared(scope, 'library', '1.0.0', () => 'one')
    registerShared(scope, 'library', '1.5.0', () => 'one-five')
    registerShared(scope, 'library', '2.0.0', () => 'two')

    assert.equal(
      consumeFrom(scope, shareScope, {
        shareKey: 'library',
        requiredVersion: '^1.0.0',
      }),
      'one-five'
    )
  })
})

describe('container and remote protocol', () => {
  it('exposes the standard get/init container ABI', async () => {
    const name = uniqueName('TurbopackContainer')
    const shareScopeName = uniqueName('scope')
    const localShareScope = createShareScope()
    registerShared(localShareScope, 'react', '19.0.0', () => 'react')

    const container = createContainer(
      name,
      shareScopeName,
      { './value': async () => () => ({ value: 42 }) },
      { localShareScope }
    )
    installedGlobals.push(name)

    const hostScope = createShareScope()
    const initScope: unknown[] = []
    await container.init(hostScope, initScope)
    const factory = await container.get('./value', [])

    assert.deepEqual(factory(), { value: 42 })
    assert.ok(getSharedVersions(hostScope, 'react')?.['19.0.0'])
    assert.ok(initScope.length > 0)
    await assert.rejects(container.get('./missing'))
    assert.throws(() => container.init(createShareScope(), []))
  })

  it('uses an already-installed Webpack container without a DOM', async () => {
    const name = uniqueName('WebpackContainer')
    let receivedScope: ShareScope | undefined
    let receivedInitScope: unknown[] | undefined
    let receivedGetScope: unknown
    const container = {
      init(scope: ShareScope, initScope?: unknown[]) {
        receivedScope = scope
        receivedInitScope = initScope
      },
      async get(request: string, getScope?: unknown) {
        assert.equal(request, './button')
        receivedGetScope = getScope
        return () => ({ source: 'webpack' })
      },
    }
    installGlobal(name, container)

    assert.equal(
      await loadRemoteContainer(name, 'https://example.test/remote.js'),
      container
    )

    const initScope: unknown[] = []
    const getScope: unknown[] = []
    assert.deepEqual(
      await loadRemoteModuleFromContainer(
        container,
        'button',
        uniqueName('scope'),
        initScope,
        getScope
      ),
      { source: 'webpack' }
    )
    assert.ok(receivedScope)
    assert.equal(receivedInitScope, initScope)
    assert.equal(receivedGetScope, getScope)
  })

  it('does not hide a malformed truthy external behind a fallback', async () => {
    const malformedName = uniqueName('MalformedContainer')
    const fallbackName = uniqueName('FallbackContainer')
    installGlobal(malformedName, {})
    installGlobal(fallbackName, {
      init() {},
      async get() {
        return () => 'fallback'
      },
    })

    await assert.rejects(
      loadRemoteContainerFromFallbacks([
        {
          name: malformedName,
          shareScope: 'default',
          url: 'https://one.test/remote.js',
        },
        {
          name: fallbackName,
          shareScope: 'default',
          url: 'https://two.test/remote.js',
        },
      ]),
      /not a Module Federation container/
    )
  })

  it('retries one failed script with bounded jitter before falling back', async () => {
    const primaryName = uniqueName('PrimaryContainer')
    const fallbackName = uniqueName('FallbackContainer')
    const primaryUrl = 'https://primary.test/remote.js'
    const fallbackUrl = 'https://fallback.test/remote.js'
    const scripts: Array<{
      async: boolean
      onerror: (() => void) | null
      onload: (() => void) | null
      remove(): void
      src: string
    }> = []
    const delays: number[] = []
    const originalDocument = Object.getOwnPropertyDescriptor(
      globalThis,
      'document'
    )
    const originalRandom = Math.random
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout

    Math.random = () => 0.5
    globalThis.setTimeout = ((callback: () => void, delay?: number) => {
      const normalizedDelay = delay || 0
      delays.push(normalizedDelay)
      if (normalizedDelay < REMOTE_SCRIPT_LOAD_TIMEOUT_MS) {
        queueMicrotask(callback)
      }
      return 1
    }) as typeof setTimeout
    globalThis.clearTimeout = (() => undefined) as typeof clearTimeout

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement() {
          return {
            async: false,
            onerror: null,
            onload: null,
            remove() {},
            src: '',
          }
        },
        head: {
          appendChild(script: (typeof scripts)[number]) {
            scripts.push(script)
            if (scripts.length === 1) {
              queueMicrotask(() => script.onerror?.())
            } else {
              installGlobal(primaryName, {
                init() {},
                async get() {
                  return () => 'primary'
                },
              })
              queueMicrotask(() => script.onload?.())
            }
            return script
          },
        },
      },
    })
    installGlobal(fallbackName, {
      init() {},
      async get() {
        return () => 'fallback'
      },
    })

    try {
      const loaded = await loadRemoteContainerFromFallbacks([
        { name: primaryName, shareScope: 'default', url: primaryUrl },
        { name: fallbackName, shareScope: 'default', url: fallbackUrl },
      ])
      assert.equal(loaded.remote.name, primaryName)
      assert.deepEqual(
        scripts.map((script) => script.src),
        [primaryUrl, primaryUrl]
      )
      assert.ok(
        delays.includes(
          REMOTE_SCRIPT_RETRY_BASE_DELAY_MS +
            Math.floor(0.5 * (REMOTE_SCRIPT_RETRY_MAX_JITTER_MS + 1))
        )
      )
    } finally {
      Math.random = originalRandom
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
      if (originalDocument) {
        Object.defineProperty(globalThis, 'document', originalDocument)
      } else {
        Reflect.deleteProperty(globalThis, 'document')
      }
    }
  })

  it('accepts callable containers with get and init properties', async () => {
    const name = uniqueName('CallableContainer')
    const container = Object.assign(() => undefined, {
      init() {},
      async get() {
        return () => 'callable'
      },
    })
    installGlobal(name, container)

    assert.equal(
      await loadRemoteContainer(name, 'https://example.test/remote.js'),
      container
    )
  })

  it('warns on selected-container init failure and still calls get', async () => {
    const warning = new Error('share init failed')
    const originalWarn = console.warn
    const warnings: unknown[][] = []
    console.warn = (...args: unknown[]) => warnings.push(args)
    try {
      const container = {
        init() {
          throw warning
        },
        async get() {
          return () => 'value'
        },
      }

      assert.equal(
        await loadRemoteModuleFromContainer(
          container,
          './value',
          uniqueName('scope')
        ),
        'value'
      )
      assert.match(String(warnings[0]?.[0]), /share init failed/)
    } finally {
      console.warn = originalWarn
    }
  })

  it('rejects different objects for one runtime share scope', () => {
    const shareScopeName = uniqueName('scope')
    const firstName = uniqueName('TurbopackContainer')
    const secondName = uniqueName('TurbopackContainer')
    const first = createContainer(firstName, shareScopeName, {})
    const second = createContainer(secondName, shareScopeName, {})
    installedGlobals.push(firstName, secondName)

    first.init(createShareScope())
    assert.throws(() => second.init(createShareScope()))
  })

  it('rejects prototype objects as host and local share scopes', () => {
    const firstName = uniqueName('TurbopackContainer')
    const container = createContainer(firstName, uniqueName('scope'), {})
    installedGlobals.push(firstName)

    assert.throws(() => container.init(Object.prototype as ShareScope))
    assert.throws(() =>
      createContainer(
        uniqueName('TurbopackContainer'),
        uniqueName('scope'),
        {},
        { localShareScope: Object.prototype as ShareScope }
      )
    )
  })

  it('parses Webpack-compatible remote shorthand and arrays', () => {
    assert.deepEqual(
      parseRemoteSyntax('dashboard@https://example.test/remote.js'),
      { name: 'dashboard', url: 'https://example.test/remote.js' }
    )
    assert.deepEqual(
      parseRemoteConfig('dashboard', [
        'dashboard@https://one.test/remote.js',
        'https://two.test/remote.js',
      ]),
      [
        {
          name: 'dashboard',
          shareScope: 'default',
          url: 'https://one.test/remote.js',
        },
        {
          name: 'dashboard',
          shareScope: 'default',
          url: 'https://two.test/remote.js',
        },
      ]
    )
  })

  it('rejects every reserved container name', () => {
    for (const name of reservedContainerNames) {
      assert.throws(() =>
        parseRemoteSyntax(`${name}@https://example.test/remote.js`)
      )
    }
  })
})

function consumeFrom(
  scope: ShareScope,
  shareScope: string,
  options: Omit<Parameters<typeof consumeShared>[0], 'shareScope'>
): unknown {
  setShareScope(shareScope, scope)
  return consumeShared({ ...options, shareScope })
}

async function consumeFromAsync(
  scope: ShareScope,
  shareScope: string,
  options: Omit<Parameters<typeof consumeSharedAsync>[0], 'shareScope'>
): Promise<unknown> {
  setShareScope(shareScope, scope)
  return consumeSharedAsync({ ...options, shareScope })
}
