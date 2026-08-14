import { createNext } from 'e2e-utils'

describe('metadata sitemap duplicate routes', () => {
  it('does not warn when using generateSitemaps with sitemap.xml route', async () => {
    const next = await createNext({
      files: {
        'app/layout.tsx': `
          export default function RootLayout({ children }) {
            return <html><body>{children}</body></html>
          }
        `,

        'app/sitemap.ts': `
          export async function generateSitemaps() {
            return [{ id: 'posts' }]
          }

          export default function Sitemap() {
            return []
          }
        `,

        'app/sitemap.xml/route.ts': `
          export async function GET() {
            return new Response('<sitemapindex />', {
              headers: { 'Content-Type': 'application/xml' },
            })
          }
        `,
      },
    })

    try {
      // ASSERT using cliOutput (correct API)
      expect(next.cliOutput).not.toContain(
        'Duplicate page detected. app/sitemap.ts and app/sitemap.xml/route.ts resolve to /sitemap.xml'
      )
    } finally {
      await next.destroy()
    }
  })
})
