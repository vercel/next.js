import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'beforeNextInit',
  {
    skipDeployment: true,
    files: __dirname,
    nextConfig: {
      beforeNextInit: () => {
        console.log('beforeNextInit')
      },
    },
  },
  ({ next, isNextDev, isNextStart }) => {
    if (isNextDev || isNextStart) {
      it('should run before the Next server is instantiated', async () => {
        // await next.start()
        await next.fetch('/') // ensure the Next server is instantiated
        expect(next.cliOutput).toContain('beforeNextInit')
      })
    }
  }
)
