import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Invalidation and expiry are properties of production caches.
// @force-gate prod
describe('param-matching-revalidation', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  // A deployment regenerates in the background and propagates invalidations
  // between regions.
  const timeout = isNextDeploy ? 30_000 : 3_000

  function uniqueSlug() {
    return `r-${Math.random().toString(36).slice(2, 10)}`
  }

  async function read(pathname: string, params: string) {
    const res = await next.fetch(pathname)
    const html = await res.text()
    expect(res.status).toBe(200)
    const $ = cheerio.load(html)
    expect($('#params').text()).toBe(params)
    const stamp = $('#stamp').text()
    expect(stamp).not.toBe('')
    return stamp
  }

  // A value that was just generated or invalidated can be served stale once
  // more while its replacement is produced.
  async function settle(pathname: string, params: string) {
    return retry(async () => {
      const first = await read(pathname, params)
      expect(await read(pathname, params)).toBe(first)
      return first
    }, timeout)
  }

  async function expectNotFound(pathname: string) {
    const res = await next.fetch(pathname)
    await res.text()
    expect(res.status).toBe(404)
  }

  async function revalidate(body: {
    tag?: string
    path?: string
    type?: string
  }) {
    const res = await next.fetch('/pm-reval/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(200)
    await res.text()
  }

  async function runAction(mode: 'update' | 'revalidate', tag: string) {
    const browser = await next.browser('/pm-reval/actions')
    try {
      await browser.elementByCss('#tag').type(tag)
      await browser.elementByCss(`#${mode}-tag`).click()
      await retry(async () => {
        expect(await browser.elementByCss('#result').text()).toBe(
          `${mode}:${tag}`
        )
      })
    } finally {
      await browser.close()
    }
  }

  function cases(kind: string) {
    const values = kind === 'closed' ? ['seeded'] : ['seeded', 'runtime']

    describe.each(values)('%s value', (variant) => {
      function pick() {
        const slug = variant === 'seeded' ? 'a' : uniqueSlug()
        return { slug, pathname: `/pm-reval/${kind}/${slug}` }
      }

      it('settles on one stamp', async () => {
        const { slug, pathname } = pick()
        const stamp = await settle(pathname, slug)
        expect(await read(pathname, slug)).toBe(stamp)
      })

      it('regenerates after revalidateTag on its own tag without affecting other values or admission', async () => {
        const { slug, pathname } = pick()
        const unlisted = `/pm-reval/closed/${uniqueSlug()}`
        const other = kind === 'closed' ? undefined : uniqueSlug()

        const before = await settle(pathname, slug)
        let otherBefore: string | undefined
        if (other !== undefined) {
          otherBefore = await settle(`/pm-reval/${kind}/${other}`, other)
        }
        if (kind === 'closed') {
          await expectNotFound(unlisted)
        }

        await revalidate({ tag: `pm-reval:${kind}:${slug}` })

        await retry(async () => {
          expect(await read(pathname, slug)).not.toBe(before)
        }, timeout)
        if (other !== undefined) {
          expect(await read(`/pm-reval/${kind}/${other}`, other)).toBe(
            otherBefore
          )
        }
        if (kind === 'closed') {
          await expectNotFound(unlisted)
          await revalidate({
            tag: `pm-reval:closed:${unlisted.split('/').pop()}`,
          })
          await expectNotFound(unlisted)
        }
      })

      it('regenerates every value after revalidateTag on the route-wide tag', async () => {
        const { slug, pathname } = pick()
        const other = variant === 'seeded' ? uniqueSlug() : 'a'
        const otherPathname = `/pm-reval/${kind}/${other}`
        const admitsOther = kind !== 'closed'

        const before = await settle(pathname, slug)
        const otherBefore = admitsOther
          ? await settle(otherPathname, other)
          : undefined

        await revalidate({ tag: `pm-reval:${kind}` })

        await retry(async () => {
          expect(await read(pathname, slug)).not.toBe(before)
        }, timeout)
        if (admitsOther) {
          await retry(async () => {
            expect(await read(otherPathname, other)).not.toBe(otherBefore)
          }, timeout)
        } else {
          await expectNotFound(otherPathname)
        }
      })

      it('shows a new stamp on the first read after updateTag in a Server Action', async () => {
        const { slug, pathname } = pick()
        const before = await settle(pathname, slug)

        await runAction('update', `pm-reval:${kind}:${slug}`)

        if (isNextDeploy) {
          // A deployment can serve the previous entry once more.
          await retry(async () => {
            expect(await read(pathname, slug)).not.toBe(before)
          }, timeout)
        } else {
          expect(await read(pathname, slug)).not.toBe(before)
        }
      })

      it('regenerates after revalidateTag in a Server Action', async () => {
        const { slug, pathname } = pick()
        const before = await settle(pathname, slug)

        await runAction('revalidate', `pm-reval:${kind}:${slug}`)

        await retry(async () => {
          expect(await read(pathname, slug)).not.toBe(before)
        }, timeout)
      })

      it('regenerates after revalidatePath for the concrete path', async () => {
        const { slug, pathname } = pick()
        const before = await settle(pathname, slug)

        await revalidate({ path: pathname })

        await retry(async () => {
          expect(await read(pathname, slug)).not.toBe(before)
        }, timeout)
      })
    })
  }

  describe.each(['closed', 'blocking'])('%s', (kind) => {
    cases(kind)
  })

  // `plain` has no matching configuration. These routes serve a shell for a
  // value without a build-time prerender, and a deployment does not always
  // store the completed page afterwards.
  // @force-gate !deploy
  describe.each(['fallback', 'plain'])('%s', (kind) => {
    cases(kind)
  })

  // The legacy Vercel builder stores one entry per tail value.
  // @force-gate !deploy || adapter
  describe('dynamic tail', () => {
    it.each(['seeded', 'runtime'])(
      'shares one stamp across tail values and regenerates it by tag: %s top',
      async (variant) => {
        const top = variant === 'seeded' ? 'a' : uniqueSlug()
        const first = `/pm-reval/dynamic/${top}/first`
        const second = `/pm-reval/dynamic/${top}/second`

        // A deployment can replace a shell it has just served.
        const before = await retry(async () => {
          const stamp = await read(first, `${top}/first`)
          expect(await read(second, `${top}/second`)).toBe(stamp)
          return stamp
        }, timeout)

        await revalidate({ tag: `pm-reval:dynamic:${top}` })

        const after = await retry(async () => {
          const stamp = await read(first, `${top}/first`)
          expect(stamp).not.toBe(before)
          return stamp
        }, timeout)
        await retry(async () => {
          expect(await read(second, `${top}/second`)).toBe(after)
        }, timeout)
      }
    )
  })

  describe('time-based expiry', () => {
    it.each(['seeded', 'runtime'])(
      'keeps a stamp stable within its lifetime and regenerates it afterwards: %s value',
      async (variant) => {
        const slug = variant === 'seeded' ? 'a' : uniqueSlug()
        const pathname = `/pm-reval/timed/${slug}`

        // The revalidate window is one second, so the build-time or first
        // output may already be stale. Wait for a fresh one.
        const stable = await settle(pathname, slug)

        await retry(async () => {
          expect(await read(pathname, slug)).not.toBe(stable)
        }, 30_000)
      }
    )
  })
})
