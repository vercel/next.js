import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'

describe('Dynamic Route Interpolation', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/blog/[slug].js': `
          export function getServerSideProps({ params }) {
            return { props: { slug: params.slug } }
          }

          export default function Page(props) { 
            return <p id="slug">{props.slug}</p>
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
})
