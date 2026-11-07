const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createTypeLab } = require('./type-programs.cjs')
const repo = path.resolve(__dirname, '../../..')
const packageDir = fs.realpathSync(
  process.argv[2] ?? path.join(repo, 'packages/next')
)
const target = fs.realpathSync(
  path.join(packageDir, 'experimental/testing/vitest.d.ts')
)
const primitive = fs.realpathSync(
  path.join(packageDir, 'dist/compiled/next-test-primitives/index.d.ts')
)
const inputs = path.join(__dirname, 'error-metadata-type-records')
const expected = JSON.parse(
  fs.readFileSync(path.join(inputs, 'genuine-20.json'))
)
const names = JSON.parse(fs.readFileSync(path.join(inputs, 'PROGRAMS.json')))
const lab = createTypeLab({ name: 'error-metadata-types', inputs, packageDir })
const { ts, digest } = lab
try {
  const { files, sources } = lab.writePrograms(
    names.map((name) => {
      const reference = expected.programs.find((row) => row.name === name)
      assert(reference, 'Missing genuine type program: ' + name)
      return {
        name,
        source: name + '.txt',
        sourceSHA256: reference.sourceSHA256,
      }
    })
  )
  const { program, diagnostics } = lab.compile(files)
  const rows = files.map((file, index) => {
    const errors = diagnostics.filter(
      (diagnostic) => diagnostic.file?.fileName === file
    )
    return {
      name: names[index],
      sourceSHA256: digest(sources[index]),
      accepted: errors.length === 0,
      diagnostics: errors.map(lab.diagnosticRow),
    }
  })
  assert.deepEqual(
    rows,
    expected.programs.map(({ name, sourceSHA256, accepted, diagnostics }) => ({
      name,
      sourceSHA256,
      accepted,
      diagnostics,
    }))
  )
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(target)
  assert(source)
  const symbol = checker.getSymbolAtLocation(source)
  assert(symbol)
  const exports = checker.getExportsOfModule(symbol)
  const symbols = ['ParsedStack', 'SerializedError'].map((name) => {
    const exported = exports.find((value) => value.name === name)
    assert(exported, 'Missing public type export: ' + name)
    const actual =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported
    assert.equal(Boolean(actual.flags & ts.SymbolFlags.Value), false)
    assert(actual.declarations?.length)
    assert(
      actual.declarations.every(
        (declaration) =>
          fs.realpathSync(declaration.getSourceFile().fileName) === primitive
      ),
      'Error metadata types must come from the actual bundled primitive'
    )
    return { name, exported: true, hasValueFlag: false }
  })
  assert.deepEqual(symbols, expected.typeOnlySymbols)
  lab.assertNoDependencies(
    program,
    /node_modules\/(?:vitest|vite|prettier|tinybench|@vitest)(?:\/|$)/
  )
  rows.forEach((row, index) => {
    if (!row.accepted) return
    lab.assertTypeOnlyImports(
      [sources[index]],
      [names[index]],
      'Accepted type-only programs must not import a runtime'
    )
  })
  process.stdout.write(
    JSON.stringify({
      runtime: process.version,
      rootConfigAndGlobalAugmentations: true,
      publishedFacadeTarget: true,
      actualBundledPrimitiveTypes: true,
      noExternalVitestViteFormatterDeclarations: true,
      typeOnlyImports: true,
      programs: rows.length,
      accepted: rows.filter((row) => row.accepted).length,
      rejected: rows.filter((row) => !row.accepted).length,
      symbols,
      rows,
    }) + '\n'
  )
} finally {
  lab.dispose()
}
