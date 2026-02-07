/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'

describe('SCSS Support', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  // Production only test
  ;(isNextDev ? describe.skip : describe)('Friendly Webpack Error', () => {
    it('should be a friendly error successfully', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)

      expect(cliOutput).toContain('./styles/global.scss')
      expect(cliOutput).toContain(
        "To use Next.js' built-in Sass support, you first need to install `sass`."
      )
      expect(cliOutput).toContain(
        'Run `npm i sass` or `yarn add sass` inside your workspace.'
      )
      expect(cliOutput).toContain(
        'Learn more: https://nextjs.org/docs/messages/install-sass'
      )

      expect(cliOutput).not.toContain('css-loader')
      expect(cliOutput).not.toContain('sass-loader')
    })
  })
})
