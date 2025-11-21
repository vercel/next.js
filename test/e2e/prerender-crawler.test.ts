import { createNext } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import { NextInstance } from 'e2e-utils'

describe('Prerender crawler handling', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>index page</p>
          } 
        `,
        'pages/blog/[slug].js': `
          import {useRouter} from 'next/router'
          
          export default function Page({ slug }) { 
            const router = useRouter()
            
            if (router.isFallback) {
              return 'Loading...'
            }
            
            return (
              <>
                <p id='page'>slug page</p>
                <p id='slug'>{slug}</p>
              </>
            )
          } 
          
          export async function getStaticProps({ params }) {
            return {
              props: {
                slug: params.slug
              }
            }
          } 
          
          export async function getStaticPaths() {
            return {
              paths: ['/blog/first'],
              fallback: true
            }
          }
        `,
      },
    })
  })
  afterAll(() => next.destroy())

  it('should return prerendered page for correctly', async () => {
    const html = await renderViaHTTP(next.url, '/blog/first')
    expect(html).not.toContain('Loading...')
    expect(html).toContain('first')
    expect(html).toContain('slug page')
  })

  it('should return fallback for non-crawler correctly', async () => {
    const html = await renderViaHTTP(next.url, '/blog/test-1', undefined, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36',
      },
    })
    expect(html).toContain('Loading...')
  })

  it('should block for crawler correctly', async () => {
    const userAgents = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
      'DuckDuckBot/1.0; (+http://duckduckgo.com/duckduckbot.html)',
      'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
      'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
      'facebookexternalhit/1.0 (+http://www.facebook.com/externalhit_uatext.php)',
      'ia_archiver (+http://www.alexa.com/site/help/webmasters; crawler@alexa.com)',
    ]

    for (const userAgent of userAgents) {
      console.log('checking', { userAgent })
      const uniqueSlug = `test-${Date.now()}${Math.random()}`

      const html = await renderViaHTTP(
        next.url,
        `/blog/${uniqueSlug}`,
        undefined,
        {
          headers: {
            'user-agent': userAgent,
          },
        }
      )
      expect(html).not.toContain('Loading...')
      expect(html).toContain(uniqueSlug)
      expect(html).toContain('slug page')
    }
  })
})
