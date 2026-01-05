import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

describe('app-dir watch-config-file', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixture'),
  })

  it('should output config file change and restart server for app router', async () => {
    await retry(
      async () => {
        expect(next.cliOutput).toMatch(/ready/i)
      },
      30000,
      1000
    )

    await retry(
      async () => {
        await next.patchFile(
          'next.config.js',
          `
            console.log(${Date.now()})
            const nextConfig = {
              reactStrictMode: true,
              async redirects() {
                  return [
                    {
                      source: '/about',
                      destination: '/',
                      permanent: false,
                    },
                  ]
                },
            }
            module.exports = nextConfig`
        )
        expect(next.cliOutput).toMatch(
          /Found a change in next\.config\.js\. Restarting the server to apply the changes\.\.\./
        )
      },
      30000,
      1000
    )

    await retry(
      async () => {
        const res = await next.fetch('/about')
        expect(res.status).toBe(200)
      },
      30000,
      1000
    )
  })
})
