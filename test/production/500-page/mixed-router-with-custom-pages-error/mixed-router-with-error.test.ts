import { nextTestSetup } from 'e2e-utils'
import fsp from 'fs/promises'
import path from 'path'

describe('500-page - mixed-router-with-custom-pages-error', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not override 500.html with app router global-error when pages _error.tsx exists', async () => {
    const $ = await next.render$('/pages-error')
    expect($('#__next').text()).toBe('pages-custom-error')
  })

  it('should generate 500.html with pages builtin _error', async () => {
    const html = await fsp.readFile(
      path.join(next.testDir, '.next', 'server', 'pages', '500.html'),
      'utf8'
    )
    expect(html).toContain('pages-custom-error')
  })
})
