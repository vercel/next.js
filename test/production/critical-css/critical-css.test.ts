import globOrig from 'glob'
import { promisify } from 'util'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

const glob = promisify(globOrig)

describe('CSS optimization for SSR apps', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    disableAutoSkewProtection: true,
    dependencies: {
      critters: '0.0.16',
    },
  })

  it('should have all CSS files in manifest', async () => {
    const cssFiles = (
      await glob('**/*.css', {
        cwd: join(next.testDir, '.next/static'),
      })
    ).map((file) => join('.next/static', file))

    const requiredServerFiles = await next.readJSON(
      '.next/required-server-files.json'
    )

    expect(
      requiredServerFiles.files.filter((file: string) => file.endsWith('.css'))
    ).toEqual(cssFiles)
  })

  it('should inline critical CSS', async () => {
    const html = await next.render('/')
    expect(html).toMatch(
      /<link rel="stylesheet" href="\/_next\/static\/.*\.css(\?dpl=.*)?" .*>/
    )
    expect(html).toMatch(/body{/)
  })

  it('should inline critical CSS (dynamic)', async () => {
    const html = await next.render('/another')
    expect(html).toMatch(
      /<link rel="stylesheet" href="\/_next\/static\/.*\.css(\?dpl=.*)?" .*>/
    )
    expect(html).toMatch(/body{/)
  })

  it('should not inline non-critical css', async () => {
    const html = await next.render('/')
    expect(html).not.toMatch(/.extra-style/)
  })
})
