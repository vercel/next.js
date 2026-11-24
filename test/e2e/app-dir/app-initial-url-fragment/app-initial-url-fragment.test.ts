import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('App Router fragments after an initial page load', () => {
  const { next } = nextTestSetup({
    files: {
      'app/layout.js': `
        export default function Layout({ children }) {
          return <html lang="en"><body>{children}</body></html>
        }
      `,
      'app/search/page.js': `
        import Link from 'next/link'

        export default async function Search({ searchParams }) {
          const { page = '1' } = await searchParams

          return (
            <main>
              <p id="results">Page {page}</p>
              <Link id="next-page" href="/search?q=1&page=2" prefetch={false}>
                Page 2
              </Link>
              <Link id="first-page" href="/search?q=1" prefetch={false}>
                Page 1
              </Link>
              <Link id="first-page-section" href="/search?q=1#a" prefetch={false}>
                Page 1, section A
              </Link>
              <section id="a">Section A</section>
            </main>
          )
        }
      `,
    },
  })

  it.each([
    ['first-page-section', '#a'],
    ['first-page', ''],
  ])('uses the target fragment when navigating via %s', async (id, hash) => {
    const pageOne = '/search?q=1'
    const browser = await next.browser(pageOne + '#a')
    expect(await browser.url()).toBe(next.url + pageOne + '#a')

    await browser.elementById('next-page').click()
    await retry(async () => {
      expect(await browser.url()).toBe(next.url + pageOne + '&page=2')
      expect(await browser.elementById('results').text()).toBe('Page 2')
    })

    await browser.elementById(id).click()
    await retry(async () => {
      expect(await browser.url()).toBe(next.url + pageOne + hash)
      expect(await browser.elementById('results').text()).toBe('Page 1')
    })
  })
})
