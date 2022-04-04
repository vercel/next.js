import { createNext } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { BrowserInterface } from 'test/lib/browsers/base'
import { NextInstance } from 'test/lib/next-modes/base'

describe('Interpolate dynamic path with search param', () => {
  let next: NextInstance
  let browser: BrowserInterface
  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          import Link from "next/link"

          export default function Page() {
            return (
              <Link
                href={{
                  pathname: "/days/[day]",
                  query: { day: "foo" },
                  search: "foo=bar",
                }}
              >
                Day
              </Link>
            )
          }
        `,
        'pages/days/[day].js': `
          import { useRouter } from "next/router"

          export default function Page() {
            const router = useRouter()
            return <p id="days">{router.asPath}</p>
          }`,
      },
      dependencies: {},
    })
  })
  afterAll(async () => {
    await next.destroy()
    await browser.close()
  })

  it('should work', async () => {
    browser = await webdriver(next.appPort, '/')
    await browser.elementByCss('a').click()
    const text = await browser.waitForElementByCss('#days').text()
    expect(text).toBe('/days/foo?foo=bar')
  })
})
