import { nextTestSetup } from 'e2e-utils'

// Real HTTP oracle for the request fixture: do not replace framework APIs here.
describe('next-testing-request-cache', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('keeps concurrent request cookies, headers, params and URLs separate', async () => {
    await Promise.all(
      Array.from({ length: 8 }, async (_, index) => {
        const visitor = `visitor-${index}`
        const response = await next.fetch(
          `/inspect/${index}?value=${index}&value=second`,
          {
            headers: {
              cookie: `visitor=${visitor}`,
              'accept-language': `en-${index}`,
            },
          }
        )
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          before: visitor,
          after: visitor,
          language: `en-${index}`,
          id: String(index),
          pathname: `/inspect/${index}`,
          values: [String(index), 'second'],
        })
      })
    )
  })

  it('enforces render mutation restrictions and request memoization', async () => {
    const render = async (visitor: string) => {
      const $ = await next.render$(
        '/',
        {},
        {
          headers: { cookie: `visitor=${visitor}`, 'accept-language': 'en' },
        }
      )
      const result = JSON.parse($('#request').text())
      expect(result).toMatchObject({
        cookie: visitor,
        language: 'en',
        cookieMutationRejected: true,
        headerMutationRejected: true,
      })
      expect(result.tokens[0]).toEqual(result.tokens[1])
      return result.tokens[0]
    }
    const first = await render('first')
    const second = await render('second')
    expect(first).not.toEqual(second)
    const response = await next.fetch('/')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('commits route-handler cookie mutations to the HTTP response', async () => {
    const response = await next.fetch('/mutate', { method: 'POST' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ visitor: 'changed' })
    expect(response.headers.get('set-cookie')).toContain('visitor=changed')
    expect(response.headers.get('set-cookie')).toMatch(/httponly/i)
    const nextRequest = await next.fetch('/inspect/after', {
      headers: { cookie: 'visitor=changed' },
    })
    expect(await nextRequest.json()).toMatchObject({ before: 'changed' })
    const independent = await next.fetch('/inspect/independent')
    expect(await independent.json()).not.toHaveProperty('before')
  })

  it('observes redirect and not-found effects over HTTP', async () => {
    const response = await next.fetch('/redirect', { redirect: 'manual' })
    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!, next.url).search).toBe(
      '?redirected=1'
    )
    expect((await next.fetch('/missing')).status).toBe(404)
  })
})
