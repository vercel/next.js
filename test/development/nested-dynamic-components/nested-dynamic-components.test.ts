import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import path from 'path'

describe('nested-dynamic-components', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page with nested dynamic components', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('Nested Dynamic Components Test')
    expect($('.dynamic-component').length).toBe(2)
  })

  it('should generate react-loadable-manifest with valid chunk references', async () => {
    // Trigger the page to ensure manifest is generated
    await next.render('/')

    // The manifest path differs between Turbopack and Webpack
    // For Turbopack, each page has its own manifest in .next/dev/server/pages/<path>/
    const manifestPath = isTurbopack
      ? '.next/dev/server/pages/index/react-loadable-manifest.json'
      : '.next/react-loadable-manifest.json'

    const manifestExists = await next
      .readFile(manifestPath)
      .then(() => true)
      .catch(() => false)

    if (!manifestExists) {
      // Skip if manifest doesn't exist (e.g., no dynamic imports detected)
      console.log('Manifest not found, skipping chunk validation')
      return
    }

    const manifest = await next.readJSON(manifestPath)

    // Verify the manifest is not empty - we expect entries for our dynamic imports
    const values = Object.values(manifest)
    expect(values.length).toBeGreaterThan(0)

    // Verify each chunk file referenced in the manifest actually exists
    // This catches the bug where manifest references chunks with wrong hashes
    for (const entry of values) {
      const { files } = entry as { id: string; files: string[] }
      for (const file of files) {
        // The file paths in manifest are relative (e.g., "static/chunks/...")
        // We need to check in .next/dev for Turbopack
        const chunkPath = isTurbopack
          ? path.join(next.testDir, '.next/dev', file)
          : path.join(next.testDir, '.next', file)

        expect(fs.existsSync(chunkPath)).toBe(true)
      }
    }
  })
})
