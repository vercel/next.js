import fs from 'fs'
import path from 'path'

/** @type {import('next').NextAdapter } */
const myAdapter = {
  name: 'package-boundary-test-adapter',
  onBuildComplete: async (ctx) => {
    // Capture every page output's assets so the test can assert the distDir
    // package.json boundary marker is reachable from the page bundle's
    // function root. Without this, Node walks up to the user's
    // "type": "module" package.json and loads `.next/server/**/*.js` as ESM.
    const pageAssets = {}

    for (const output of [...ctx.outputs.pages, ...ctx.outputs.appPages]) {
      pageAssets[output.id] = Object.keys(output.assets || {}).sort()
    }

    await fs.promises.writeFile(
      path.join(ctx.distDir, 'adapter-page-assets.json'),
      JSON.stringify(pageAssets, null, 2)
    )
  },
}

export default myAdapter
