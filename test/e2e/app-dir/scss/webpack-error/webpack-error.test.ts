/* eslint-env jest */

import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'
import { quote as shellQuote } from 'shell-quote'
// In order for the global isNextStart to be set
import 'e2e-utils'

describe('SCSS Support', () => {
  ;(Boolean((global as any).isNextStart) ? describe : describe.skip)(
    'production only',
    () => {
      describe('Friendly Webpack Error', () => {
        const appDir = __dirname

        const mockFile = join(appDir, 'mock.js')

        beforeAll(async () => {
          await remove(join(appDir, '.next'))
        })
        it('should be a friendly error successfully', async () => {
          const { code, stderr } = await nextBuild(appDir, [], {
            env: { NODE_OPTIONS: shellQuote([`--require`, mockFile]) },
            stderr: true,
          })
          let cleanScssErrMsg =
            '\n\n' +
            './styles/global.scss\n' +
            "To use Next.js' built-in Sass support, you first need to install `sass`.\n" +
            'Run `npm i sass` or `yarn add sass` inside your workspace.\n' +
            '\n' +
            'Learn more: https://nextjs.org/docs/messages/install-sass\n'

          // eslint-disable-next-line
          expect(code).toBe(1)
          // eslint-disable-next-line
          expect(stderr).toContain('Failed to compile.')
          // eslint-disable-next-line
          expect(stderr).toContain(cleanScssErrMsg)
          // eslint-disable-next-line
          expect(stderr).not.toContain('css-loader')
          // eslint-disable-next-line
          expect(stderr).not.toContain('sass-loader')
        })
      })
    }
  )
})
