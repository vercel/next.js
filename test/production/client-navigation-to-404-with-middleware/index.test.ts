import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import { BrowserInterface } from 'test/lib/browsers/base'

describe('Client navigation to 404 with Middleware', () => {
  let next: NextInstance
  let browser: BrowserInterface
  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/[...slug].js': `
          import Link from 'next/link'
          
          const pages = { about: { title: 'about' } }
          
          export function getStaticProps(context) {
            const slug = context.params.slug.join('/')
            const page = pages[slug]
          
            if (page) {
              return { props: { page } }
            }
          
            return { notFound: true }
          }
          
          export function getStaticPaths() {
            return { paths: [], fallback: 'blocking' }
          }
          
          export default function Page({ page }) {
            return (
              <>
                <h1>{page.title}</h1>
                <Link href="/blog">Blog</Link>
                <Link href="/about">About</Link>
              </>
            )
          }`,
        'pages/404.js': `
         export { default } from './[...slug]'

         export function getStaticProps() {
           return { props: { page: { title: '404' } } }
         }`,
        'pages/index.js': `
         export { default } from './[...slug]'

         export function getStaticProps() {
           return { props: { page: { title: 'front' } } }
         }`,
        'middleware.js': 'export async function middleware() {}',
      },
      dependencies: {},
    })
  })

  afterAll(() => Promise.all([next.destroy(), browser.close()]))

  it('should work', async () => {
    browser = await webdriver(next.url, '/')
    expect(await browser.waitForElementByCss('h1').text()).toBe('front')
    await browser.elementByCss('a[href="/about"]').click()
    expect(await browser.waitForElementByCss('h1').text()).toBe('about')
    await browser.elementByCss('a[href="/blog"]').click()
    expect(await browser.waitForElementByCss('h1').text()).toBe('404')
  })
})
