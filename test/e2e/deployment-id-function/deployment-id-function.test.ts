import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'

describe('deploymentId function support', () => {
  let next: NextInstance

  afterEach(() => next?.destroy())

  it('should work with deploymentId as a string', async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
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
        'pages/index.js': `
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
        'pages/index.js': `
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
        'pages/index.js': `
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
    await expect(
      createNext({
        files: {
          'pages/index.js': `
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
        skipStart: true,
      })
    ).rejects.toThrow('deploymentId function must return a string')
  })
})
