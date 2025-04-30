import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir gone-navigation',
  {
    files: {
      'app/page.js': `
        export default function Home() {
          return (
            <div>
              <h1>Home Page</h1>
              <nav>
                <a href="/posts/active" id="link-active">Active Post</a>
                <a href="/posts/deleted" id="link-deleted">Deleted Post</a>
                <a href="/posts/unknown" id="link-unknown">Unknown Post</a>
              </nav>
            </div>
          )
        }
      `,
      'app/posts/[slug]/page.js': `
        import { gone, notFound } from 'next/navigation'
        
        export default function Post({ params }) {
          if (params.slug === 'deleted') {
            gone()
          }
          
          if (params.slug !== 'active') {
            notFound()
          }
          
          return (
            <div>
              <h1>Post: {params.slug}</h1>
              <a href="/" id="back-link">Back to Home</a>
            </div>
          )
        }
      `,
      'app/posts/gone.js': `
        export default function PostGone() {
          return (
            <div>
              <h1 id="gone-title">Post Permanently Removed</h1>
              <a href="/" id="gone-home-link">Home</a>
            </div>
          )
        }
      `,
      'app/not-found.js': `
        export default function NotFound() {
          return (
            <div>
              <h1 id="not-found-title">Not Found</h1>
              <a href="/" id="not-found-home-link">Home</a>
            </div>
          )
        }
      `,
    },
    dependencies: {},
  },
  ({ next, page }) => {
    it('should navigate to 410 gone page when client-side navigating to a gone page', async () => {
      // Start on the home page
      const homeUrl = next.url
      await page.goto(homeUrl)

      // Navigate to the deleted post using client-side navigation
      await page.click('#link-deleted')
      await page.waitForSelector('#gone-title')

      // Verify the URL is correct
      expect(page.url()).toContain('/posts/deleted')

      // Verify we're showing the gone page
      const goneTitle = await page.textContent('#gone-title')
      expect(goneTitle).toBe('Post Permanently Removed')

      // Verify HTTP status is 410
      const response = await page.request.get(`${homeUrl}/posts/deleted`)
      expect(response.status()).toBe(410)
    })

    it('should navigate back correctly from a gone page', async () => {
      // Start on the deleted post page
      await page.goto(`${next.url}/posts/deleted`)
      await page.waitForSelector('#gone-title')

      // Click the back to home link
      await page.click('#gone-home-link')
      await page.waitForSelector('#link-active')

      // Verify we're back on the home page
      expect(page.url()).toBe(next.url + '/')
    })

    it('should distinguish between gone and not found', async () => {
      // Navigate to the unknown post
      await page.goto(`${next.url}/posts/unknown`)
      await page.waitForSelector('#not-found-title')

      // Verify we're showing the not-found page
      const notFoundTitle = await page.textContent('#not-found-title')
      expect(notFoundTitle).toBe('Not Found')

      // Verify HTTP status is 404
      const response = await page.request.get(`${next.url}/posts/unknown`)
      expect(response.status()).toBe(404)
    })
  }
)
