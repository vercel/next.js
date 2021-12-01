import { createNext } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('TypeScript basic', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.tsx': `
          import { useRouter } from 'next/router'
          import Link from 'next/link' 
          
          export default function Page() { 
            const router = useRouter()
            return (
              <>
                <p>hello world</p>
                <Link href='/another'>
                  <a>to /another</a>
                </Link>
              </>
            )
          } 
        `,
      },
      dependencies: {
        typescript: '4.4.3',
        '@types/react': '16.9.17',
      },
    })
  })
  afterAll(() => next.destroy())

  it('have built and started correctly', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })
})
