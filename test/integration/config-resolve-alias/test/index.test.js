/* eslint-env jest */

import { join } from 'path'
import { runNextCommand } from 'next-test-utils'

// Skip in Turbopack as it does not support `config.resolve.alias` from webpack.
;(process.env.TURBOPACK ? describe.skip : describe)(
  'Invalid resolve alias',
  () => {
    it('should show relevant error when webpack resolve alias is wrong', async () => {
      const { stderr } = await runNextCommand(
        ['build', join(__dirname, '..')],
        {
          stderr: true,
        }
      )

      expect(stderr).toMatch(
        'webpack config.resolve.alias was incorrectly overridden. https://'
      )
    })
  }
)
