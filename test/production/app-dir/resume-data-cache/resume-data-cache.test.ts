import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('resume-data-cache', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // TODO: re-enable once support has been added
    skipDeployment: true,
  })
  if (skipped) return

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
      let rsc

      await retry(async () => {
        rsc = await next
          .fetch('/', {
            headers: {
              RSC: '1',
              'Next-Router-Prefetch': '1',
            },
          })
          .then((res) => res.text())
        expect(rsc).toContain(first)
      })

      // Then get the dynamic RSC and validate that it also contains the same
      // random number.
      await retry(async () => {
        rsc = await next
          .fetch('/', {
            headers: {
              RSC: '1',
            },
          })
          .then((res) => res.text())
        expect(rsc).toContain(first)
      })

      // Then revalidate the page
      await next.fetch('/revalidate', { method: 'POST' })

      // Then get the dynamic RSC again and validate that it still contains the
      // same random number.
      await retry(async () => {
        rsc = await next
          .fetch('/', {
            headers: {
              RSC: '1',
            },
          })
          .then((res) => res.text())
        expect(rsc).toContain(first)
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
        rsc = await next
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
        rsc = await next
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
