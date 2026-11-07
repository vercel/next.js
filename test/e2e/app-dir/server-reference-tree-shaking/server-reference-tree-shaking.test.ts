import { nextTestSetup } from 'e2e-utils'
import { readdir } from 'fs/promises'
import { join } from 'path'

// Tree shaking is a production optimization, and deployed build artifacts
// cannot be read locally.
// Tree shaking unused server references is unsupported in Webpack.
// @force-gate start && !webpack
describe('server-reference-tree-shaking', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each(['use-server', 'use-cache'])(
    'renders the used export from the %s module',
    async (kind) => {
      const $ = await next.render$('/')
      expect($(`#${kind}`).text()).toBe(`${kind}: lightweight`)
    }
  )

  let serverOutput: string

  beforeAll(async () => {
    const serverDir = join(next.distDir, 'server')
    const files = await readdir(join(next.testDir, serverDir), {
      recursive: true,
    })
    const chunks = await Promise.all(
      files
        .filter((file) => file.endsWith('.js'))
        .map((file) => next.readFile(join(serverDir, file)))
    )
    serverOutput = chunks.join('\n')
  })

  it.each(['use-server', 'use-cache'])(
    'tree shakes dependencies of an unused export containing an inline %s function',
    (kind) => {
      // Verify that we scanned the application's output, not just runtime code.
      expect(serverOutput).toContain(`${kind}: lightweight`)
      expect(serverOutput.includes(`unused-${kind}-dependency`)).toBe(false)
    }
  )
})
