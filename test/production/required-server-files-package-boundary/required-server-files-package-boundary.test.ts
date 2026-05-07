import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('required-server-files manifest - distDir package.json boundary', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // Use "type": "module" in the project package.json so the boundary file
    // is what determines whether `.next/server/**/*.js` is loaded as CJS.
    packageJson: {
      type: 'module',
    },
  })

  it('writes the distDir package.json with the commonjs boundary', async () => {
    const distPackageJson = JSON.parse(
      await next.readFile('.next/package.json')
    )
    expect(distPackageJson).toEqual({ type: 'commonjs' })
  })

  it('lists the distDir package.json in required-server-files.json', async () => {
    const manifest = JSON.parse(
      await next.readFile('.next/required-server-files.json')
    )
    // Adapters (e.g. the Vercel adapter) and the standalone build both copy
    // every entry in `requiredServerFiles.files` into their server output.
    // The distDir `package.json` boundary marker must be in this list so
    // `.next/server/**/*.js` continues to load as CJS in deployed
    // environments where the user has `"type": "module"`.
    expect(manifest.files).toContain(join('.next', 'package.json'))
  })
})
