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
  describe('direct and nested calls during static prerendering', () => {
    const fixture = setupFixture('context')

    it('includes the long-lived outer cache in static HTML when the direct short-lived call starts the lookup first', async () => {
      const { next, dataService } = fixture
      // Pause the direct call's handler `get()` until `Outer()` calls the same
      // short-lived cached function.
      dataService.hold('lookup:short-lived:shared')
      const building = next.build()
      try {
        await dataService.waitForRequest('join-ready')
        dataService.release('lookup:short-lived:shared')
        const result = await building
        // `Outer()` must complete even though the direct call returns a hanging
        // promise. Its cache lifetime allows the result in the static HTML.
        expect(result.exitCode).toBe(0)
        expect(next.cliOutput).not.toContain(
          'Unexpected cache miss after cache warming phase during prerendering'
        )
        await next.start({ skipBuild: true })
        const html = await next.render('/')
        const [shell] = html.split('<!-- PPR_BOUNDARY_SENTINEL -->')
        const $ = load(shell)
        expect($('#outer').text()).toBe('short-lived shared')
        expect($('#short-lived').length).toBe(0)
        expect($('#short-pending').length).toBe(1)
      } finally {
        dataService.releaseAll()
        await building
      }
    })
  })

  describe('concurrent prerenders sharing the same short-lived cache', () => {
    const fixture = setupFixture('lifetime')

    it('continues cached work in a second prerender after the first prerender finishes, when both share a pending short-lived cache call', async () => {
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
        // The consumer must still complete its cached message after the
        // producer's `after()` callback.
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
        expect($('#cached-message').text()).toBe('message: independent value')
        expect($('#consumer-pending').length).toBe(0)
        expect(buildRequests).toContain('cached-message')
      } finally {
        dataService.releaseAll()
        await building
      }
    })
  })
})
