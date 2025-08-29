import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { computeCacheBustingSearchParam } from 'next/dist/shared/lib/router/utils/cache-busting-search-param'

describe('resume-data-cache', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    { name: 'use cache', id: 'random-number' },
    { name: 'fetch cache', id: 'another-random-number' },
  ])(
    'should have consistent data between static and dynamic renders with $name',
    async ({ id }) => {
      // First render the page statically, getting the random number from the
      // HTML.
      let $ = await next.render$('/')
      const first = $(`p#${id}`).text()

      // Then get the Prefetch RSC and validate that it also contains the same
      // random number.
      await retry(async () => {
        const url = new URL('/', 'http://localhost')

        url.searchParams.set(
          '_rsc',
          computeCacheBustingSearchParam('1', '/__PAGE__', undefined, undefined)
        )

        const rsc = await next
          .fetch(url.toString(), {
            headers: {
              RSC: '1',
              'Next-Router-Prefetch': '1',
              'Next-Router-Segment-Prefetch': '/__PAGE__',
            },
          })
          .then((res) => res.text())
        expect(rsc).toContain(first)
      })

      // Then get the dynamic RSC and validate that it also contains the same
      // random number.
      await retry(async () => {
        const rsc = await next
          .fetch('/', {
            headers: {
              RSC: '1',
            },
          })
          .then((res) => res.text())
        expect(rsc).toContain(first)
      })

      // Then revalidate the page. Note: Dynamic RSC requests don't trigger
      // actual revalidation - they only mark tags as needing revalidation.
      // The actual revalidation only occurs when accessing a static resource again.
      await next.fetch('/revalidate', { method: 'POST' })

      // Then get the dynamic RSC again and validate that it still contains the
      // same random number. The first request will get the stale data, but the
      // second request will get the fresh data as it'll eventually have
      // revalidated.
      // NOTE: this current doesn't work on Next.js Deploy, as the dynamic RSC
      // requests are not able to revalidate the page.
      if (!isNextDeploy) {
        const rsc = await next
          .fetch('/', {
            headers: {
              RSC: '1',
            },
          })
          .then((res) => res.text())
        expect(rsc).toContain(first)
      }

      // We then expect after the background revalidation has been completed,
      // the dynamic RSC to get the fresh data.
      await retry(async () => {
        const rsc = await next
          .fetch('/', {
            headers: {
              RSC: '1',
            },
          })
          .then((res) => res.text())
        expect(rsc).not.toContain(first)
      })

      // This proves that the dynamic RSC was able to use the resume data cache
      // (RDC) from the static render to ensure that the data is consistent
      // between the static and dynamic renders. Let's now try to render the
      // page statically and see that the random number changes.

      $ = await next.render$('/')
      const random2 = $(`p#${id}`).text()
      expect(random2).not.toBe(first)

      // Then get the Prefetch RSC and validate that it also contains the new
      // random number.
      await retry(async () => {
        const rsc = await next
          .fetch('/', {
            headers: {
              RSC: '1',
              'Next-Router-Prefetch': '1',
            },
          })
          .then((res) => res.text())
        expect(rsc).toContain(random2)
      })

      // Then get the dynamic RSC again and validate that it also contains the
      // new random number.
      await retry(async () => {
        const rsc = await next
          .fetch('/', {
            headers: {
              RSC: '1',
            },
          })
          .then((res) => res.text())
        expect(rsc).toContain(random2)
      })

      // This proves that the dynamic RSC was able to use the resume data cache
      // (RDC) from the static render to ensure that the data is consistent
      // between the static and dynamic renders.
    }
  )
})
