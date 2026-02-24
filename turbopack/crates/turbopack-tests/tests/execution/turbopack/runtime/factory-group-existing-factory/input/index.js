const fs = require('fs')
const os = require('os')
const path = require('path')

function writeChunk(filePath, chunkModules) {
  fs.writeFileSync(filePath, `module.exports = ${chunkModules};\n`)
}

it('reuses the existing group factory for missing IDs', () => {
  const repoRoot = path.resolve(process.cwd(), '../../../../../../../..')
  const runtimePath = path.join(
    repoRoot,
    'turbopack/crates/turbopack-tests/tests/snapshot/runtime/default_build_runtime/output/[turbopack]_runtime.js'
  )
  const createRuntime = eval('require')(runtimePath)

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const moduleA = `module-a-${suffix}`
  const moduleB = `module-b-${suffix}`

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-factory-group-'))
  try {
    const firstChunk = path.join(tempDir, 'first.js')
    const mixedChunk = path.join(tempDir, 'mixed.js')

    writeChunk(
      firstChunk,
      `[
        ${JSON.stringify(moduleA)},
        function (__turbopack_context__, module) {
          module.exports = "first-factory"
        }
      ]`
    )

    writeChunk(
      mixedChunk,
      `[
        ${JSON.stringify(moduleA)},
        ${JSON.stringify(moduleB)},
        function (__turbopack_context__, module) {
          module.exports = "second-factory"
        }
      ]`
    )

    const runtime = createRuntime('test-source')
    runtime.c(firstChunk)
    runtime.c(mixedChunk)

    expect(runtime.m(moduleA).exports).toBe('first-factory')
    expect(runtime.m(moduleB).exports).toBe('first-factory')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
