const fs = require('fs')
const os = require('os')
const path = require('path')

// Every runtime frame between an import and the imported module's evaluation is
// repeated once per level of an import chain, so the size of that path limits
// how deep a chain can get before the stack overflows. With trivial modules on
// Node's default stack, the Node.js dev runtime handles chains about 1400-1500
// deep. Before its instantiation path was flattened it overflowed at about 800.
const CHAIN_DEPTH = 1000

// Each module imports the next one with `op` and exports how many modules are
// below it, including itself.
function writeChain(filePath, ids, op) {
  const factories = ids.map((id, i) => {
    const body =
      i + 1 < ids.length
        ? `module.exports = { depth: __turbopack_context__.${op}(${JSON.stringify(ids[i + 1])}).depth + 1 }`
        : `module.exports = { depth: 1 }`
    return `${JSON.stringify(id)}, ((__turbopack_context__, module) => { ${body} })`
  })
  fs.writeFileSync(
    filePath,
    `module.exports = [\n${factories.join(',\n')}\n];\n`
  )
}

describe('deep import chain', () => {
  const repoRoot = path.resolve(process.cwd(), '../../../../../../../..')
  const runtimePath = path.join(
    repoRoot,
    'turbopack/crates/turbopack-tests/tests/snapshot/runtime/default_dev_nodejs_runtime/output/[turbopack]_runtime.js'
  )

  for (const [name, op] of [
    ['import', 'i'],
    ['require', 'r'],
  ]) {
    it(`evaluates a ${CHAIN_DEPTH} module ${name} chain in the dev runtime`, () => {
      const createRuntime = eval('require')(runtimePath)
      const suffix = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const ids = Array.from(
        { length: CHAIN_DEPTH },
        (_, i) => `chain-${suffix}-${i}`
      )

      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'tp-deep-import-chain-')
      )
      try {
        const chunk = path.join(tempDir, `${name}.js`)
        writeChain(chunk, ids, op)

        const runtime = createRuntime('test-source')
        runtime.c(chunk)

        expect(runtime.m(ids[0]).exports.depth).toBe(CHAIN_DEPTH)
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })
  }
})
