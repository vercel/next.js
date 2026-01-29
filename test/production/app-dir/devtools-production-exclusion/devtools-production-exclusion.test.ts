import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import globOriginal from 'glob'
import { promisify } from 'util'

const glob = promisify(globOriginal)

describe('devtools-production-exclusion', () => {
  const { next, skipped, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  // This test verifies that dev-only modules are excluded from production bundles.
  // The fix adds a NormalModuleReplacementPlugin that replaces dev-only modules
  // with empty modules in production webpack builds.
  // See: https://github.com/vercel/next.js/issues/68190
  it('should not include devtools code in production client bundles', async () => {
    // Turbopack already handles this correctly, so we only need to verify webpack
    if (isTurbopack) {
      console.log(
        'Skipping devtools exclusion test for Turbopack (not affected)'
      )
      return
    }

    // Get all client-side JavaScript chunks
    const chunksDir = join(next.testDir, '.next/static/chunks')
    const chunkFiles = await glob('**/*.js', { cwd: chunksDir })

    expect(chunkFiles.length).toBeGreaterThan(0)

    // Read all chunk contents
    let allChunkContent = ''
    for (const file of chunkFiles) {
      const content = await next.readFile(join('.next/static/chunks', file))
      allChunkContent += content
    }

    // These strings should NOT appear in production bundles
    // They are unique identifiers from dev-only modules
    const devOnlyStrings = [
      // DevTools indicator UI text
      'Restarts the development server',
      'Hide DevTools',
      // Dev overlay CSS class names
      'dev-tools-indicator',
      'devtools-indicator-menu',
      // Debug channel identifiers
      'debug-channel',
      // Hot reloader specific strings
      'waitForWebpackRuntimeHotUpdate',
    ]

    for (const devString of devOnlyStrings) {
      expect(allChunkContent).not.toContain(devString)
    }

    // Note: Some "devtools" matches are expected from React's __REACT_DEVTOOLS_GLOBAL_HOOK__
    // which is legitimate production code for React DevTools browser extension integration.
    // The important check above verifies that Next.js-specific dev-only strings are excluded.
  })

  it('should render the page correctly', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('Test Page')
  })
})
