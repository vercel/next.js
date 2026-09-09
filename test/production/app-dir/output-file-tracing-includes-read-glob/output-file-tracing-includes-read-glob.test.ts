import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('outputFileTracingIncludes read glob', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'lightningcss-wasm': '1.28.2',
    },
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  it('traces a file from the monorepo node_modules directory', async () => {
    const wasmPath = require.resolve(
      'lightningcss-wasm/lightningcss_node.wasm',
      { paths: [next.testDir] }
    )

    const { exitCode } = await next.runCommand(['build'], {
      cwd: path.join(next.testDir, 'app'),
    })
    expect(exitCode).toBe(0)

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
