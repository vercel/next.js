import { type NextInstance, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

async function execute(
  next: NextInstance,
  envKey: string,
  id: string,
  includeRuntimeEntrypoints = false
) {
  await next.stop()
  if (envKey !== 'default') {
    next.env[envKey] = id
  }
  try {
    await next.start()
    // `next.start()` resets the CLI output, so at this point it holds this deployment's
    // `next build` output (plus the `next start` banner).
    const buildOutput = next.cliOutput

    let keyRoot: string,
      keyNested: string,
      keyArgumentUseCache: string,
      keyArgumentUseClient: string,
      keyArgumentUseServer: string,
      keyPrerender: string,
      keyImportUseClient: string,
      keyImportUseClientImage: string,
      keyImportUseClientNested: string,
      keyRoute: string,
      dataRoot: string,
      dataNested: string,
      dataArgumentUseCache: string,
      dataArgumentUseClient: string,
      dataArgumentUseServer: string,
      dataPrerender: string,
      dataImportUseClient: string,
      dataImportUseClientImage: string,
      dataImportUseClientNested: string,
      dataRoute: string,
      imageSrc: string
    {
      const match = next.cliOutput.match(
        /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/\(site\)\/layout","_N_T_\/\(site\)\/prerender\/layout","_N_T_\/\(site\)\/prerender\/page","_N_T_\/prerender"\]\]$/m
      )
      expect(match).toBeArray()
      keyPrerender = match[0]
      const browser = await next.browser(`/prerender`)
      dataPrerender = await browser.elementById('data').text()
    }

    {
      const logs = next.getCliOutputFromHere()
      const browser = await next.browser(`/import-use-client`)
      dataImportUseClient = await browser.elementById('data').text()
      // Client references are only known during serialization, so they aren't part of the coarse
      // cache key; instead the coarse key holds a redirect entry and the real entry lives at a
      // "specific" key = coarse key + a hash suffix derived from the accessed client references'
      // resolved manifest values.
      const matches = [
        ...logs().matchAll(
          /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/import-use-client\/layout","_N_T_\/import-use-client\/page","_N_T_\/import-use-client"\]\]$/gm
        ),
      ]
      expect(matches).not.toBeEmpty()
      keyImportUseClient = matches.map((m) => m[0]).join('\n')
    }

    {
      const logs = next.getCliOutputFromHere()
      const browser = await next.browser(`/import-use-client-image`)
      dataImportUseClientImage = await browser.elementById('data').text()
      imageSrc = await browser.elementById('cached-image').getAttribute('src')
      const matches = [
        ...logs().matchAll(
          /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/import-use-client-image\/layout","_N_T_\/import-use-client-image\/page","_N_T_\/import-use-client-image"\]\]$/gm
        ),
      ]
      expect(matches).not.toBeEmpty()
      keyImportUseClientImage = matches.map((m) => m[0]).join('\n')
    }

    {
      const logs = next.getCliOutputFromHere()
      const browser = await next.browser(`/import-use-client-nested`)
      dataImportUseClientNested = await browser.elementById('data').text()
      const matches = [
        ...logs().matchAll(
          /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/import-use-client-nested\/layout","_N_T_\/import-use-client-nested\/page","_N_T_\/import-use-client-nested"\]\]$/gm
        ),
      ]
      expect(matches).not.toBeEmpty()
      // The inner cache isn't read when the outer cache entry is reused.
      keyImportUseClientNested = matches[0][0]
    }

    {
      const logs = next.getCliOutputFromHere()
      const response = await next.fetch(`/route`)
      dataRoute = await response.text()
      const match = logs().match(
        /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/\(site\)\/layout","_N_T_\/\(site\)\/route","_N_T_\/\(site\)\/route\/route","_N_T_\/route"\]\]$/m
      )
      expect(match).toBeArray()
      keyRoute = match[0]
    }

    {
      const logs = next.getCliOutputFromHere()
      const browser = await next.browser(`/nested`)
      dataNested = await browser.elementById('data').text()
      expect(dataNested).not.toBeEmpty()
      const match = logs().match(
        /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/nested\/layout","_N_T_\/nested\/page","_N_T_\/nested"\]\]$/m
      )
      expect(match).toBeArray()
      keyNested = match[0]
    }

    {
      const logs = next.getCliOutputFromHere()
      const browser = await next.browser(`/argument-use-cache`)
      dataArgumentUseCache = await browser.elementById('data').text()
      expect(dataArgumentUseCache).not.toBeEmpty()
      const match = logs().match(
        /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/argument-use-cache\/layout","_N_T_\/argument-use-cache\/page","_N_T_\/argument-use-cache"\]\]$/m
      )
      expect(match).toBeArray()
      keyArgumentUseCache = match[0]
    }

    {
      const logs = next.getCliOutputFromHere()
      const browser = await next.browser(`/argument-use-client`)
      dataArgumentUseClient = await browser.elementById('data').text()
      expect(dataArgumentUseClient).not.toBeEmpty()
      const match = logs().match(
        /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/argument-use-client\/layout","_N_T_\/argument-use-client\/page","_N_T_\/argument-use-client"\]\]$/m
      )
      expect(match).toBeArray()
      keyArgumentUseClient = match[0]
    }

    {
      const logs = next.getCliOutputFromHere()
      const browser = await next.browser(`/argument-use-server`)
      dataArgumentUseServer = await browser.elementById('data').text()
      expect(dataArgumentUseServer).not.toBeEmpty()
      const match = logs().match(
        /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/argument-use-server\/layout","_N_T_\/argument-use-server\/page","_N_T_\/argument-use-server"\]\]$/m
      )
      expect(match).toBeArray()
      keyArgumentUseServer = match[0]
    }

    {
      const logs = next.getCliOutputFromHere()
      const browser = await next.browser(`/`)
      dataRoot = await browser.elementById('data').text()
      expect(dataRoot).not.toBeEmpty()
      const match = logs().match(
        /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/\(site\)\/layout","_N_T_\/\(site\)\/page","_N_T_\/","_N_T_\/index"\]\]$/m
      )
      expect(match).toBeArray()
      keyRoot = match[0]
    }
    const runtimeValues: Record<string, string> = {}
    if (includeRuntimeEntrypoints) {
      const metadata = await next.render$('/metadata')
      runtimeValues.metadata = metadata('title').text()
      runtimeValues.viewport =
        metadata('meta[name="theme-color"]').attr('content') ?? ''
      runtimeValues.route = dataRoute

      const parallel = await next.render$('/parallel')
      runtimeValues.parallel = parallel('#parallel-data').text()

      // Interception requires a client-side navigation, not a document fetch.
      const interceptBrowser = await next.browser('/intercept')
      try {
        await interceptBrowser.elementById('open-modal').click()
        runtimeValues.intercept = await interceptBrowser
          .elementById('intercept-data')
          .text()
      } finally {
        await interceptBrowser.close()
      }

      const actionBrowser = await next.browser('/cached-action')
      try {
        await actionBrowser.elementById('run-action').click()
        await retry(async () => {
          runtimeValues.action = await actionBrowser
            .elementById('action-data')
            .text()
          expect(runtimeValues.action).not.toBeEmpty()
        })
      } finally {
        await actionBrowser.close()
      }
    }

    return {
      buildOutput,
      runtimeValues,
      keyRoot,
      keyNested,
      keyArgumentUseCache,
      keyArgumentUseClient,
      keyArgumentUseServer,
      keyPrerender,
      keyImportUseClient,
      keyImportUseClientImage,
      keyImportUseClientNested,
      keyRoute,
      dataRoot,
      dataNested,
      dataArgumentUseCache,
      dataArgumentUseClient,
      dataArgumentUseServer,
      dataPrerender,
      dataImportUseClient,
      dataImportUseClientImage,
      dataImportUseClientNested,
      dataRoute,
      imageSrc,
    }
  } finally {
    if (envKey !== 'default') {
      delete next.env[envKey]
    }
  }
}

describe.each(['NEXT_DEPLOYMENT_ID', 'BUILD_ID', 'default'])(
  'use-cache-cross-deployment with %s',
  (envKey) => {
    const { next } = nextTestSetup({
      files: __dirname,
      disableAutoSkewProtection: true,
      skipStart: true,
    })

    // Each `next build` gets its own hook (and thus its own timeout budget), and the builds are
    // shared by all tests below instead of every test building again.
    let key1: Awaited<ReturnType<typeof execute>>
    let key2: Awaited<ReturnType<typeof execute>>
    beforeAll(async () => {
      key1 = await execute(next, envKey, 'dpl-id-1')
    })
    beforeAll(async () => {
      key2 = await execute(next, envKey, 'dpl-id-2')
    })

    afterAll(async () => {
      await next.stop()
    })

    // In the future, this assertion can be relaxed to only prevent sharing if the implementation
    // changed.
    it('should not have the same cache key across deployments', () => {
      // Second run should not use the same key
      expect(key1.keyRoot).not.toBe(key2.keyRoot)
      expect(key1.dataRoot).not.toBe(key2.dataRoot)

      expect(key1.keyPrerender).not.toBe(key2.keyPrerender)
      expect(key1.dataPrerender).not.toBe(key2.dataPrerender)

      expect(key1.keyImportUseClient).not.toBe(key2.keyImportUseClient)
      expect(key1.dataImportUseClient).not.toBe(key2.dataImportUseClient)

      expect(key1.keyImportUseClientImage).not.toBe(
        key2.keyImportUseClientImage
      )
      expect(key1.dataImportUseClientImage).not.toBe(
        key2.dataImportUseClientImage
      )

      expect(key1.keyImportUseClientNested).not.toBe(
        key2.keyImportUseClientNested
      )
      expect(key1.dataImportUseClientNested).not.toBe(
        key2.dataImportUseClientNested
      )

      expect(key1.keyRoute).not.toBe(key2.keyRoute)
      expect(key1.dataRoute).not.toBe(key2.dataRoute)
    })

    it('should share a durable cache entry between an App Page and an API route', async () => {
      // Restart the dpl-id-2 deployment from the build above, with a fresh server process.
      await next.stop()
      await next.start({
        skipBuild: true,
        env: envKey !== 'default' ? { [envKey]: 'dpl-id-2' } : {},
      })

      try {
        const page = await next.render$('/page-api')
        const pageValue = page('#page-api-data').text()
        expect(pageValue).not.toBeEmpty()

        const response = await next.fetch('/page-api/api')
        expect(response.status).toBe(200)
        expect(await response.text()).toBe(pageValue)

        const secondPage = await next.render$('/page-api')
        expect(secondPage('#page-api-data').text()).toBe(pageValue)
      } finally {
        await next.stop()
      }
    })
  }
)

// durableUseCacheEntries is only supported in Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'use-cache-cross-deployment with durableUseCacheEntries',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      disableAutoSkewProtection: true,
      skipStart: true,
      env: { DURABLE_USE_CACHE_ENTRIES: '1' },
    })

    // `next build` dominates the runtime of this suite, so most tests share the two baseline
    // deployments of the unmodified app built below. Each build runs in its own hook (or test) so
    // that it gets its own timeout budget.
    //
    // Tests that need a differently configured or modified app build it themselves with a
    // different deployment ID. These have to come after the tests that reuse the baseline build
    // via `startBaselineDeployment()`, which verifies that the build on disk is still the baseline.
    const BASELINE_DPL_1 = 'dpl-id-1'
    const BASELINE_DPL_2 = 'dpl-id-2'

    type GeneratorValues = Record<string, { pathname: string; value: string }>

    async function readGenerators(): Promise<GeneratorValues> {
      const values: GeneratorValues = {}
      // Use the manifest only to discover concrete prerendered URLs; check
      // cache reuse through their observable HTTP responses below.
      const manifest = await next.readJSON('.next/prerender-manifest.json')
      for (const route of [
        'generator-layout',
        'generator-route',
        'generator-sitemap',
        'generator-image',
        'static-params',
      ]) {
        const routes = Object.keys(manifest.routes).filter(
          (pathname) =>
            pathname.startsWith(`/${route}/`) && !pathname.includes('[')
        )
        expect(routes).toHaveLength(1)
        const pathname = routes[0]
        const response = await next.fetch(pathname)
        expect({ pathname, status: response.status }).toEqual({
          pathname,
          status: 200,
        })
        const value =
          pathname.includes('generator-layout') ||
          pathname.includes('static-params')
            ? (await next.render$(pathname))('p').text()
            : await response.text()
        values[route] = { pathname, value }
      }
      return values
    }

    let base1: Awaited<ReturnType<typeof execute>>
    let base2: Awaited<ReturnType<typeof execute>>
    let generators1: GeneratorValues
    let generators2: GeneratorValues
    let base1ClientTitle: string
    let base1ClientState: string
    // The remote cache right after the first baseline deployment.
    let base1RemoteData: string

    beforeAll(async () => {
      await next.stop()
      await next.deleteFile('handler-remote-data.json')
      base1 = await execute(next, 'NEXT_DEPLOYMENT_ID', BASELINE_DPL_1, true)
      generators1 = await readGenerators()

      const browser = await next.browser('/import-use-client')
      try {
        base1ClientTitle = await browser.elementById('title').text()
        await browser.elementByCss('button').click()
        base1ClientState = await browser.elementById('state').text()
      } finally {
        await browser.close()
      }

      await next.stop()
      base1RemoteData = await next.readFile('handler-remote-data.json')
    })

    beforeAll(async () => {
      base2 = await execute(next, 'NEXT_DEPLOYMENT_ID', BASELINE_DPL_2, true)
      generators2 = await readGenerators()
      await next.stop()
    })

    beforeEach(async () => {
      // Stop any running server first so that its in-memory remote cache can't write stale
      // entries back to the file-backed store.
      await next.stop()
      await next.deleteFile('handler-remote-data.json')
    })

    afterAll(async () => {
      await next.stop()
      await next.deleteFile('handler-remote-data.json')
    })

    /** Restarts the second baseline deployment without rebuilding it. */
    async function startBaselineDeployment() {
      await next.stop()
      const { config } = await next.readJSON('.next/required-server-files.json')
      // If this fails, a test that builds its own app was moved before this one.
      expect(config.deploymentId).toBe(BASELINE_DPL_2)
      await next.start({
        skipBuild: true,
        env: { NEXT_DEPLOYMENT_ID: BASELINE_DPL_2 },
      })
    }

    /**
     * Resets the remote cache to its state right after the first baseline deployment, to build a
     * modified second deployment on top of it.
     */
    async function restoreBase1RemoteData() {
      await next.stop()
      await next.patchFile('handler-remote-data.json', base1RemoteData)
    }

    it('client component should return baseline', () => {
      // Observed on the first baseline deployment, the starting point of the client reference
      // tests below.
      expect(base1ClientTitle).toBe('Client Component A')
      expect(base1ClientState).toBe('Button clicked')
    })

    describe('durable cache reuse across deployments', () => {
      it('should not recompute when nothing changes', () => {
        const key1 = base1
        const key2 = base2
        // The root page renders at request time and lives in a route group.
        expect(key1.keyRoot).toBe(key2.keyRoot)
        expect(key1.dataRoot).toBe(key2.dataRoot)

        // The prerender page also lives in a route group.
        expect(key1.keyPrerender).toBe(key2.keyPrerender)
        expect(key1.dataPrerender).toBe(key2.dataPrerender)

        expect(key1.keyRoute).toBe(key2.keyRoute)
        expect(key1.dataRoute).toBe(key2.dataRoute)

        expect(key1.keyImportUseClient).toBe(key2.keyImportUseClient)
        expect(key1.dataImportUseClient).toBe(key2.dataImportUseClient)

        expect(key1.keyImportUseClientImage).toBe(key2.keyImportUseClientImage)
        expect(key1.dataImportUseClientImage).toBe(
          key2.dataImportUseClientImage
        )
        expect(key1.imageSrc).toContain('dpl=dpl-id-1')
        expect(key2.imageSrc).toContain('dpl=dpl-id-2')

        expect(key1.keyImportUseClientNested).toBe(
          key2.keyImportUseClientNested
        )
        expect(key1.dataImportUseClientNested).toBe(
          key2.dataImportUseClientNested
        )
      })

      it.each([
        ['generateMetadata', 'metadata'],
        ['generateViewport', 'viewport'],
        ['a grouped route handler', 'route'],
        ['a parallel route', 'parallel'],
        ['an intercepted route', 'intercept'],
      ])('should reuse durable entries in %s', (_name, kind) => {
        expect(base1.runtimeValues[kind]).not.toBeEmpty()
        expect(base2.runtimeValues[kind]).toBe(base1.runtimeValues[kind])
      })

      // TODO This is the usual case of RSC -> client component -> server action
      // @force-gate TODO
      it('should reuse durable entries in a Server Action', () => {
        expect(base1.runtimeValues.action).not.toBeEmpty()
        expect(base2.runtimeValues.action).toBe(base1.runtimeValues.action)
      })
    })

    it('should share a durable cache entry between an App Page and an API route', async () => {
      await startBaselineDeployment()

      try {
        const page = await next.render$('/page-api')
        const pageValue = page('#page-api-data').text()
        expect(pageValue).not.toBeEmpty()

        const response = await next.fetch('/page-api/api')
        expect(response.status).toBe(200)
        expect(await response.text()).toBe(pageValue)

        const secondPage = await next.render$('/page-api')
        expect(secondPage('#page-api-data').text()).toBe(pageValue)
      } finally {
        await next.stop()
      }
    })

    it('should not share a durable cache entry returning an asset URL between an App Page and an API route', async () => {
      await startBaselineDeployment()

      try {
        const page = await next.render$('/page-api-url')
        const pageValue = page('#page-api-url').text()
        expect(pageValue).toMatch(/^\/_next\/static\/media\//)

        const response = await next.fetch('/page-api-url/api')
        expect(response.status).toBe(200)
        const apiValue = await response.text()
        expect(apiValue).toMatch(/^file:\/\//)
        // Even with identical source code and arguments, the asset URL is
        // resolved in a different chunking context and must not reuse the entry.
        expect(apiValue).not.toBe(pageValue)

        const secondPage = await next.render$('/page-api-url')
        expect(secondPage('#page-api-url').text()).toBe(pageValue)
        const secondResponse = await next.fetch('/page-api-url/api')
        expect(secondResponse.status).toBe(200)
        expect(await secondResponse.text()).toBe(apiValue)
      } finally {
        await next.stop()
      }
    })

    describe('durable build-time generators', () => {
      it.each([
        ['layout generateStaticParams', 'generator-layout'],
        ['child generateStaticParams', 'generator-layout'],
        ['route-handler generateStaticParams', 'generator-route'],
        ['generateSitemaps', 'generator-sitemap'],
        ['generateImageMetadata', 'generator-image'],
        ['page generateStaticParams', 'static-params'],
      ])('should reuse durable entries in %s', (_name, route) => {
        expect(generators1[route].value).not.toBeEmpty()
        expect(generators2[route]).toEqual(generators1[route])
      })
    })

    it('should not miss when an env var changes during cache generation', async () => {
      // Regression test for mutating env vars which changes the cache key mid-rendering and breaks
      // the multi-phase rendering process (be it within the next build prerendering, or in the
      // resume case at runtime).
      // RDC stores cache entries, and we should use those entries regardless of whether env vars
      // changed in the meantime (among other things, to prevent tearing).
      //
      // Error: Route "foo": Unexpected cache miss after cache warming phase during prerendering.
      // This is likely caused by non-deterministic arguments that differ between the cache warming
      // phase and the final prerender phase (e.g. unstable array order). Ensure that arguments
      // passed to cached functions are deterministic.
      //
      // Error: Route "foo": Next.js encountered uncached or runtime data during prerendering.

      // The baseline builds prerendered /env-mutation/known.
      for (const { buildOutput } of [base1, base2]) {
        expect(buildOutput).not.toContain('Error')
        expect(buildOutput).not.toContain(
          'Unexpected cache miss after cache warming phase during prerendering'
        )
      }

      delete next.env.MUTATED_DURING_CACHE_GENERATION
      try {
        await startBaselineDeployment()
        const output = next.getCliOutputFromHere()
        const browser = await next.browser('/env-mutation/test')

        expect(output()).not.toContain('Error')
        expect(output()).not.toContain(
          'Unexpected cache miss after cache warming phase during prerendering'
        )
        expect(await browser.elementById('data').text()).toBe('test:unset')
      } finally {
        await next.stop()
        delete next.env.MUTATED_DURING_CACHE_GENERATION
      }
    })

    it('should recompute when transitive implementation changes', async () => {
      const key1 = base1
      await restoreBase1RemoteData()

      let value = String(Math.random())
      await next.patchFile(
        'app/logic.ts',
        `export function getDate() {
  return ${JSON.stringify(value)}
}`,
        async () => {
          const key2 = await execute(
            next,
            'NEXT_DEPLOYMENT_ID',
            'dpl-id-transitive'
          )
          // Should not be the same key (because the implementation did change)
          expect(key1.keyRoot).not.toBe(key2.keyRoot)
          expect(key1.dataRoot).not.toBe(key2.dataRoot)
          expect(key2.dataRoot).toBe(value)

          expect(key1.keyPrerender).not.toBe(key2.keyPrerender)
          expect(key1.dataPrerender).not.toBe(key2.dataPrerender)
          expect(key2.dataPrerender).toBe(value)

          expect(key1.keyImportUseClient).not.toBe(key2.keyImportUseClient)
          expect(key1.dataImportUseClient).not.toBe(key2.dataImportUseClient)
          expect(key2.dataImportUseClient).toBe(value)

          expect(key1.keyImportUseClientImage).not.toBe(
            key2.keyImportUseClientImage
          )
          expect(key1.dataImportUseClientImage).not.toBe(
            key2.dataImportUseClientImage
          )
          expect(key2.dataImportUseClientImage).toBe(value)

          expect(key1.keyImportUseClientNested).not.toBe(
            key2.keyImportUseClientNested
          )
          expect(key1.dataImportUseClientNested).not.toBe(
            key2.dataImportUseClientNested
          )
          expect(key2.dataImportUseClientNested).toBe(value)

          expect(key1.keyRoute).not.toBe(key2.keyRoute)
          expect(key1.dataRoute).not.toBe(key2.dataRoute)
          expect(key2.dataRoute).toBe(value)
        }
      )
    })

    // TODO when serializing server reference arguments, we need to include the server reference's
    // entropy in the argument-part of the cache key.
    // But currently, you cannot do anything with the passed server reference anyway.
    it.skip('should recompute when a use cache reference argument changes', async () => {
      const key1 = base1
      await restoreBase1RemoteData()

      await next.patchFile(
        'app/argument-use-cache/action.ts',
        (content) => content.replace("return 'first'", "return 'second'"),
        async () => {
          const key2 = await execute(
            next,
            'NEXT_DEPLOYMENT_ID',
            'dpl-id-argument-use-cache'
          )

          expect(key1.keyArgumentUseCache).not.toBe(key2.keyArgumentUseCache)
          expect(key1.dataArgumentUseCache).not.toBe(key2.dataArgumentUseCache)
        }
      )
    })

    // TODO when serializing server reference arguments, we need to include the server reference's
    // entropy in the argument-part of the cache key.
    // But currently, you cannot do anything with the passed server reference anyway.
    // Furthermore, we need to compute the metadata information for `use cache` functions as well.
    it.skip('should recompute when a use server reference argument changes', async () => {
      const key1 = base1
      await restoreBase1RemoteData()

      await next.patchFile(
        'app/argument-use-server/action.ts',
        (content) => content.replace("return 'first'", "return 'second'"),
        async () => {
          const key2 = await execute(
            next,
            'NEXT_DEPLOYMENT_ID',
            'dpl-id-argument-use-server'
          )

          expect(key1.keyArgumentUseServer).not.toBe(key2.keyArgumentUseServer)
          expect(key1.dataArgumentUseServer).not.toBe(
            key2.dataArgumentUseServer
          )
        }
      )
    })

    describe('with a runtime env var', () => {
      const foobar1 = String(Math.random())
      const foobar2 = String(Math.random())
      let key1: Awaited<ReturnType<typeof execute>>
      let key2: Awaited<ReturnType<typeof execute>>

      beforeAll(async () => {
        await next.stop()
        await next.deleteFile('handler-remote-data.json')
        next.env['FOOBAR'] = foobar1
        key1 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-foobar-1')
      })

      beforeAll(async () => {
        next.env['FOOBAR'] = foobar2
        key2 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-foobar-2')
      })

      afterAll(() => {
        delete next.env['FOOBAR']
      })

      it('should recompute when runtime env var changes', () => {
        // Should not be the same key (because process.env.FOOBAR is read at runtime and changed)
        expect(key1.keyRoot).not.toBe(key2.keyRoot)
        expect(key1.dataRoot).toEndWith(`:${foobar1}`)
        expect(key2.dataRoot).toEndWith(`:${foobar2}`)
        // The env var value should not be leaked into the cache key, only hashes of it.
        expect(key1.keyRoot).not.toContain(foobar1)
        expect(key2.keyRoot).not.toContain(foobar2)

        expect(key1.keyNested).not.toBe(key2.keyNested)
        expect(key1.dataNested).toEndWith(`:${foobar1}`)
        expect(key2.dataNested).toEndWith(`:${foobar2}`)
        expect(key1.keyNested).not.toContain(foobar1)
        expect(key2.keyNested).not.toContain(foobar2)

        expect(key1.keyPrerender).not.toBe(key2.keyPrerender)
        expect(key1.dataPrerender).toEndWith(`:${foobar1}`)
        expect(key2.dataPrerender).toEndWith(`:${foobar2}`)
        expect(key1.keyPrerender).not.toContain(foobar1)
        expect(key2.keyPrerender).not.toContain(foobar2)

        expect(key1.keyImportUseClient).not.toBe(key2.keyImportUseClient)
        expect(key1.dataImportUseClient).toEndWith(`:${foobar1}`)
        expect(key2.dataImportUseClient).toEndWith(`:${foobar2}`)
        expect(key1.keyImportUseClient).not.toContain(foobar1)
        expect(key2.keyImportUseClient).not.toContain(foobar2)

        expect(key1.keyImportUseClientNested).not.toBe(
          key2.keyImportUseClientNested
        )
        expect(key1.dataImportUseClientNested).toEndWith(`:${foobar1}`)
        expect(key2.dataImportUseClientNested).toEndWith(`:${foobar2}`)
        expect(key1.keyImportUseClientNested).not.toContain(foobar1)
        expect(key2.keyImportUseClientNested).not.toContain(foobar2)

        expect(key1.keyRoute).not.toBe(key2.keyRoute)
        expect(key1.dataRoute).toEndWith(`:${foobar1}`)
        expect(key2.dataRoute).toEndWith(`:${foobar2}`)
        expect(key1.keyRoute).not.toContain(foobar1)
        expect(key2.keyRoute).not.toContain(foobar2)
      })
    })

    describe('with a runtime env var truthiness check', () => {
      let originalLogic: string | undefined
      let unset: Awaited<ReturnType<typeof execute>>
      let falsy: Awaited<ReturnType<typeof execute>>
      let truthy1: Awaited<ReturnType<typeof execute>>
      let truthy2: Awaited<ReturnType<typeof execute>>

      beforeAll(async () => {
        await next.stop()
        await next.deleteFile('handler-remote-data.json')
        originalLogic = await next.readFile('app/logic.ts')
        await next.patchFile(
          'app/logic.ts',
          `export function getDate() {
  return new Date().toISOString() + ':' + Boolean(process.env.FOOBAR)
}`
        )
        delete next.env['FOOBAR']
        unset = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-unset')
      })

      beforeAll(async () => {
        next.env['FOOBAR'] = ''
        falsy = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-falsy')
      })

      beforeAll(async () => {
        next.env['FOOBAR'] = 'truthy-1'
        truthy1 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-truthy-1')
      })

      beforeAll(async () => {
        next.env['FOOBAR'] = 'truthy-2'
        truthy2 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-truthy-2')
      })

      afterAll(async () => {
        delete next.env['FOOBAR']
        if (originalLogic !== undefined) {
          await next.patchFile('app/logic.ts', originalLogic)
        }
      })

      it('should recompute when runtime env var truthiness changes', () => {
        // unset -> falsy revalidates
        expect(unset.keyRoot).not.toBe(falsy.keyRoot)
        expect(unset.dataRoot).not.toBe(falsy.dataRoot)
        expect(unset.dataRoot).toEndWith(':false')

        // falsy -> truthy revalidates
        expect(falsy.keyRoot).not.toBe(truthy1.keyRoot)
        expect(falsy.dataRoot).not.toBe(truthy1.dataRoot)
        expect(falsy.dataRoot).toEndWith(':false')
        expect(truthy1.dataRoot).toEndWith(':true')

        // truthy -> different truthy DOESN'T revalidate
        expect(truthy1.keyRoot).toBe(truthy2.keyRoot)
        expect(truthy1.dataRoot).toBe(truthy2.dataRoot)
      })
    })

    it('should still work when imported client reference changes', async () => {
      const key1 = base1
      expect(base1ClientTitle).toBe('Client Component A')
      expect(base1ClientState).toBe('Button clicked')
      await restoreBase1RemoteData()

      await next.patchFile(
        'app/import-use-client/client.tsx',
        (oldContent) =>
          oldContent
            .replace('Client Component A', 'Client Component B')
            .replace('Button clicked', 'Handle clicked'),
        async () => {
          const key2 = await execute(
            next,
            'NEXT_DEPLOYMENT_ID',
            'dpl-id-imported-client'
          )

          expect(key1.keyRoot).toBe(key2.keyRoot)
          expect(key1.dataRoot).toBe(key2.dataRoot)

          expect(key1.keyPrerender).toBe(key2.keyPrerender)
          expect(key1.dataPrerender).toBe(key2.dataPrerender)

          expect(key1.keyRoute).toBe(key2.keyRoute)
          expect(key1.dataRoute).toBe(key2.dataRoute)

          expect(key1.keyImportUseClient).toBe(key2.keyImportUseClient)
          expect(key1.dataImportUseClient).toBe(key2.dataImportUseClient)

          expect(key1.keyImportUseClientNested).toBe(
            key2.keyImportUseClientNested
          )
          expect(key1.dataImportUseClientNested).toBe(
            key2.dataImportUseClientNested
          )

          const browser = await next.browser('/import-use-client')
          expect(await browser.elementById('title').text()).toBe(
            'Client Component B'
          )
          await browser.elementByCss('button').click()
          expect(await browser.elementById('state').text()).toBe(
            'Handle clicked'
          )
        }
      )
    })

    it('should still work when a client reference argument changes', async () => {
      // The client reference is passed as an opaque argument. Instead, we need to make sure that
      // the client reference still uses the up-to-date chunks.
      const key1 = base1
      expect(base1ClientTitle).toBe('Client Component A')
      expect(base1ClientState).toBe('Button clicked')
      await restoreBase1RemoteData()

      await next.patchFile(
        'app/argument-use-client/client.tsx',
        (oldContent) =>
          oldContent
            .replace('Client Component A', 'Client Component B')
            .replace('Button clicked', 'Handle clicked'),
        async () => {
          const key2 = await execute(
            next,
            'NEXT_DEPLOYMENT_ID',
            'dpl-id-client-argument'
          )

          expect(key1.keyArgumentUseClient).toBe(key2.keyArgumentUseClient)
          expect(key1.dataArgumentUseClient).toBe(key2.dataArgumentUseClient)

          const browser = await next.browser('/argument-use-client')
          expect(await browser.elementById('title').text()).toBe(
            'Client Component B'
          )
          await browser.elementByCss('button').click()
          expect(await browser.elementById('state').text()).toBe(
            'Handle clicked'
          )
        }
      )
    })
  }
)
