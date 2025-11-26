import { nextTestSetup } from 'e2e-utils'

describe('app edge middleware', () => {
  describe('without node.js modules', () => {
    const { next } = nextTestSetup({
      files: {
        'app/page.js': `
          export default function Page() {
            return <p>hello world</p>
          }
      `,
        'app/layout.js': `
          export default function Root({ children }) { 
            return (
              <html>
                <body>
                  {children}
                </body>
              </html>
            ) 
          }
        `,
        'middleware.js': `
          import { NextResponse } from 'next/server';
          export async function middleware() { 
            return NextResponse.next() 
          }
      `,
      },
    })
    it('should not have any errors about using Node.js modules if not present in middleware', async () => {
      expect(next.cliOutput).not.toContain('node-module-in-edge-runtime')
    })
  })

  describe('with node.js modules', () => {
    const { next } = nextTestSetup({
      files: {
        'app/page.js': `
          export default function Page() {
            return <p>hello world</p>
          }
      `,
        'app/layout.js': `
          export default function Root({ children }) { 
            return (
              <html>
                <body>
                  {children}
                </body>
              </html>
            ) 
          }
        `,
        'middleware.js': `
          import { NextResponse } from 'next/server';
          import { parse } from 'url';
          export async function middleware() { 
            return NextResponse.next() 
          }
      `,
      },
    })
    it('should have errors about using Node.js modules when present in middleware', async () => {
      expect(next.cliOutput).toContain('node-module-in-edge-runtime')
    })
  })
})
