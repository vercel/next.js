import { nextTestSetup } from 'e2e-utils'

describe('Issue #86717: Handling %2e in Static Routes', () => {
  const { next } = nextTestSetup({
    files: {
      'app/layout.tsx': `
        export default function RootLayout({ children }) {
          return (
            <html>
              <body>{children}</body>
            </html>
          )
        }
      `,
      'app/my.folder/page.tsx': `
        export default function Page() {
          return <h1>Static Page Loaded</h1>
        }
      `,
    },
  })

  it('should work with normal dot', async () => {
    const res = await next.fetch('/my.folder')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Static Page Loaded')
  })

  it('should work with %2e in static path', async () => {
    const res = await next.fetch('/my%2efolder')

    if (res.status !== 200) {
      console.log('Test Failed with Status:', res.status)
    }

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Static Page Loaded')
  })
})
