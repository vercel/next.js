import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'

describe('Dynamic Route Interpolation', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/blog/[slug].js': `
          import Link from "next/link"
          import { useRouter } from "next/router"

          export function getServerSideProps({ params }) {
            return { props: { slug: params.slug, now: Date.now() } }
          }

          export default function Page(props) { 
            const router = useRouter()
            return (
              <>
                <p id="slug">{props.slug}</p>
                <Link id="now" href={router.asPath}>
                  {props.now}
                </Link>
              </>
            )
          }
        `,

        'pages/api/dynamic/[slug].js': `
          export default function Page(req, res) { 
            const { slug } = req.query
            res.end('slug: ' + slug)
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/blog/a')
    const $ = cheerio.load(html)
    expect($('#slug').text()).toBe('a')
  })

  it('should work with parameter itself', async () => {
    const html = await renderViaHTTP(next.url, '/blog/[slug]')
    const $ = cheerio.load(html)
    expect($('#slug').text()).toBe('[slug]')
  })

  it('should work with brackets', async () => {
    const html = await renderViaHTTP(next.url, '/blog/[abc]')
    const $ = cheerio.load(html)
    expect($('#slug').text()).toBe('[abc]')
  })

  it('should work with parameter itself in API routes', async () => {
    const text = await renderViaHTTP(next.url, '/api/dynamic/[slug]')
    expect(text).toBe('slug: [slug]')
  })

  it('should work with brackets in API routes', async () => {
    const text = await renderViaHTTP(next.url, '/api/dynamic/[abc]')
    expect(text).toBe('slug: [abc]')
  })

  it('should bust data cache', async () => {
    const browser = await webdriver(next.url, '/blog/login')
    await browser.elementById('now').click() // fetch data once
    const text = await browser.elementById('now').text()
    await browser.elementById('now').click() // fetch data again
    await browser.waitForElementByCss(`#now:not(:text("${text}"))`)
    await browser.close()
  })

  it('should bust data cache with symbol', async () => {
    const browser = await webdriver(next.url, '/blog/@login')
    await browser.elementById('now').click() // fetch data once
    const text = await browser.elementById('now').text()
    await browser.elementById('now').click() // fetch data again
    await browser.waitForElementByCss(`#now:not(:text("${text}"))`)
    await browser.close()
  })
})
