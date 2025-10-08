import { getBrowserBodyText, retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe(`Handle new URL asset references`, () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const expectedServer =
    /Hello <!-- -->\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png<!-- -->\+<!-- -->\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png/
  const expectedClient = new RegExp(
    expectedServer.source.replace(/<!-- -->/g, '')
  )

  for (const page of ['/static', '/ssr', '/ssg']) {
    it(`should render the ${page} page`, async () => {
      const html = await next.render(page)
      expect(html).toMatch(expectedServer)
    })

    it(`should client-render the ${page} page`, async () => {
      const browser = await next.browser(page)
      await retry(async () =>
        expect(await getBrowserBodyText(browser)).toMatch(expectedClient)
      )
    })
  }

  it('should respond on size api', async () => {
    const data = await next
      .fetch('/api/size')
      .then((res) => res.ok && res.json())

    expect(data).toEqual({ size: 30079 })
  })

  it('should respond on basename api', async () => {
    const data = await next
      .fetch('/api/basename')
      .then((res) => res.ok && res.json())

    expect(data).toEqual({
      basename: expect.stringMatching(/^vercel\.[0-9a-f]{8}\.png$/),
    })
  })
})
