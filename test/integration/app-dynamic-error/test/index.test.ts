import { nextBuild } from 'next-test-utils'
import { join } from 'path'

it('throws an error when prerendering a page with config dynamic error', async () => {
  const appDir = join(__dirname, '../../app-dynamic-error')
  const { stderr, code } = await nextBuild(appDir, [], {
    stderr: true,
    stdout: true,
  })
  expect(stderr).toContain('Error occurred prerendering page "/dynamic-error"')
  expect(code).toBe(1)
})
