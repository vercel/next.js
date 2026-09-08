import { promises as fs } from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

const wasmPath =
  'node_modules/.pnpm/lightningcss-wasm@1.28.2_patch_hash=d2d6e72f68b8ae36c669d00a13784346180c35c614b37a4412d651117c518ecf/node_modules/lightningcss-wasm/lightningcss_node.wasm'

describe('outputFileTracingIncludes read glob', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  it('traces a file from the monorepo node_modules directory', async () => {
    const target = path.join(next.testDir, wasmPath)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, 'wasm')

    const { exitCode } = await next.runCommand(['build'], {
      cwd: path.join(next.testDir, 'app'),
    })
    expect(exitCode).toBe(0)

    const trace = JSON.parse(
      await next.readFile('app/.next/server/app/page.js.nft.json')
    )
    expect(trace.files).toContain(`../../../../${wasmPath}`)
  })
})
