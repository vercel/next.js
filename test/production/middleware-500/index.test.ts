import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('Middleware 500', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Home() {
            return "Home"
          }
          
          export async function getServerSideProps() {
            throw new Error("Error thrown in getServerSideProps")
          }
        `,
        'pages/500.js': `
          export default function ErrorPage() {
            return "Error page"
          }
          
          export function getStaticProps() {
            return { props: {} }
          }
        `,
        'middleware.js': `export function middleware() {}`,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).not.toContain('Error page')
    expect(html).toContain('Home')
  })
})
