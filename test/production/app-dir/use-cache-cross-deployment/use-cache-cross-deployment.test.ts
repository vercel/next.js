import { type NextInstance, nextTestSetup } from 'e2e-utils'

async function execute(next: NextInstance, envKey: string, id: string) {
  await next.stop()
  if (envKey !== 'default') {
    next.env[envKey] = id
  }
  try {
    await next.start()

    let keyRoot: string,
      keyNested: string,
      keyArgumentUseCache: string,
      keyArgumentUseClient: string,
      keyArgumentUseServer: string,
      keyPrerender: string,
      keyImportUseClient: string,
      keyRoute: string,
      dataRoot: string,
      dataNested: string,
      dataArgumentUseCache: string,
      dataArgumentUseClient: string,
      dataArgumentUseServer: string,
      dataPrerender: string,
      dataImportUseClient: string,
      dataRoute: string
    {
      const match = next.cliOutput.match(
        /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/prerender\/layout","_N_T_\/prerender\/page","_N_T_\/prerender"\]\]$/m
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
      const response = await next.fetch(`/route`)
      dataRoute = await response.text()
      const match = logs().match(
        /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/route","_N_T_\/route\/route"\]\]$/m
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
        /^CustomCacheHandler::get .* \[\["_N_T_\/layout","_N_T_\/page","_N_T_\/","_N_T_\/index"\]\]$/m
      )
      expect(match).toBeArray()
      keyRoot = match[0]
    }
    return {
      keyRoot,
      keyNested,
      keyArgumentUseCache,
      keyArgumentUseClient,
      keyArgumentUseServer,
      keyPrerender,
      keyImportUseClient,
      keyRoute,
      dataRoot,
      dataNested,
      dataArgumentUseCache,
      dataArgumentUseClient,
      dataArgumentUseServer,
      dataPrerender,
      dataImportUseClient,
      dataRoute,
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
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      disableAutoSkewProtection: true,
      skipStart: true,
    })

    if (skipped) return

    // In the future, this assertion can be relaxed to only prevent sharing if the implementation
    // changed.
    it('should not have the same cache key across deployments', async () => {
      const key1 = await execute(next, envKey, 'dpl-id-1')
      const key2 = await execute(next, envKey, 'dpl-id-2')
      // Second run should not use the same key
      expect(key1.keyRoot).not.toBe(key2.keyRoot)
      expect(key1.dataRoot).not.toBe(key2.dataRoot)

      expect(key1.keyPrerender).not.toBe(key2.keyPrerender)
      expect(key1.dataPrerender).not.toBe(key2.dataPrerender)

      expect(key1.keyImportUseClient).not.toBe(key2.keyImportUseClient)
      expect(key1.dataImportUseClient).not.toBe(key2.dataImportUseClient)

      expect(key1.keyRoute).not.toBe(key2.keyRoute)
      expect(key1.dataRoute).not.toBe(key2.dataRoute)
    })
  }
)

// durableUseCacheEntries is only supported in Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'use-cache-cross-deployment with durableUseCacheEntries',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      disableAutoSkewProtection: true,
      skipStart: true,
      env: { DURABLE_USE_CACHE_ENTRIES: '1' },
    })

    if (skipped) return

    beforeEach(async () => {
      await next.deleteFile('handler-remote-data.json')
    })

    it('should not recompute when nothing changes', async () => {
      const key1 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-1')
      const key2 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-2')
      // Should be the same key (because the implementation didn't change)
      expect(key1.keyRoot).toBe(key2.keyRoot)
      expect(key1.dataRoot).toBe(key2.dataRoot)

      expect(key1.keyPrerender).toBe(key2.keyPrerender)
      expect(key1.dataPrerender).toBe(key2.dataPrerender)

      expect(key1.keyRoute).toBe(key2.keyRoute)
      expect(key1.dataRoute).toBe(key2.dataRoute)

      expect(key1.keyImportUseClient).toBe(key2.keyImportUseClient)
      expect(key1.dataImportUseClient).toBe(key2.dataImportUseClient)
    })

    it('should recompute when transitive implementation changes', async () => {
      const key1 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-1')

      let value = String(Math.random())
      await next.patchFile(
        'app/logic.ts',
        `export function getDate() {
  return ${JSON.stringify(value)}
}`,
        async () => {
          const key2 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-2')
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
      const key1 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-1')

      await next.patchFile(
        'app/argument-use-cache/action.ts',
        (content) => content.replace("return 'first'", "return 'second'"),
        async () => {
          const key2 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-2')

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
      const key1 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-1')

      await next.patchFile(
        'app/argument-use-server/action.ts',
        (content) => content.replace("return 'first'", "return 'second'"),
        async () => {
          const key2 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-2')

          expect(key1.keyArgumentUseServer).not.toBe(key2.keyArgumentUseServer)
          expect(key1.dataArgumentUseServer).not.toBe(
            key2.dataArgumentUseServer
          )
        }
      )
    })

    it('should recompute when runtime env var changes', async () => {
      let foobar1 = String(Math.random())
      let foobar2 = String(Math.random())
      try {
        next.env['FOOBAR'] = foobar1
        const key1 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-1')

        next.env['FOOBAR'] = foobar2
        const key2 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-2')
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

        expect(key1.keyRoute).not.toBe(key2.keyRoute)
        expect(key1.dataRoute).toEndWith(`:${foobar1}`)
        expect(key2.dataRoute).toEndWith(`:${foobar2}`)
        expect(key1.keyRoute).not.toContain(foobar1)
        expect(key2.keyRoute).not.toContain(foobar2)
      } finally {
        delete next.env['FOOBAR']
      }
    })

    it('should work still when imported client reference changes', async () => {
      const key1 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-1')
      const browser = await next.browser('/import-use-client')
      expect(await browser.elementById('title').text()).toBe(
        'Client Component A'
      )
      await browser.elementByCss('button').click()
      expect(await browser.elementById('state').text()).toBe('Button clicked')
      await browser.close()

      await next.patchFile(
        'app/import-use-client/client.tsx',
        (oldContent) =>
          oldContent
            .replace('Client Component A', 'Client Component B')
            .replace('Button clicked', 'Handle clicked'),
        async () => {
          const key2 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-2')

          expect(key1.keyRoot).toBe(key2.keyRoot)
          expect(key1.dataRoot).toBe(key2.dataRoot)

          expect(key1.keyPrerender).toBe(key2.keyPrerender)
          expect(key1.dataPrerender).toBe(key2.dataPrerender)

          expect(key1.keyRoute).toBe(key2.keyRoute)
          expect(key1.dataRoute).toBe(key2.dataRoute)

          expect(key1.keyImportUseClient).toBe(key2.keyImportUseClient)
          expect(key1.dataImportUseClient).toBe(key2.dataImportUseClient)

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

    it('should work still when a client reference argument changes', async () => {
      // The client reference is passed as an opaque argument. Instead, we need to make sure that
      // the client reference still uses the up-to-date chunks.
      const key1 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-1')
      const browser = await next.browser('/import-use-client')
      expect(await browser.elementById('title').text()).toBe(
        'Client Component A'
      )
      await browser.elementByCss('button').click()
      expect(await browser.elementById('state').text()).toBe('Button clicked')
      await browser.close()

      await next.patchFile(
        'app/argument-use-client/client.tsx',
        (oldContent) =>
          oldContent
            .replace('Client Component A', 'Client Component B')
            .replace('Button clicked', 'Handle clicked'),
        async () => {
          const key2 = await execute(next, 'NEXT_DEPLOYMENT_ID', 'dpl-id-2')

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
