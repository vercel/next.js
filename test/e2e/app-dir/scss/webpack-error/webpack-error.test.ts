/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'

describe('SCSS Support', () => {
  const { next, isNextDev, isRspack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })
  // Production only test
  ;(isNextDev ? describe.skip : describe)('Friendly Webpack Error', () => {
    it('should be a friendly error successfully', async () => {
      await expect(next.start()).rejects.toThrow()
      const cliOutput = next.cliOutput

      if (isRspack) {
        expect(cliOutput.replaceAll('\\', '/')).toContain(
          `${next.testDir.replaceAll('\\', '/')}/styles/global.scss`
        )
      } else {
        expect(cliOutput).toContain('./styles/global.scss')
      }
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
    }, 240_000)
  })
})
