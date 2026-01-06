import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'

describe('deploymentId function support', () => {
  let next: NextInstance | undefined

  afterEach(async () => {
    if (next) {
      await next.destroy()
      next = undefined
    }
  })

  it('should work with deploymentId as a string', async () => {
    next = await createNext({
      files: {
        'app/page.jsx': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
        'next.config.js': `
          module.exports = {
            deploymentId: 'my-static-deployment-id'
          }
        `,
      },
      dependencies: {},
    })

    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })

  it('should work with deploymentId as a function returning string', async () => {
    next = await createNext({
      files: {
        'app/page.jsx': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
        'next.config.js': `
          module.exports = {
            deploymentId: () => {
              return 'my-function-deployment-id'
            }
          }
        `,
      },
      dependencies: {},
    })

    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })

  it('should work with deploymentId function using environment variable', async () => {
    next = await createNext({
      files: {
        'app/page.jsx': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
        'next.config.js': `
          module.exports = {
            deploymentId: () => {
              return process.env.CUSTOM_DEPLOYMENT_ID || 'fallback-id'
            }
          }
        `,
      },
      env: {
        CUSTOM_DEPLOYMENT_ID: 'env-deployment-id',
      },
      dependencies: {},
    })

    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })

  it('should work with useSkewCookie and deploymentId function', async () => {
    next = await createNext({
      files: {
        'app/page.jsx': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
        'next.config.js': `
          module.exports = {
            experimental: {
              useSkewCookie: true
            },
            deploymentId: () => {
              return 'skew-cookie-deployment-id'
            }
          }
        `,
      },
      dependencies: {},
    })

    const res = await next.fetch('/')
    const setCookieHeader = res.headers.get('set-cookie')
    expect(setCookieHeader).toContain('__vdpl=skew-cookie-deployment-id')
  })

  it('should throw error when deploymentId function returns non-string', async () => {
    let errorThrown = false
    try {
      await createNext({
        files: {
          'app/page.jsx': `
            export default function Page() { 
              return <p>hello world</p>
            } 
          `,
          'next.config.js': `
            module.exports = {
              deploymentId: () => {
                return null
              }
            }
          `,
        },
        dependencies: {},
      })
    } catch (err: any) {
      errorThrown = true
      // The error is thrown in the child process, so we just verify that createNext fails
      // The actual error message "deploymentId function must return a string" is visible
      // in the console output but wrapped in "next dev exited unexpectedly"
      expect(err).toBeDefined()
      expect(err.message).toContain('exited unexpectedly')
    }
    // Ensure an error was actually thrown
    expect(errorThrown).toBe(true)
  })
})
