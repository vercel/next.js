import { nextTestSetup } from 'e2e-utils'

describe('Dotenv default expansion', () => {
  const { next } = nextTestSetup({
    files: {
      'pages/index.js': `
        export default function Page() { 
          return <p>{process.env.NEXT_PUBLIC_TEST}</p>
        } 
      `,
      '.env': `
        NEXT_PUBLIC_TEST=\${MISSING_KEY:-default}
      `,
    },
    dependencies: {},
  })

  it('should work', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('p').text()
    expect(text).toBe('default')

    await browser.close()
  })
})
