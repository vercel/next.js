const fs = require('fs')
const os = require('os')
const path = require('path')

function createIsolatedRuntime(runtimePath, sourcePath, chunkPath, moduleId) {
  const resolved = eval('require').resolve(runtimePath)
  delete eval('require').cache[resolved]
  const createRuntime = eval('require')(runtimePath)
  fs.writeFileSync(
    chunkPath,
    `module.exports = [${JSON.stringify(moduleId)}, function (context, module) { module.exports = context.R }];\n`
  )
  const runtime = createRuntime(sourcePath)
  runtime.c(chunkPath)
  return runtime.m(moduleId).exports
}

it('does not attach federation state to generic Turbopack runtimes', () => {
  const repoRoot = path.resolve(process.cwd(), '../../../../../../../..')
  const runtimePath = path.join(
    repoRoot,
    'turbopack/crates/turbopack-tests/tests/snapshot/runtime/default_build_runtime/output/[turbopack]_runtime.js'
  )
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-federation-state-'))

  try {
    const first = createIsolatedRuntime(
      runtimePath,
      'first-runtime',
      path.join(tempDir, 'first.js'),
      'first-module'
    )
    const second = createIsolatedRuntime(
      runtimePath,
      'second-runtime',
      path.join(tempDir, 'second.js'),
      'second-module'
    )

    expect(first).toBeUndefined()
    expect(second).toBeUndefined()
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
