import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir gone()',
  {
    files: {
      'app/page.js': `
        export default function Page() {
          return <h1>Home Page</h1>
        }
      `,
      'app/gone/page.js': `
        import { gone } from 'next/navigation'
        
        export default function GonePage() {
          gone()
          return <h1>This will not be rendered</h1>
        }
      `,
      'app/gone/gone.js': `
        export default function CustomGone() {
          return <h1>Custom Gone Page</h1>
        }
      `,
      'app/nested/[slug]/page.js': `
        export function generateStaticParams() {
          return [
            { slug: 'test' }
          ]
        }
        
        export default function Page({ params }) {
          if (params.slug === 'removed') {
            const { gone } = require('next/navigation')
            gone()
          }
          return <h1>Slug: {params.slug}</h1>
        }
      `,
      'app/nested/gone.js': `
        export default function NestedGone() {
          return <h1>Nested Gone Page</h1>
        }
      `,
    },
    dependencies: {},
  },
  ({ next }) => {
    it('should render the custom gone page with 410 status when gone() is called', async () => {
      const response = await next.fetch('/gone')
      expect(response.status).toBe(410)

      const html = await response.text()
      expect(html).toContain('Custom Gone Page')
      expect(html).toContain('<meta name="robots" content="noindex"')
    })

    it('should render the custom gone page when visiting a dynamic route that calls gone()', async () => {
      const response = await next.fetch('/nested/removed')
      expect(response.status).toBe(410)

      const html = await response.text()
      expect(html).toContain('Nested Gone Page')
    })

    it('should render the normal page when not calling gone()', async () => {
      const response = await next.fetch('/nested/test')
      expect(response.status).toBe(200)

      const html = await response.text()
      expect(html).toContain('Slug: test')
    })
  }
)
