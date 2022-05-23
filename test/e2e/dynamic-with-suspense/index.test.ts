import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { hasRedbox, renderViaHTTP } from 'next-test-utils'
import webdriver from 'next-webdriver'

const suite =
  process.env.NEXT_TEST_REACT_VERSION === '^17' ? describe.skip : describe

// Skip the suspense test if react version is 17
suite('dynamic with suspense', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          import { Suspense } from "react";
          import dynamic from "next/dynamic";
          
          const Thing = dynamic(() => import("./thing"), { ssr: false, suspense: true });
          
          export default function IndexPage() {
            return (
              <div>
                <p>Next.js Example</p>
                <Suspense fallback="Loading...">
                  <Thing />
                </Suspense>
              </div>
            );
          }
        `,
        'pages/thing.js': `
          export default function Thing() {
            return "Thing";
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should render server-side', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('Next.js Example')
    expect(html).toContain('Thing')
  })

  it('should render client-side', async () => {
    const browser = await webdriver(next.url, '/')
    expect(await hasRedbox(browser)).toBe(false)
    await browser.close()
  })
})
