import { nextTestSetup, FileRef } from 'e2e-utils'
import { join } from 'path'

// regression test suite for https://github.com/vercel/next.js/issues/38854
describe('Does not override tsconfig moduleResolution field during build', () => {
  const { next } = nextTestSetup({
    packageJson: { type: 'module' },
    files: {
      'tsconfig.json': new FileRef(join(__dirname, 'tsconfig.json')),
      pages: new FileRef(join(__dirname, 'pages')),
      pkg: new FileRef(join(__dirname, 'pkg')),
    },
    dependencies: {
      typescript: 'latest',
      '@types/react': 'latest',
      '@types/node': 'latest',
      pkg: './pkg',
    },
  })

  it('boots and renders without throwing an error', async () => {
    await next.render$('/')
  })
})
