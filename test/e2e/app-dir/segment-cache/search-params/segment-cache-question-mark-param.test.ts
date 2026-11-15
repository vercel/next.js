import { nextTestSetup, FileRef } from 'e2e-utils'
import { join } from 'path'
import { retry } from '../../../../lib/next-test-utils'

// `[?]` is a valid param name, so a vary path node whose id is `?` must not
// be taken for the search params entry. The `[?]` route is written at
// runtime rather than checked in: git refuses a path containing `?` on
// Windows, and webpack's `next build` rejects the emitted filename as a
// query string, so the fixture is turbopack-only.
// @force-gate turbopack && !deploy
describe('segment cache (param named "?")', () => {
  const { next } = nextTestSetup({
    files: {
      'app/layout.tsx': new FileRef(join(__dirname, 'app/layout.tsx')),
      'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
      'app/[?]/layout.tsx': `
        export default function QuestionMarkLayout({
          children,
        }: {
          children: React.ReactNode
        }) {
          return (
            <div>
              <p>Layout under [?]</p>
              {children}
            </div>
          )
        }
      `,
      'app/[?]/page.tsx': `
        import Link from 'next/link'
        import { Suspense } from 'react'

        async function Param({ params }: { params: Promise<{ '?': string }> }) {
          const { '?': value } = await params
          return <div id="question-mark-param">Param: {value}</div>
        }

        export default async function QuestionMarkPage({
          params,
        }: {
          params: Promise<{ '?': string }>
        }) {
          return (
            <>
              <Suspense fallback="Loading...">
                <Param params={params} />
              </Suspense>
              <Link id="link-param-a" href="/param-a">
                param-a
              </Link>
              <Link id="link-param-b" href="/param-b">
                param-b
              </Link>
            </>
          )
        }
      `,
    },
  })

  // The layout matters: the page's vary path derives from the layout's, which
  // ends at the `?` param node.
  it('keys segments under a param literally named "?" by its value', async () => {
    const browser = await next.browser('/param-a')
    expect(await browser.elementById('question-mark-param').text()).toBe(
      'Param: param-a'
    )

    await browser.elementById('link-param-b').click()
    await retry(async () => {
      expect(await browser.elementById('question-mark-param').text()).toBe(
        'Param: param-b'
      )
      expect(await browser.url()).toMatch(/\/param-b$/)
    })

    await browser.elementById('link-param-a').click()
    await retry(async () => {
      expect(await browser.elementById('question-mark-param').text()).toBe(
        'Param: param-a'
      )
    })
  })
})
