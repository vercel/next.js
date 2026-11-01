import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { gate } from 'next-test-utils'

// Runs a local build and reads its page.js.nft.json file to verify traced files.
// Deployment mode does not expose those local build artifacts.
// @force-gate !deploy
describe('outputFileTracingIncludes read glob', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'lightningcss-wasm': '1.28.2',
    },
    skipStart: true,
  })

  it('traces a file from the monorepo node_modules directory', async () => {
    const wasmPath = require.resolve(
      'lightningcss-wasm/lightningcss_node.wasm',
      { paths: [next.testDir] }
    )

    const result = await next.runCommand(['build'], {
      cwd: path.join(next.testDir, 'app'),
    })
    if (await gate((conditions) => conditions.futureCompat)) {
      expect(result).toMatchObject({ exitCode: 1 })
      expect(result.stderr).toContain(
        'DeprecationWarning: module.parent is deprecated due to accuracy issues. Please use require.main to find program entry point instead.'
      )
      expect(result.stderr).toContain("code: 'DEP0144'")
      return
    }
    expect(result).toMatchObject({ exitCode: 0 })

    const traceDirectory = path.join(next.testDir, 'app/.next/server/app')
    const toTracePath = (filePath: string) =>
      path.relative(traceDirectory, filePath).replaceAll(path.sep, '/')
    const trace = JSON.parse(
      await next.readFile('app/.next/server/app/page.js.nft.json')
    )

    expect(trace.files).toContain(toTracePath(wasmPath))
    expect(trace.files).toContain(
      toTracePath(path.join(next.testDir, 'app/include-me/file.txt'))
    )
    expect(trace.files).not.toContain(
      toTracePath(path.join(next.testDir, 'app/nested/include-me/file.txt'))
    )
  })
})
