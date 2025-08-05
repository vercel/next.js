import { nextTestSetup } from 'e2e-utils'
import fsp from 'fs/promises'
import path from 'path'

describe('500-page app-router-only', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should use app router to generate 500.html when no pages _error.tsx exists', async () => {
    const html = await fsp.readFile(
      path.join(next.testDir, '.next', 'server', 'pages', '500.html'),
      'utf8'
    )
    expect(html).toContain('app-router-global-error')
  })
})
