import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

// https://github.com/vercel/next.js/issues/15118
describe('issue-15118', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          import Link from 'next/link'
          export default function Page() { 
            return <>
              <p>hello world</p>
              <Link href="/about">
                <a id="to-about">To About</a>
              </Link>
            </>
          }
        `,
        'pages/about.js': `
          export default function AboutPage() { 
            return <p>about</p>
          }

          export async function getServerSideProps({res}) {
            // res.writeHead(302, {
            //   'Location': '/redirect-page'
            // });
            res.end('test');
            return { props: {} }
          }
        `,
        'pages/redirect.js': `
          export default function RedirectPage() { 
            return <p>redirected</p>
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  // TODO: write tests
  // it('should work', async () => {
  //   const html = await renderViaHTTP(next.url, '/')
  //   expect(html).toContain('hello world')
  // })
})
