import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'gone-browser-behavior',
  {
    files: {
      'pages/_app.js': `
        import { useRouter } from 'next/router'
        import { useEffect } from 'react'
        
        export default function App({ Component, pageProps }) {
          const router = useRouter()
          
          useEffect(() => {
            if (typeof window !== 'undefined') {
              window.routerEvents = []
              const events = ['routeChangeStart', 'routeChangeComplete', 'routeChangeError']
              
              events.forEach((event) => {
                router.events.on(event, (...args) => {
                  window.routerEvents.push({ event, args })
                })
              })
            }
          }, [router])
          
          return <Component {...pageProps} />
        }
      `,
      'pages/index.js': `
        import Link from 'next/link'
        
        export default function Home() {
          return (
            <div>
              <h1>Home Page</h1>
              <nav>
                <ul>
                  <li><Link href="/active" id="link-active">Active Page</Link></li>
                  <li><Link href="/deleted" id="link-deleted">Deleted Page</Link></li>
                  <li><Link href="/unknown" id="link-unknown">Unknown Page</Link></li>
                </ul>
              </nav>
            </div>
          )
        }
      `,
      'pages/active.js': `
        import Link from 'next/link'
        
        export default function ActivePage() {
          return (
            <div>
              <h1>Active Page</h1>
              <Link href="/" id="back-link">Back to Home</Link>
            </div>
          )
        }
      `,
      'pages/deleted.js': `
        export default function DeletedPage() {
          return <div>This should not be rendered</div>
        }
        
        export function getServerSideProps() {
          return {
            gone: true
          }
        }
      `,
      'pages/unknown.js': `
        export default function UnknownPage() {
          return <div>This should not be rendered</div>
        }
        
        export function getServerSideProps() {
          return {
            notFound: true
          }
        }
      `,
      'pages/410.js': `
        export default function Custom410() {
          return (
            <div>
              <h1 id="gone-title">410 - Content Gone</h1>
              <p>This content has been permanently removed.</p>
              <a href="/" id="back-to-home">Back to Home</a>
            </div>
          )
        }
      `,
      'pages/404.js': `
        export default function Custom404() {
          return (
            <div>
              <h1 id="not-found-title">404 - Page Not Found</h1>
              <a href="/" id="back-to-home">Back to Home</a>
            </div>
          )
        }
      `,
    },
    dependencies: {},
  },
  ({ next, page }) => {
    it('should load custom 410 page with proper status code for direct navigation', async () => {
      const response = await page.goto(`${next.url}/deleted`, {
        waitUntil: 'networkidle',
      })

      // Verify status code is 410
      expect(response.status()).toBe(410)

      // Verify the custom 410 page is rendered
      const title = await page.textContent('#gone-title')
      expect(title).toBe('410 - Content Gone')

      // Verify the page has noindex meta tag
      const hasNoIndexTag = await page.evaluate(() => {
        const metaTag = document.querySelector(
          'meta[name="robots"][content="noindex"]'
        )
        return !!metaTag
      })
      expect(hasNoIndexTag).toBe(true)
    })

    it('should load custom 410 page for client-side navigation', async () => {
      // Start on home page
      await page.goto(next.url)

      // Clear any previous router events
      await page.evaluate(() => {
        window.routerEvents = []
      })

      // Click link to deleted page
      await page.click('#link-deleted')

      // Wait for 410 page to load
      await page.waitForSelector('#gone-title')

      // Verify the custom 410 page is rendered
      const title = await page.textContent('#gone-title')
      expect(title).toBe('410 - Content Gone')

      // Verify URL in browser
      expect(page.url()).toContain('/deleted')

      // Verify router events indicate error
      const routerEvents = await page.evaluate(() => window.routerEvents)

      // Should have routeChangeStart followed by routeChangeError
      expect(routerEvents[0].event).toBe('routeChangeStart')
      expect(routerEvents[1].event).toBe('routeChangeError')
    })

    it('should properly handle back/forward navigation involving gone pages', async () => {
      // Start on home page
      await page.goto(next.url)

      // Navigate to active page
      await page.click('#link-active')
      await page.waitForSelector('#back-link')

      // Navigate to deleted page (shows 410)
      await page.goto(`${next.url}/deleted`)
      await page.waitForSelector('#gone-title')

      // Go back to active page
      await page.goBack()

      // Wait for active page to load
      await page.waitForSelector('#back-link')
      expect(page.url()).toContain('/active')

      // Go forward again to deleted page
      await page.goForward()

      // Wait for 410 page to load
      await page.waitForSelector('#gone-title')
      expect(page.url()).toContain('/deleted')
    })

    it('should distinguish between 410 and 404 status codes', async () => {
      // First check the 410 page
      const goneResponse = await page.goto(`${next.url}/deleted`)
      expect(goneResponse.status()).toBe(410)

      // Then check the 404 page
      const notFoundResponse = await page.goto(`${next.url}/unknown`)
      expect(notFoundResponse.status()).toBe(404)

      // Verify correct page is shown
      const title = await page.textContent('#not-found-title')
      expect(title).toBe('404 - Page Not Found')
    })
  }
)
