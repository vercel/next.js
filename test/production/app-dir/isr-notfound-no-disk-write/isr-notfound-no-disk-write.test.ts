import { nextTestSetup } from 'e2e-utils'

describe('isr-notfound-no-disk-write', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const pageArtifacts = (slug: string) => [
    `.next/server/app/isr/${slug}.html`,
    `.next/server/app/isr/${slug}.rsc`,
    `.next/server/app/isr/${slug}.meta`,
  ]

  const routeArtifacts = (slug: string) => [
    `.next/server/app/isr-route/${slug}.body`,
    `.next/server/app/isr-route/${slug}.meta`,
  ]

  it('persists the build-time generateStaticParams entry to disk', async () => {
    for (const file of pageArtifacts('known')) {
      expect(await next.hasFile(file)).toBe(true)
    }
    for (const file of routeArtifacts('known')) {
      expect(await next.hasFile(file)).toBe(true)
    }
  })

  it('does not persist a page notFound() response for an unknown slug to disk', async () => {
    for (const file of pageArtifacts('missing')) {
      expect(await next.hasFile(file)).toBe(false)
    }

    const first = await next.fetch('/isr/missing')
    expect(first.status).toBe(404)

    for (const file of pageArtifacts('missing')) {
      expect(await next.hasFile(file)).toBe(false)
    }

    // Requesting it again should still 404 and still not write anything.
    const second = await next.fetch('/isr/missing')
    expect(second.status).toBe(404)

    for (const file of pageArtifacts('missing')) {
      expect(await next.hasFile(file)).toBe(false)
    }
  })

  it('does not persist a route handler notFound() response for an unknown slug to disk', async () => {
    for (const file of routeArtifacts('missing')) {
      expect(await next.hasFile(file)).toBe(false)
    }

    const first = await next.fetch('/isr-route/missing')
    expect(first.status).toBe(404)

    for (const file of routeArtifacts('missing')) {
      expect(await next.hasFile(file)).toBe(false)
    }
  })

  it('still serves a valid revalidated page correctly', async () => {
    const res = await next.fetch('/isr/known')
    expect(res.status).toBe(200)
    const $ = await next.render$('/isr/known')
    expect($('#slug').text()).toBe('known')
  })
})
