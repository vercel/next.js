import { createNext } from 'e2e-utils'
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
            return <p>{router.asPath}</p>
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
    const href = await browser.elementByCss('a').getAttribute('href')
    expect(href).toBe('/days/foo?foo=bar')
  })
})
