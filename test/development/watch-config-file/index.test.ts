import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'watch-config-file',
  {
    files: {
      'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
      'next.config.js': `
        const nextConfig = {
          reactStrictMode: true,
        }
        
        module.exports = nextConfig        
        `,
    },
  },
  ({ next }) => {
    it('should output config file change', async () => {
      await check(
        async () => next.cliOutput,
        /compiled client and server successfully/
      )
      await next.patchFile(
        'next.config.js',
        `
          const nextConfig = {
            reactStrictMode: true,
            async redirects() {
                return [
                  {
                    source: '/about',
                    destination: '/',
                    permanent: true,
                  },
                ]
              },
          }
          module.exports = nextConfig`
      )

      await check(
        async () => next.cliOutput,
        /Found a change in next\.config\.js\. Restarting the server to apply the changes\.\.\./
      )

      await check(() => next.fetch('/about').then((res) => res.status), 200)
    })
  }
)
