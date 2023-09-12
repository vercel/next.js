export function getEsmLoaderPath() {
  let esmLoaderPath = 'next/dist/esm/server/esm-loader.mjs'

  // Since loaders don't stack Yarn PnP's loader isn't
  // applied when loading our loader so we need to move
  // it outside of the PnP cache
  // x-ref: https://github.com/yarnpkg/berry/issues/3700
  if (process.versions.pnp) {
    process.env.NEXT_YARN_PNP = '1'
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const tmpDir = path.join(
      process.env.NEXT_PRIVATE_DIR || process.cwd(),
      `.next/loader`
    )
    fs.mkdirSync(tmpDir, { recursive: true })

    for (const file of [esmLoaderPath, 'next/dist/server/import-overrides']) {
      const resolvedFile = require.resolve(file)
      const newFile = path.join(tmpDir, path.basename(file))

      fs.copyFileSync(resolvedFile, newFile)

      if (file === esmLoaderPath) {
        esmLoaderPath = newFile
      }
    }
  }
  return esmLoaderPath
}
