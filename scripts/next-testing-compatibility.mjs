import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import prettier from 'prettier'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = require('vitest/package.json')
if (manifest.version !== '5.0.4')
  throw new Error('Inventory requires exactly Vitest 5.0.4.')
const referenceRoot = dirname(require.resolve('vitest/package.json'))
const options = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  skipLibCheck: true,
}
function declaration(value) {
  if (!value) return undefined
  if (typeof value === 'string')
    return value.endsWith('.d.ts') ? value : undefined
  if (value?.types) return value.types
  return declaration(value?.import)
}
const paths = Object.entries(manifest.exports).flatMap(([subpath, value]) => {
  const file = declaration(value)
  return file ? [{ subpath, file: join(referenceRoot, file) }] : []
})
const program = ts.createProgram(
  paths.map(({ file }) => file),
  options
)
const checker = program.getTypeChecker()
const implemented = new Set([
  'assert',
  'assertType',
  'expectTypeOf',
  'test',
  'it',
  'describe',
  'suite',
  'expect',
  'createExpect',
  'inject',
  'vi',
  'vitest',
  'beforeAll',
  'afterAll',
  'beforeEach',
  'afterEach',
  'onTestFinished',
  'onTestFailed',
])
const rows = []
const keys = new Set()
function add(row) {
  if (keys.has(row.api)) return
  keys.add(row.api)
  rows.push({ ...row, classification: 'Missing or unverified' })
}
function signatures(type) {
  return type
    .getCallSignatures()
    .map((signature) => checker.signatureToString(signature))
}
for (const { subpath, file } of paths) {
  const source = program.getSourceFile(file)
  const symbol = source && checker.getSymbolAtLocation(source)
  if (!source) throw new Error(`Cannot inventory Vitest ${subpath}`)
  if (!symbol) {
    add({
      api: `vitest${subpath.slice(1)}`,
      surface: 'ambient declarations',
      implemented: false,
    })
    continue
  }
  for (const exported of checker.getExportsOfModule(symbol)) {
    const resolved =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported
    const runtime = Boolean(resolved.flags & ts.SymbolFlags.Value)
    const api = `vitest${subpath === '.' ? '' : subpath.slice(1)}:${exported.name}`
    const type = checker.getTypeOfSymbolAtLocation(resolved, source)
    add({
      api,
      surface: runtime ? 'runtime export' : 'public type',
      implemented: subpath === '.' && implemented.has(exported.name),
      overloads: signatures(type),
    })
    if (
      subpath === '.' &&
      ['test', 'it', 'describe', 'suite', 'vi', 'vitest', 'expect'].includes(
        exported.name
      )
    ) {
      for (const property of type.getProperties()) {
        const member = checker.getTypeOfSymbolAtLocation(property, source)
        add({
          api: `${api}.${property.name}`,
          surface: 'authoring member',
          overloads: signatures(member),
        })
      }
    }
    if (subpath === './config' && exported.name === 'ViteUserConfig') {
      const config = checker.getDeclaredTypeOfSymbol(resolved)
      for (const property of config.getProperties()) {
        add({ api: `config.${property.name}`, surface: 'configuration' })
      }
      const test = config.getProperty('test')
      if (!test) throw new Error('Reference config has no test options.')
      const testOptions = checker.getNonNullableType(
        checker.getTypeOfSymbolAtLocation(test, source)
      )
      for (const property of testOptions.getProperties()) {
        add({
          api: `config.test.${property.name}`,
          surface: 'test configuration',
        })
        if (
          [
            'coverage',
            'browser',
            'typecheck',
            'sequence',
            'chaiConfig',
            'deps',
          ].includes(property.name)
        ) {
          const nested = checker.getNonNullableType(
            checker.getTypeOfSymbolAtLocation(property, source)
          )
          for (const member of nested.getProperties())
            add({
              api: `config.test.${property.name}.${member.name}`,
              surface: 'test configuration',
            })
        }
      }
    }
  }
}
rows.sort((a, b) => (a.api < b.api ? -1 : a.api > b.api ? 1 : 0))
const inventory = {
  version: 1,
  reference: {
    version: '5.0.4',
    revision: '6a11cf66f99fa610b7364363d5ca42b66d994f40',
    integrity:
      'sha512-z0WxZRV2Sg48wF0FSgMq3TFG8JS38/Qr96vZVZdX6+Em9raQTvnXQvdTFJe2m3rfyJnEHeHQ/snceIdi8D1pVg==',
  },
  scope:
    'Published declaration inventory. An implemented export is not full behavioral/type conformance. Overloads, modifier combinations, configuration semantics, CLI, environments and tooling remain release blockers until separately evidenced.',
  subpaths: Object.keys(manifest.exports).sort(),
  capabilities: rows,
}
const target = join(
  root,
  'packages/next/src/experimental/testing/compatibility-inventory.json'
)
const content = await prettier.format(JSON.stringify(inventory), {
  ...(await prettier.resolveConfig(target)),
  filepath: target,
})
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== content)
    throw new Error(
      'Compatibility inventory drifted. Run node scripts/next-testing-compatibility.mjs to regenerate and review the contract.'
    )
} else {
  await writeFile(target, content)
}
