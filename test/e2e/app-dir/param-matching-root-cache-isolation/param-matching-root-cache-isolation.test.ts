import { nextTestSetup } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import { createTestDataServer } from 'test-data-service/writer'
import { load } from 'cheerio'
import { PrefetchHint } from 'next/src/shared/lib/app-router-types'
import { UNEXPECTED_CACHE_MISS_MESSAGE } from 'next/src/server/use-cache/use-cache-errors'

// This inspects local build artifacts and uses a process-local data service. The
// existing param-matching-root-params suite covers deployed root fallbacks.
// @force-gate start
describe('param-matching-root-cache-isolation', () => {
  let server: ReturnType<typeof createTestDataServer>
  const requests: string[] = []
  let controlRequests = false
  let controlJoinedRequests = false
  const joinedRequests: string[] = []
  const joinedPending = new Map<string, () => void>()
  let nestedFillReleased = false
  let joinedAttempts = 0
  let buildShell: string
  let buildMetadata: string

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    const port = await findPort()
    const pending = new Map<string, () => void>()
    let languageRead = false

    server = createTestDataServer((key, response) => {
      if (controlJoinedRequests && key.startsWith('joined-')) {
        joinedRequests.push(key)
        if (nestedFillReleased) {
          response.resolve()
        } else if (key === 'joined-inner-started') {
          joinedPending.set(key, () => response.resolve())
          joinedPending.get('joined-top-level-ready')?.()
        } else if (key === 'joined-top-level-ready') {
          if (joinedPending.has('joined-inner-started')) {
            response.resolve()
          } else {
            joinedPending.set(key, () => response.resolve())
          }
        } else if (key === 'joined-top-level-called') {
          nestedFillReleased = true
          response.resolve()
          joinedPending.get('joined-inner-started')?.()
        } else {
          throw new Error(`Unexpected joined-cache request: ${key}`)
        }
        return
      }
      if (!controlRequests) {
        response.resolve(key === 'shared' ? 'shared content' : key)
        return
      }
      requests.push(key)
      if (key === 'language-read') {
        languageRead = true
        response.resolve()
        // The root-dependent cache is now cancelled. Let the other consumer
        // join the independent fill and let that fill finish.
        pending.get('independent-consumer')?.()
        pending.get('shared')?.()
      } else if (languageRead) {
        response.resolve(key === 'shared' ? 'shared content' : key)
      } else if (key === 'shared') {
        pending.set(key, () => response.resolve('shared content'))
        pending.get('before-language')?.()
      } else if (key === 'before-language' && pending.has('shared')) {
        response.resolve()
      } else {
        pending.set(key, () => response.resolve())
      }
    })
    server.listen(port)
    next.env.TEST_DATA_SERVICE_URL = `http://localhost:${port}`
    await next.start()
    // ISR replaces these files. Snapshot the build's measurements before any
    // request so the hint assertion doesn't depend on test ordering.
    buildShell = await next.readFile('.next/server/app/[lang].html')
    buildMetadata = await next.readFile('.next/server/app/[lang].meta')
  })

  afterAll(() => {
    server?.close()
  })

  it('does not cancel an independent pending fill when a nested cache reads an unknown root', async () => {
    controlRequests = true
    const revalidation = await next.fetch('/revalidate', { method: 'POST' })
    expect(revalidation.status).toBe(204)

    // A novel language selects the expired generic shell. It must now fill
    // caches from scratch, without the RDC used to seed the build-time shell.
    const $ = await next.render$('/fr')
    expect(requests).toContain('language-read')
    expect(requests.filter((key) => key === 'shared')).toHaveLength(1)
    expect($('#independent').text()).toBe('shared content')
    expect($('#independent').closest('[hidden]').length).toBe(0)
    expect($('#independent-pending').length).toBe(0)
    expect($('#localized').text()).toBe('FR:shared content')
    expect($('#localized').closest('[hidden]').length).toBe(1)
    expect($('#localized-pending').length).toBe(1)

    const $other = await next.render$('/de')
    expect($other('#independent').text()).toBe('shared content')
    expect($other('#independent').closest('[hidden]').length).toBe(0)
    expect($other('#localized').text()).toBe('DE:shared content')
    expect(requests.filter((key) => key === 'shared')).toHaveLength(1)
  })

  it('keeps the static-prefetch hint when only the fallback root prevents a complete shell', async () => {
    const $ = load(buildShell)
    expect($('#localized').length).toBe(0)
    const meta = JSON.parse(buildMetadata)
    expect(
      (meta.prefetchHints?.hints ?? 0) &
        PrefetchHint.ShouldAttemptStaticPrefetch
    ).toBe(PrefetchHint.ShouldAttemptStaticPrefetch)
  })

  it('records the omission reason when a top-level consumer joins a nested cache fill', async () => {
    joinedRequests.length = 0
    joinedPending.clear()
    nestedFillReleased = false
    // A retry must use the generic shell too, not a concrete page produced by
    // the previous attempt's background upgrade.
    const language = `fr-${++joinedAttempts}`
    controlJoinedRequests = true
    const revalidation = await next.fetch('/revalidate', { method: 'POST' })
    expect(revalidation.status).toBe(204)
    const logStart = next.cliOutput.length

    const $ = await next.render$(`/${language}/joined`)
    expect(joinedRequests.slice(0, 2)).toEqual(
      expect.arrayContaining(['joined-inner-started', 'joined-top-level-ready'])
    )
    expect(joinedRequests[2]).toBe('joined-top-level-called')
    expect($('#joined-nested').text()).toBe(language.toUpperCase())
    expect($('#joined-top-level').text()).toBe(language.toUpperCase())
    expect($('#joined-nested-pending').length).toBe(1)
    expect($('#joined-top-level-pending').length).toBe(1)
    expect($('#joined-nested').closest('[hidden]').length).toBe(1)
    expect($('#joined-top-level').closest('[hidden]').length).toBe(1)
    // The nested leader has no RDC. Its top-level joiner must record the hole
    // so the final prerender knows this is fallback data, not an unexplained miss.
    expect(next.cliOutput.slice(logStart)).not.toContain(
      UNEXPECTED_CACHE_MISS_MESSAGE
    )
  })
})
