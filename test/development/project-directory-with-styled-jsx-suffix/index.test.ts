import { nextTestSetup } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'

describe('project directory with styled-jsx suffix', () => {
  const { next } = nextTestSetup({
    files: {
      'pages/index.js': `
        export default function Page() { 
          return <p>hello world</p>
        } 
      `,
    },
    subDir: 'test-styled-jsx',
  })

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })
})
