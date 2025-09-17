import { nextTestSetup } from 'e2e-utils'

describe('typedRoutes trailingSlash', () => {
  // ✅ Increase default timeout (from 120s to 300s)
  jest.setTimeout(300_000)

  const { next } = nextTestSetup({
    files: {
      'next.config.js': `
        /** @type {import('next').NextConfig} */
        const nextConfig = {
          trailingSlash: true,
          typedRoutes: true,
        };

        module.exports = nextConfig;
      `,
      'app/layout.tsx': `
        export default function RootLayout({ children }) {
          return (
            <html>
              <body>{children}</body>
            </html>
          );
        }
      `,
      'app/page.tsx': `
        import Link from 'next/link';

        export default function Page() {
          return (
            <div>
              <Link href="/dashboard/">Dashboard</Link>
            </div>
          );
        }
      `,
      'app/dashboard/page.tsx': `
        export default function DashboardPage() {
          return <h1>Dashboard</h1>;
        }
      `,
    },
  })

  afterAll(async () => {
    // ✅ Ensure instance is destroyed at the end
    if (next) {
      await next.destroy()
    }
  })

  it('should generate typed routes with trailing slash when trailingSlash is true', async () => {
    const linkDts = await next.readFile('.next/types/link.d.ts')
    expect(linkDts).toContain('type StaticRoutes =')
    expect(linkDts).toContain('| `/`')
    expect(linkDts).toContain('| `/dashboard/`')
    expect(linkDts).toContain(
      'type DynamicRoutes<T extends string = string> = never'
    )
  })

  it('should allow navigation to typed routes with trailing slash', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('a[href="/dashboard/"]').click()
    expect(await browser.url()).toContain('/dashboard/')
    expect(await browser.elementByCss('h1').text()).toBe('Dashboard')
  })
})
