import { symlink } from 'fs/promises'
import { join } from 'path'
import execa from 'execa'
import type { ChildProcess } from 'child_process'
import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextStart,
  retry,
} from 'next-test-utils'

const isTurbopack = Boolean(process.env.IS_TURBOPACK_TEST)
// This test launches a second local Next.js server, which deployed fixtures cannot reach.
// Cache Components runs in an additional experimental mode that does not yet expose
// Turbopack's project-global federation endpoint.
const describeTurbopack =
  isTurbopack && !process.env.__NEXT_CACHE_COMPONENTS && !isNextDeploy
    ? describe
    : describe.skip

describeTurbopack.each([
  ['native', ''],
  ['runtime-tools package', '@module-federation/runtime-tools'],
  ['runtime-tools resolved entry', 'resolved'],
])('turbopack module federation with a %s producer', (_, implementation) => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // A second local Next.js server is not reachable from a deployed fixture.
    skipDeployment: true,
    dependencies: implementation
      ? { '@module-federation/runtime-tools': '2.9.0' }
      : {},
  })
  let remoteServer: ChildProcess
  let remotePort: number

  beforeAll(async () => {
    process.env.MF_IMPLEMENTATION = implementation
    if (implementation) {
      await next.patchFile(
        'app/enhanced/page.js',
        await next.readFile('enhanced-host/page.js')
      )
    }
    remotePort = await findPort()
    const remoteDir = join(next.testDir, 'remote')
    await symlink(
      join(next.testDir, 'node_modules'),
      join(remoteDir, 'node_modules')
    )
    if (isNextDev) {
      remoteServer = await launchApp(remoteDir, remotePort)
    } else {
      await execa(
        'node',
        [join(next.testDir, 'node_modules/next/dist/bin/next'), 'build'],
        {
          cwd: remoteDir,
          env: {
            ...process.env,
            NEXT_TEST_MODE: undefined,
            // packages/next/types/global.d.ts narrows NODE_ENV, but the child must inherit none.
            NODE_ENV: undefined as NodeJS.ProcessEnv['NODE_ENV'],
            __NEXT_SHOW_IGNORE_LISTED: 'true',
          },
        }
      )
      remoteServer = await nextStart(remoteDir, remotePort, {
        disableAutoSkewProtection: true,
      })
    }
    const response = await fetchViaHTTP(remotePort, '/')
    if (response.status !== 200) {
      throw new Error(`Remote server returned status ${response.status}`)
    }
    const federationResponse = await fetchViaHTTP(
      remotePort,
      '/_next/static/nextRemote.js'
    )
    if (federationResponse.status !== 200) {
      throw new Error(
        `Federation endpoint returned status ${federationResponse.status}`
      )
    }

    process.env.MF_REMOTE_URL = `http://localhost:${remotePort}/_next/static/nextRemote.js`
    await next.start()
  })

  afterAll(async () => {
    await killApp(remoteServer)
    delete process.env.MF_REMOTE_URL
    delete process.env.MF_IMPLEMENTATION
  })

  it('loads a tree-shaken module exposed by another Next.js app', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'hello from Next.js'
      )
    }, 15_000)

    const entry = await fetchViaHTTP(
      remotePort,
      '/_next/static/nextRemote.js'
    ).then((response) => response.text())
    if (!isNextDev) {
      expect(entry).not.toContain(
        'MODULE_FEDERATION_UNUSED_EXPORT_SHOULD_BE_REMOVED'
      )
      expect(entry).not.toContain('remote/lib/message.js')
    }
  })

  it('keeps exposes lazy and rejects unknown modules', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'hello from Next.js'
      )
    })
    expect(
      await browser.eval(async () => {
        const global = window as any
        const before = global.federationLazyEvaluations || 0
        const factory = await global.nextRemote.get('./lazy')
        const first = factory().value
        const second = (await global.nextRemote.get('./lazy'))().value
        let missing
        try {
          await global.nextRemote.get('./missing')
        } catch (error) {
          missing = error.message
        }
        return {
          before,
          after: global.federationLazyEvaluations,
          first,
          second,
          missing,
        }
      })
    ).toEqual({
      before: 0,
      after: 1,
      first: 'lazy expose from Next.js',
      second: 'lazy expose from Next.js',
      missing: 'Module ./missing does not exist in container nextRemote',
    })
  })

  if (implementation) {
    it.each(['', '?array'])(
      'shares producer providers with the public runtime consumer %s',
      async (query) => {
        const browser = await next.browser(`/enhanced${query}`)
        await retry(async () => {
          expect(await browser.elementByCss('#enhanced-message').text()).toBe(
            'hello from Next.js'
          )
        })
        expect(
          await browser.eval(async () => {
            const global = window as any
            const host = global.enhancedHost
            const producer = global.__FEDERATION__.__INSTANCES__.find(
              (instance) => instance.name === 'nextRemote'
            )
            const scope = host.shareScopeMap.catalog
            const providers = scope['producer-value']
            const options = global.federationInitOptions
            const hasArrayScope = Array.isArray(options.shareScopeKeys)
            if (hasArrayScope) {
              await Promise.all(producer.initializeSharing('other'))
            }
            return {
              providers: await Promise.all(
                Object.keys(providers)
                  .sort()
                  .map(async (version) => ({
                    version,
                    from: providers[version].from,
                    value: (await providers[version].get())().value,
                    eager: providers[version].shareConfig.eager,
                  }))
              ),
              sameScope: producer.shareScopeMap.catalog === scope,
              sameHostMap: options.shareScopeMap === host.shareScopeMap,
              enumerableMap: Object.getOwnPropertyDescriptor(
                options,
                'shareScopeMap'
              ).enumerable,
              defaultProvider:
                producer.shareScopeMap.default?.['producer-value'] || null,
              omittedProvider: scope['host-only'] || null,
              otherProviderInCatalog: scope['other-value'] || null,
              other: hasArrayScope
                ? {
                    sameScope:
                      producer.shareScopeMap.other === host.shareScopeMap.other,
                    value: (
                      await host.shareScopeMap.other['other-value'][
                        '2.0.0'
                      ].get()
                    )().value,
                  }
                : null,
            }
          })
        ).toEqual({
          providers: [
            {
              version: '1.0.0',
              from: 'nextRemote',
              value: 'shared value from Next.js',
              eager: false,
            },
            {
              version: '1.2.0',
              from: 'nextRemote',
              value: 'new shared value from Next.js',
              eager: true,
            },
          ],
          sameScope: true,
          sameHostMap: true,
          enumerableMap: false,
          defaultProvider: null,
          omittedProvider: null,
          otherProviderInCatalog: null,
          other: query
            ? { sameScope: true, value: 'shared value from Next.js' }
            : null,
        })
      }
    )

    it('waits for concurrent initialization and retries a share-scope cycle', async () => {
      const browser = await next.browser('/protocol')
      await browser.eval(async (remoteUrl) => {
        const global = window as any
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = remoteUrl
          script.onload = () => resolve()
          script.onerror = reject
          document.head.appendChild(script)
        })
        const producer = global.__FEDERATION__.__INSTANCES__.find(
          (instance) => instance.name === 'nextRemote'
        )
        const container = global.nextRemote
        const scope = {}
        let attempts = 0
        let cycleTokens
        let release!: () => void
        let entered!: () => void
        const gate = new Promise<void>((resolve) => {
          release = resolve
        })
        const entry = new Promise<void>((resolve) => {
          entered = resolve
        })
        global.cycleRemote = {
          async init(shareScope, initScope, options) {
            attempts++
            if (attempts === 1) throw new Error('retry initialization')
            cycleTokens = initScope.length
            await container.init(shareScope, initScope, options)
            entered()
            await gate
          },
          get() {
            return Promise.resolve(() => ({ value: 'cycle remote' }))
          },
        }
        producer.initOptions({
          name: 'nextRemote',
          shareStrategy: 'version-first',
          remotes: [
            {
              name: 'cycleRemote',
              entry: remoteUrl,
              entryGlobalName: 'cycleRemote',
              type: 'global',
              shareScope: 'catalog',
            },
          ],
        })
        let firstError
        try {
          await container.init(scope, [])
        } catch (error) {
          firstError = error.message.includes('retry initialization')
        }
        let firstReady = false
        let secondReady = false
        const first = container.init(scope, []).then(() => {
          firstReady = true
        })
        await entry
        const map = { catalog: scope }
        const options = { shareScopeKeys: ['catalog', 'other'] }
        Object.defineProperty(options, 'shareScopeMap', { value: map })
        const second = container.init(scope, [], options).then(() => {
          secondReady = true
        })
        global.finishFederationInitialization = async () => {
          const beforeRelease = {
            firstReady,
            secondReady,
            mapAttached: producer.shareScopeMap.other === (map as any).other,
          }
          release()
          await Promise.all([first, second])
          await container.init(scope, [])
          let differentScope
          try {
            await container.init({}, [])
          } catch (error) {
            differentScope = error.message
          }
          let missingMap
          try {
            await container.init(scope, [], { shareScopeKeys: ['catalog'] })
          } catch (error) {
            missingMap = error.message
          }
          await container.init(scope, [], options)
          await Promise.all(producer.initializeSharing('other'))
          return {
            firstError,
            beforeRelease,
            afterRelease: { firstReady, secondReady },
            attempts,
            cycleTokens,
            differentScope,
            missingMap,
            sameScope: producer.shareScopeMap.catalog === scope,
            createdScope: producer.shareScopeMap.other === (map as any).other,
            value: (
              await producer.shareScopeMap.catalog['producer-value'][
                '1.0.0'
              ].get()
            )().value,
            otherValue: (
              await producer.shareScopeMap.other['other-value']['2.0.0'].get()
            )().value,
          }
        }
      }, `http://localhost:${remotePort}/_next/static/nextRemote.js`)
      expect(
        await browser.eval(() =>
          (window as any).finishFederationInitialization()
        )
      ).toEqual({
        firstError: true,
        beforeRelease: {
          firstReady: false,
          secondReady: false,
          mapAttached: true,
        },
        afterRelease: { firstReady: true, secondReady: true },
        attempts: 2,
        cycleTokens: 1,
        differentScope:
          'Container initialization failed because it has already been initialized with a different share scope',
        missingMap:
          'Container initialization with shareScopeKeys requires a shareScopeMap',
        sameScope: true,
        createdScope: true,
        value: 'shared value from Next.js',
        otherValue: 'shared value from Next.js',
      })
    })
  }
})
