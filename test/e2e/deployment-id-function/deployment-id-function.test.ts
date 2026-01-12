import { createNext, isNextDev } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'

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
        'app/layout.jsx': `
          export default function Layout({ children }) {
            return (
              <html>
                <body>{children}</body>
              </html>
            )
          }
        `,
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

    const res = await next.fetch('/')
    const html = await res.text()
    expect(html).toContain('hello world')
  })

  it('should work with deploymentId as a function returning string', async () => {
    next = await createNext({
      files: {
        'app/layout.jsx': `
          export default function Layout({ children }) {
            return (
              <html>
                <body>{children}</body>
              </html>
            )
          }
        `,
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

    const res = await next.fetch('/')
    const html = await res.text()
    expect(html).toContain('hello world')
  })

  it('should work with deploymentId function using environment variable', async () => {
    next = await createNext({
      files: {
        'app/layout.jsx': `
          export default function Layout({ children }) {
            return (
              <html>
                <body>{children}</body>
              </html>
            )
          }
        `,
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

    const res = await next.fetch('/')
    const html = await res.text()
    expect(html).toContain('hello world')
  })

  it('should work with useSkewCookie and deploymentId function', async () => {
    next = await createNext({
      files: {
        'app/layout.jsx': `
          export default function Layout({ children }) {
            return (
              <html>
                <body>{children}</body>
              </html>
            )
          }
        `,
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

    // In deploy mode (NEXT_DEPLOYMENT_ID set by Vercel), expect the Vercel deployment ID (starts with dpl_)
    // In prebuild mode (NEXT_DEPLOYMENT_ID not set), expect the user-configured ID
    if (setCookieHeader?.includes('__vdpl=dpl_')) {
      // Deploy mode: expect Vercel's deployment ID (format: dpl_...)
      expect(setCookieHeader).toMatch(/__vdpl=dpl_[^;]+/)
    } else {
      // Prebuild mode: expect user-configured deployment ID
      expect(setCookieHeader).toContain('__vdpl=skew-cookie-deployment-id')
    }
  })

  // Note: In dev mode, config validation errors are thrown after the server says "Ready",
  // so createNext() resolves before the error is caught. These tests only work in
  // start/deploy modes where build-time validation catches the error.
  it('should throw error when deploymentId function returns non-string', async () => {
    if (isNextDev) {
      // Skip in dev mode - validation errors occur after server starts
      return
    }

    let errorThrown = false
    let nextInstance: NextInstance | undefined
    try {
      nextInstance = await createNext({
        files: {
          'app/layout.jsx': `
            export default function Layout({ children }) {
              return (
                <html>
                  <body>{children}</body>
                </html>
              )
            }
          `,
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
      // in the console output but wrapped differently in different modes:
      // - Start mode: "next build failed with code/signal 1"
      // - Deploy mode: "Failed to deploy project"
      expect(err).toBeDefined()
      expect(
        err.message.includes('build failed') ||
          err.message.includes('Failed to deploy')
      ).toBe(true)
    } finally {
      if (nextInstance) {
        await nextInstance.destroy()
      }
    }
    // Ensure an error was actually thrown
    expect(errorThrown).toBe(true)
  })

  it('should throw error when deploymentId exceeds 32 characters', async () => {
    if (isNextDev) {
      // Skip in dev mode - validation errors occur after server starts
      return
    }

    let errorThrown = false
    let nextInstance: NextInstance | undefined
    try {
      nextInstance = await createNext({
        files: {
          'app/layout.jsx': `
            export default function Layout({ children }) {
              return (
                <html>
                  <body>{children}</body>
                </html>
              )
            }
          `,
          'app/page.jsx': `
            export default function Page() { 
              return <p>hello world</p>
            } 
          `,
          'next.config.js': `
            module.exports = {
              deploymentId: 'this-is-a-very-long-deployment-id-that-exceeds-32-characters'
            }
          `,
        },
        dependencies: {},
      })
    } catch (err: any) {
      errorThrown = true
      // The error is thrown in the child process, so we just verify that createNext fails
      // The actual error message about exceeding 32 characters is visible in the console output
      // but wrapped differently in different modes
      expect(err).toBeDefined()
      expect(
        err.message.includes('build failed') ||
          err.message.includes('Failed to deploy')
      ).toBe(true)
    } finally {
      if (nextInstance) {
        await nextInstance.destroy()
      }
    }
    // Ensure an error was actually thrown
    expect(errorThrown).toBe(true)
  })

  it('should throw error when deploymentId function returns string exceeding 32 characters', async () => {
    if (isNextDev) {
      // Skip in dev mode - validation errors occur after server starts
      return
    }

    let errorThrown = false
    let nextInstance: NextInstance | undefined
    try {
      nextInstance = await createNext({
        files: {
          'app/layout.jsx': `
            export default function Layout({ children }) {
              return (
                <html>
                  <body>{children}</body>
                </html>
              )
            }
          `,
          'app/page.jsx': `
            export default function Page() { 
              return <p>hello world</p>
            } 
          `,
          'next.config.js': `
            module.exports = {
              deploymentId: () => {
                return 'this-is-a-very-long-deployment-id-that-exceeds-32-characters'
              }
            }
          `,
        },
        dependencies: {},
      })
    } catch (err: any) {
      errorThrown = true
      // The error is thrown in the child process, so we just verify that createNext fails
      // The actual error message about exceeding 32 characters is visible in the console output
      // but wrapped differently in different modes
      expect(err).toBeDefined()
      expect(
        err.message.includes('build failed') ||
          err.message.includes('Failed to deploy')
      ).toBe(true)
    } finally {
      if (nextInstance) {
        await nextInstance.destroy()
      }
    }
    // Ensure an error was actually thrown
    expect(errorThrown).toBe(true)
  })
})
