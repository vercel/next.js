import { createNextDescribe, FileRef } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'path'

createNextDescribe(
  'next/font/google with proxy',
  {
    skipStart: true,
    files: new FileRef(join(__dirname, 'with-proxy')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
      'https-proxy-agent': '5.0.1',
    },
    skipDeployment: true,
    env: {
      https_proxy: 'https://localhost:999999',
    },
  },
  ({ next, isNextDev }) => {
    if (isNextDev) {
      it('should use a proxy agent when https_proxy is set in dev', async () => {
        await next.start()
        await next.fetch('/')
        await check(() => next.cliOutput, /fonts.googleapis.com/)
        expect(next.cliOutput).toInclude(
          'request to https://fonts.googleapis.com/css2?family=Oswald:wght@200..700&display=swap failed, reason: Port should be >= 0 and < 65536. Received 999999.'
        )
      })
    } else {
      it('should use a proxy agent when https_proxy is set in prod', async () => {
        await expect(next.start()).rejects.toThrow('next build failed')
        expect(next.cliOutput).toInclude(
          'request to https://fonts.googleapis.com/css2?family=Oswald:wght@200..700&display=swap failed, reason: Port should be >= 0 and < 65536. Received 999999.'
        )
      })
    }
  }
)
