import { NextInstance, createNext, isNextDeploy, isNextDev } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import http from 'node:http'

describe('ppr-unstable-cache', () => {
  if (isNextDeploy) {
    it.skip('should not run in deploy mode', () => {})
    return
  }

  if (isNextDev) {
    it.skip('should not run in dev mode', () => {})
    return
  }

  let next: NextInstance | null = null
  let server: http.Server | null = null
  afterEach(async () => {
    if (next) {
      await next.destroy()
      next = null
    }

    if (server) {
      await server.close()
      server = null
    }
  })

  it('should not cache inner fetch calls', async () => {
    let generations: string[] = []
    server = http.createServer(async (req, res) => {
      try {
        if (!req.url) throw new Error('No URL')

        const cache = new URL(req.url, 'http://n').searchParams.get('cache')
        if (!cache) throw new Error('No cache key')

        const random = Math.floor(Math.random() * 1000).toString()
        const data = cache + ':' + random
        generations.push(data)
        res.end(data)
      } catch (err) {
        res.statusCode = 500
        res.end(err.message)
      }
    })
    const port = await findPort()
    server.listen(port)

    next = await createNext({
      files: __dirname,
      env: { TEST_DATA_SERVER: `http://localhost:${port}/` },
    })

    expect(generations).toHaveLength(2)

    const first = await next
      .render$('/')
      .then(($) => JSON.parse($('#data').text()))

    expect(generations).toHaveLength(2)

    expect(first.data.forceCache).toBeOneOf(generations)
    expect(first.data.noStore).toBeOneOf(generations)

    // Try a few more times, we should always get the same result.
    for (let i = 0; i < 3; i++) {
      const again = await next
        .render$('/')
        .then(($) => JSON.parse($('#data').text()))

      expect(generations).toHaveLength(2)
      expect(first).toEqual(again)
    }

    // Revalidate the tag associated with the `unstable_cache` call.
    const revalidate = await next.fetch('/revalidate-tag', { method: 'POST' })
    expect(revalidate.status).toBe(200)
    await revalidate.text()

    const revalidated = await next
      .render$('/')
      .then(($) => JSON.parse($('#data').text()))

    // Expect that the `cache: no-store` value has been updated, but not
    // the `cache: force-cache` value.
    expect(generations).toHaveLength(3)

    // We know now that the generations have been updated, so let's try to
    // validate the value. We don't need to do this within the retry.
    expect(revalidated.random).not.toEqual(first.random)
    expect(revalidated.data.forceCache).toBe(generations[1])
    expect(revalidated.data.noStore).toBe(generations[2])
    expect(revalidated).not.toEqual(first)

    // Ensure that the `force-cache` value has not been updated, and only called
    // once.
    expect(generations.filter((g) => g.startsWith('force-cache'))).toHaveLength(
      1
    )
  })
})
