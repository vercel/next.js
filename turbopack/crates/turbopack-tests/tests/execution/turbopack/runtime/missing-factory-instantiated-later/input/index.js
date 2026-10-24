const fs = require('fs')
const os = require('os')
const path = require('path')

function writeChunk(filePath, chunkModules) {
  fs.writeFileSync(filePath, `module.exports = ${chunkModules};\n`)
}

it('instantiates a module again once the factory it was missing has registered', () => {
  const repoRoot = path.resolve(process.cwd(), '../../../../../../../..')
  const runtimePath = path.join(
    repoRoot,
    'turbopack/crates/turbopack-tests/tests/snapshot/runtime/default_build_runtime/output/[turbopack]_runtime.js'
  )
  const createRuntime = eval('require')(runtimePath)

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const parent = `parent-${suffix}`
  const dependency = `dependency-${suffix}`
  const throwing = `throwing-${suffix}`
  const evaluations = `evaluations-${suffix}`
  globalThis[evaluations] = { parent: 0, throwing: 0 }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-missing-factory-'))
  try {
    const parentChunk = path.join(tempDir, 'parent.js')
    const dependencyChunk = path.join(tempDir, 'dependency.js')

    writeChunk(
      parentChunk,
      `[
        ${JSON.stringify(parent)},
        function (__turbopack_context__, module) {
          globalThis[${JSON.stringify(evaluations)}].parent++
          module.exports = "parent of " + __turbopack_context__.r(${JSON.stringify(dependency)})
        },
        ${JSON.stringify(throwing)},
        function () {
          globalThis[${JSON.stringify(evaluations)}].throwing++
          throw new Error("the module's own error")
        }
      ]`
    )
    writeChunk(
      dependencyChunk,
      `[
        ${JSON.stringify(dependency)},
        function (__turbopack_context__, module) {
          module.exports = "dependency"
        }
      ]`
    )

    const runtime = createRuntime('test-source')
    runtime.c(parentChunk)

    // Required before the chunk with its dependency has registered.
    expect(() => runtime.m(parent)).toThrow(
      `Module ${dependency} was instantiated because it was required from module ${parent}, but the module factory is not available.`
    )

    // Once that chunk registers, the module instantiates.
    runtime.c(dependencyChunk)
    expect(runtime.m(parent).exports).toBe('parent of dependency')
    expect(globalThis[evaluations].parent).toBe(2)

    // An error the module's own code throws is kept and rethrown, never
    // evaluated again.
    expect(() => runtime.m(throwing)).toThrow("the module's own error")
    expect(() => runtime.m(throwing)).toThrow("the module's own error")
    expect(globalThis[evaluations].throwing).toBe(1)
  } finally {
    delete globalThis[evaluations]
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
