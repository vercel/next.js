import { load } from 'cheerio'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

const fonts = join(__dirname, '../../../e2e/app-dir/next-font/fonts')

describe('global-not-found font preloads', () => {
  const { next } = nextTestSetup({
    nextConfig: { experimental: { globalNotFound: true } },
    files: {
      'app/shared.ts': `
        import localFont from 'next/font/local'
        export const shared = localFont({ src: '../fonts/font1_roboto.woff2' })
      `,
      'app/(home)/layout.tsx': `
        import { shared } from '../shared'
        export default function Layout({ children }) {
          return <html><body className={shared.className}>{children}</body></html>
        }
      `,
      'app/(home)/page.tsx': `
        export default function Page() {
          return <p>Home</p>
        }
      `,
      'app/(plain)/layout.tsx': `
        export default function Layout({ children }) {
          return <html><body>{children}</body></html>
        }
      `,
      'app/(plain)/plain/page.tsx': `
        export default function Page() {
          return <p>Plain</p>
        }
      `,
      'app/global-not-found.tsx': `
        import localFont from 'next/font/local'
        import { shared } from './shared'
        const notFound = localFont({ src: '../fonts/font3_inter-regular.woff2' })
        export default function GlobalNotFound() {
          return (
            <html>
              <body className={shared.className}>
                <p id="global-404" className={notFound.className}>Page not found</p>
              </body>
            </html>
          )
        }
      `,
      'fonts/font1_roboto.woff2': new FileRef(
        join(fonts, 'font1_roboto.woff2')
      ),
      'fonts/font3_inter-regular.woff2': new FileRef(
        join(fonts, 'font3_inter-regular.woff2')
      ),
    },
  })

  it('preloads shared fonts and keeps 404-only fonts off ordinary routes', async () => {
    async function getPreloads(path: string) {
      const response = await next.fetch(path)
      const $ = load(await response.text())
      const htmlFonts = $('link[rel="preload"][as="font"]')
        .map((_, link) => $(link).attr('href'))
        .get()
      const headerFonts = (response.headers.get('link') ?? '')
        .split(',')
        .filter((link) => /;\s*rel="?preload"?(?:;|$)/.test(link))
        .filter((link) => /;\s*as="?font"?(?:;|$)/.test(link))
        .flatMap((link) => {
          const href = link.match(/<([^>]+)>/)?.[1]
          return href ? [href] : []
        })

      return { $, fonts: [...new Set([...htmlFonts, ...headerFonts])] }
    }

    const home = await getPreloads('/')
    const plain = await getPreloads('/plain')
    const notFound = await getPreloads('/missing')

    expect(notFound.$('#global-404').text()).toBe('Page not found')
    expect(home.fonts).toHaveLength(1)
    expect(plain.fonts).toHaveLength(0)
    expect(notFound.fonts).toHaveLength(2)
    expect(notFound.fonts).toContain(home.fonts[0])
  })
})
