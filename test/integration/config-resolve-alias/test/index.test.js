/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { runNextCommand } from 'next-test-utils'

fixture('Invalid resolve alias')

test('should show relevant error when webpack resolve alias is wrong', async t => {
  const { stderr } = await runNextCommand(['build', join(__dirname, '..')], {
    stderr: true
  })

  await t
    .expect(stderr)
    .contains(
      'webpack config.resolve.alias was incorrectly overriden. https://err.sh'
    )
})
