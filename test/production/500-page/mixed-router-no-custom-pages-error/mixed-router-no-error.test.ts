import { nextTestSetup } from 'e2e-utils'
import fsp from 'fs/promises'
import path from 'path'

describe('500-page - mixed-router-no-custom-pages-error', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not use app router global-error for 500.html when no pages _error.tsx exists', async () => {
    const $ = await next.render$('/pages-error')
    const text = $('#__next').text()
    expect(text).toContain('500')
    expect(text).toContain('Internal Server Error')
  })

  it('should generate 500.html with pages builtin _error', async () => {
    const html = await fsp.readFile(
      path.join(next.testDir, '.next', 'server', 'pages', '500.html'),
      'utf8'
    )
    expect(html).toContain('500')
    expect(html).toContain('Internal Server Error')
  })
})
