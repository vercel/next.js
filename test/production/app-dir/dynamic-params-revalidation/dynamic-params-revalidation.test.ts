import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dynamicParams: false revalidation', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function readPage(pathname: string) {
    const response = await next.fetch(pathname)
    const $ = load(await response.text())
    return { status: response.status, generation: $('#generation').text() }
  }

  async function revalidate(pathname: string) {
    const response = await next.fetch('/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pathname }),
    })
    expect(response.status).toBe(200)
  }

  it.each([
    '/closed/known',
    '/catch-all/known/nested',
    '/optional',
    '/optional/known',
    '/open/known',
    '/open/generated-at-runtime',
  ])('regenerates %s after repeated invalidation', async (pathname) => {
    let previous = await readPage(pathname)
    expect(previous.status).toBe(200)
    expect(previous.generation).not.toBe('')
    expect(await readPage(pathname)).toEqual(previous)

    for (let i = 0; i < 2; i++) {
      await revalidate(pathname)
      const current = await readPage(pathname)
      expect(current.status).toBe(200)
      expect(current.generation).not.toBe('')
      expect(current.generation).not.toBe(previous.generation)
      expect(await readPage(pathname)).toEqual(current)
      previous = current
    }
  })

  it('preserves time-based regeneration of a closed route', async () => {
    const before = await readPage('/timed/known')
    expect(before.status).toBe(200)
    expect(before.generation).not.toBe('')
    await retry(async () => {
      const after = await readPage('/timed/known')
      expect(after.status).toBe(200)
      expect(after.generation).not.toBe('')
      expect(after.generation).not.toBe(before.generation)
    })
  })

  it('shares regeneration across concurrent requests after invalidation', async () => {
    const before = await readPage('/closed/concurrent')
    expect(before.status).toBe(200)
    await revalidate('/closed/concurrent')

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => readPage('/closed/concurrent'))
    )
    for (const response of responses) {
      expect(response.status).toBe(200)
      expect(response.generation).not.toBe('')
      expect(response.generation).not.toBe(before.generation)
      expect(response).toEqual(responses[0])
    }
    expect(await readPage('/closed/concurrent')).toEqual(responses[0])
  })

  it('serves a stale response while regenerating without changing that response to a 404', async () => {
    const outputStart = next.cliOutput.length
    await revalidate('/timed/stale')
    const before = await readPage('/timed/stale')
    expect(before.status).toBe(200)
    expect(before.generation).not.toBe('')

    // A stale cache hit resolves the request before the background generator
    // finishes. Admission checks must not turn that regeneration into a 404.
    await retry(async () => {
      const response = await next.fetch('/timed/stale')
      expect(response.status).toBe(200)
      const $ = load(await response.text())
      expect(response.headers.get('x-nextjs-cache')).toBe('STALE')
      expect($('#generation').text()).toBe(before.generation)
    })
    await retry(async () => {
      const after = await readPage('/timed/stale')
      expect(after.status).toBe(200)
      expect(after.generation).not.toBe('')
      expect(after.generation).not.toBe(before.generation)
    })
    const output = next.cliOutput.slice(outputStart)
    expect(output).not.toContain('NoFallbackError')
    expect(output).not.toContain('ERR_HTTP_HEADERS_SENT')
  })

  it('allows content to disappear and return at an admitted URL', async () => {
    const original = await next.readFile('content.json')
    try {
      expect((await readPage('/closed/mutable')).status).toBe(200)
      await next.patchFile('content.json', JSON.stringify({ mutable: null }))
      await revalidate('/closed/mutable')
      expect((await readPage('/closed/mutable')).status).toBe(404)

      await next.patchFile('content.json', original)
      await revalidate('/closed/mutable')
      expect((await readPage('/closed/mutable')).status).toBe(200)
    } finally {
      await next.patchFile('content.json', original)
    }
  })

  it('can regenerate an admitted URL that rendered notFound during the build', async () => {
    const original = await next.readFile('content.json')
    try {
      expect((await readPage('/closed/initially-missing')).status).toBe(404)
      // Omit the key: only an explicit null means the content is unavailable.
      await next.patchFile(
        'content.json',
        JSON.stringify({ mutable: 'available' })
      )
      await revalidate('/closed/initially-missing')
      expect((await readPage('/closed/initially-missing')).status).toBe(200)
    } finally {
      await next.patchFile('content.json', original)
    }
  })

  it.each([
    '/closed/unlisted',
    '/catch-all/unlisted/nested',
    '/optional/unlisted',
  ])('does not admit %s after invalidation', async (pathname) => {
    const outputStart = next.cliOutput.length
    expect((await readPage(pathname)).status).toBe(404)
    await revalidate(pathname)
    expect((await readPage(pathname)).status).toBe(404)
    expect(next.cliOutput.slice(outputStart)).not.toContain(
      'closed page render'
    )
    expect(next.cliOutput.slice(outputStart)).not.toContain('NoFallbackError')
  })
})
