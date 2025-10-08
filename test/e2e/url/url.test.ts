import { retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe(`Handle new URL asset references`, () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should respond on middleware api', async () => {
    const data = await next
      .fetch('/middleware')
      .then((res) => res.ok && res.json())

    expect(data).toEqual({
      imported: expect.objectContaining({
        src: expect.stringMatching(
          /^\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png$/
        ),
      }),
      url: expect.stringMatching(/blob:vercel\.[0-9a-f]{8,}\.png$/),
    })
  })

  it('should respond on webmanifest', async () => {
    const data = await next
      .fetch('/manifest.webmanifest')
      .then((res) => res.ok && res.json())

    expect(data).toEqual({
      short_name: 'Next.js',
      name: 'Next.js',
      icons: [
        {
          src: expect.stringMatching(
            /^\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png$/
          ),
          type: 'image/png',
          sizes: '512x512',
        },
      ],
    })
  })

  const expectedPage =
    /Hello \/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png\+\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png/

  describe('app router', () => {
    for (const page of ['/rsc', '/client']) {
      it(`should render the ${page} page`, async () => {
        const $ = await next.render$(page)
        expect($('main').text()).toMatch(expectedPage)
      })

      it(`should client-render the ${page} page`, async () => {
        const browser = await next.browser(page)
        await retry(async () =>
          expect(await browser.elementByCss('main').text()).toMatch(
            expectedPage
          )
        )
      })
    }

    it('should respond on API', async () => {
      const data = await next.fetch('/api').then((res) => res.ok && res.json())

      expect(data).toEqual({
        imported: expect.objectContaining({
          src: expect.stringMatching(
            /^\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png$/
          ),
        }),
        url: expect.stringMatching(
          /^\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png$/
        ),
      })
    })
  })

  describe('pages router', () => {
    for (const page of ['/pages/static', '/pages/ssr', '/pages/ssg']) {
      it(`should render the ${page} page`, async () => {
        const $ = await next.render$(page)
        expect($('main').text()).toMatch(expectedPage)
      })

      it(`should client-render the ${page} page`, async () => {
        const browser = await next.browser(page)
        await retry(async () =>
          expect(await browser.elementByCss('main').text()).toMatch(
            expectedPage
          )
        )
      })
    }

    it('should respond on size api', async () => {
      const data = await next
        .fetch('/api/pages/size')
        .then((res) => res.ok && res.json())

      expect(data).toEqual({ size: 30079 })
    })

    it('should respond on basename api', async () => {
      const data = await next
        .fetch('/api/pages/basename')
        .then((res) => res.ok && res.json())

      expect(data).toEqual({
        basename: expect.stringMatching(/^vercel\.[0-9a-f]{8}\.png$/),
      })
    })
  })
})
