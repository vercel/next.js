import { nextTestSetup } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'

describe('promise export', () => {
  const { next } = nextTestSetup({
    files: {
      'pages/index.js': `
        export default function Page() { 
          return <p>hello world</p>
        } 
      `,
      'next.config.js': `
        module.exports = new Promise((resolve) => {
          resolve({
            basePath: '/docs'
          })
        })
      `,
    },
    dependencies: {},
  })

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/docs')
    expect(html).toContain('hello world')
  })
})
