import { nextBuild } from 'next-test-utils'
import path from 'path'

describe('AppType prop types', () => {
  const appDir = path.join(__dirname, 'app-type-test')

  it('should compile with correct prop types', async () => {
    const { stdout } = await nextBuild(appDir, [], {
      stdout: true,
    })
    expect(stdout).not.toContain('Failed to compile')
  })
})
