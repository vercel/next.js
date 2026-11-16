import { FileRef, nextTestSetup } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import { load } from 'cheerio'
import path from 'path'
import { createDataService } from './test-data'

function setupFixture(appDirectory: string) {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', appDirectory),
    overrideFiles: {
      'cache.ts': new FileRef(path.join(__dirname, 'shared/cache.ts')),
      'data.ts': new FileRef(path.join(__dirname, 'shared/data.ts')),
      'notify.js': new FileRef(path.join(__dirname, 'shared/notify.js')),
      'handler.js': new FileRef(path.join(__dirname, 'shared/handler.js')),
    },
    skipStart: true,
  })
  let dataService: ReturnType<typeof createDataService>

  beforeAll(async () => {
    dataService = createDataService()
    const port = await findPort()
    dataService.server.listen(port)
    next.env.TEST_DATA_SERVICE_URL = `http://localhost:${port}`
  })

  afterAll(() => {
    dataService?.close()
  })

  return {
    next,
    get dataService() {
      return dataService
    },
  }
}

describe('use-cache-dedupe-prerender', () => {
  describe('asynchronous handler expiration checks', () => {
    const fixture = setupFixture('context')

    it('keeps cache warming active while implicit-tag expiration is pending', async () => {
      const { next, dataService } = fixture
      next.env.TEST_HOLD_EXPIRATION = '1'
      dataService.hold('expiration:root')
      const building = next.build()
      try {
        await dataService.waitForRequest('expiration:root')
        dataService.release('expiration:root')
        expect((await building).exitCode).toBe(0)
        expect(next.cliOutput).not.toContain(
          'Unexpected cache miss after cache warming phase during prerendering'
        )
        await next.start({ skipBuild: true })
        const [shell] = (await next.render('/')).split(
          '<!-- PPR_BOUNDARY_SENTINEL -->'
        )
        expect(load(shell)('#outer').text()).toBe('short-lived shared')
      } finally {
        dataService.releaseAll()
        await building
      }
    })
  })

  describe('direct and nested calls during static prerendering', () => {
    const fixture = setupFixture('context')

    it('currently times out a nested cache when a direct short-lived warm-cache call starts the lookup first', async () => {
      const { next, dataService } = fixture
      // Pause the direct call's handler `get()` until `Outer()` calls the same
      // short-lived cached function.
      dataService.hold('lookup:short-lived:shared')
      const building = next.build()
      try {
        await dataService.waitForRequest('join-ready')
        dataService.release('lookup:short-lived:shared')
        const result = await building
        // The nested call shares the direct call's hanging promise. Its cache
        // entry cannot complete, so the build reports a prerender timeout.
        expect(result.exitCode).toBe(1)
        expect(next.cliOutput).toContain(
          'function took too long during prerendering'
        )
        expect(next.cliOutput).toContain('Error occurred prerendering page "/"')
      } finally {
        dataService.releaseAll()
        await building
      }
    })
  })

  describe('concurrent prerenders sharing the same short-lived cache', () => {
    const fixture = setupFixture('lifetime')

    it('currently omits cached work in a second prerender after the first prerender finishes', async () => {
      const { next, dataService } = fixture
      // Keep the producer's `get()` pending until the consumer starts its
      // calls. Keep `readIndependent()` pending until the producer's `after()`
      // callback.
      dataService.hold('lookup:short-lived:shared')
      dataService.hold('independent')
      const building = next.build()
      try {
        await dataService.waitForRequest('join-ready')
        dataService.release('lookup:short-lived:shared')
        await dataService.waitForRequest('producer-finished')
        // Resolve the independent read after the producer's `after()` callback.
        // The consumer currently skips `readCachedMessage()`.
        dataService.release('independent', 'independent value')
        const result = await building
        expect(result.exitCode).toBe(0)
        // Copy the requests before `next.render()` can add runtime requests.
        // The `cached-message` assertion must check work done during the build.
        const buildRequests = [...dataService.requestedKeys]
        await next.start({ skipBuild: true })
        const html = await next.render('/consumer')
        const [shell] = html.split('<!-- PPR_BOUNDARY_SENTINEL -->')
        const $ = load(shell)
        expect($('#cached-message').text()).toBe('')
        expect($('#consumer-pending').length).toBe(1)
        expect(buildRequests).not.toContain('cached-message')
      } finally {
        dataService.releaseAll()
        await building
      }
    })
  })
})
