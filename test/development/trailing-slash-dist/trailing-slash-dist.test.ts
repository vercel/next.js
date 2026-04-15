import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('trailing-slash-dist', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('supports trailing slash in distDir', async () => {
    await next.render('/')
    const buildManifest = await next.readJSON('.next/build-manifest.json')
    const pageFiles = buildManifest.pages['/']
    expect(pageFiles).toBeDefined()
    const file = pageFiles[pageFiles.length - 1]
    expect(file).toMatch(/\.js$/)
    const res = await next.fetch(join('/_next', file))
    expect(res.status).toBe(200)
  })
})
