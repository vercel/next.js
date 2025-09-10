import { nextTestSetup } from 'e2e-utils'

describe('turbopack edge runtime webpack loader', () => {
  describe('middleware with webpack loader', () => {
    const { next } = nextTestSetup({
      skipStart: true,
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
        'middleware.ts': `
          import { NextResponse } from 'next/server';
          
          export function middleware() {
            return NextResponse.next()
          }
          
          export const config = {
            matcher: '/:path*'
          }
        `,
        'minimal-loader.js': `
          module.exports = function(content) {
            return content;
          };
        `,
        'next.config.js': `
          module.exports = {
            turbopack: {
              rules: {
                '**/*.{jsx,tsx,js,ts,mjs,mts}': {
                  loaders: [{
                    loader: './minimal-loader.js',
                    options: {}
                  }]
                }
              }
            }
          }
        `,
      },
      dependencies: {},
      buildCommand: 'npm run build -- --turbopack',
      startCommand: 'npm run dev -- --turbopack',
    })
    
    it('should not error when middleware is processed with webpack loader', async () => {
      await next.start()
      
      // Check that the build/dev server starts without TP1006 errors
      expect(next.cliOutput).not.toContain('TP1006')
      expect(next.cliOutput).not.toContain('path.join')
      expect(next.cliOutput).not.toContain('is very dynamic')
      expect(next.cliOutput).not.toContain('process.cwd is not specified in the environment')
      
      // Verify middleware works correctly
      const response = await next.fetch('/')
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('hello world')
    })
  })
})