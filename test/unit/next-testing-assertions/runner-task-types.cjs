const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createTypeLab } = require('./type-programs.cjs')
const packageDir = fs.realpathSync(
  process.argv[2] ?? path.join(__dirname, '../../../packages/next')
)
const taskTypes = fs.realpathSync(
  path.join(
    packageDir,
    'dist/experimental/testing/runner/public-task-types.d.ts'
  )
)
const inputs = path.join(__dirname, 'runner-task-type-records')
const expected = JSON.parse(
  fs.readFileSync(path.join(inputs, 'genuine-20.json'))
)
const groups = [
  { list: 'PROGRAMS.json', exactOptionalPropertyTypes: false },
  { list: 'EXACT-PROGRAMS.json', exactOptionalPropertyTypes: true },
]
const lab = createTypeLab({ name: 'runner-task-types', inputs, packageDir })
const { ts, target } = lab
try {
  const rows = []
  const emittedSources = []
  let firstProgram
  for (const group of groups) {
    const names = JSON.parse(fs.readFileSync(path.join(inputs, group.list)))
    const { files, sources } = lab.writePrograms(
      names.map((name) => {
        const row = expected.programs.find((row) => row.name === name)
        assert(row, 'Missing genuine type program: ' + name)
        assert.equal(
          row.exactOptionalPropertyTypes,
          group.exactOptionalPropertyTypes
        )
        return { ...row, source: name + '.txt' }
      })
    )
    const { program, diagnostics } = lab.compile(files, {
      exactOptionalPropertyTypes: group.exactOptionalPropertyTypes,
    })
    firstProgram ??= program
    files.forEach((file, index) => {
      const errors = diagnostics.filter(
        (diagnostic) => diagnostic.file?.fileName === file
      )
      const row = {
        name: names[index],
        sourceSHA256: lab.digest(sources[index]),
        exactOptionalPropertyTypes: group.exactOptionalPropertyTypes,
        accepted: errors.length === 0,
        diagnostics: errors.map(lab.diagnosticRow),
      }
      rows.push(row)
      if (row.accepted)
        emittedSources.push({ name: names[index], source: sources[index] })
    })
    lab.assertNoDependencies(
      program,
      /node_modules\/(?:vitest|vite|tinybench|prettier|@vitest)(?:\/|$)/
    )
  }
  // Interface names in diagnostic text belong to their respective declaration
  // modules. Retain both raw messages and compare actual outcomes and locations.
  const typeOutcomes = (rows) =>
    rows.map(
      ({
        name,
        sourceSHA256,
        exactOptionalPropertyTypes,
        accepted,
        diagnostics,
      }) => ({
        name,
        sourceSHA256,
        exactOptionalPropertyTypes,
        accepted,
        diagnostics: diagnostics.map(({ code, category, line, column }) => ({
          code,
          category,
          line,
          column,
        })),
      })
    )
  assert.deepEqual(typeOutcomes(rows), typeOutcomes(expected.programs))
  const checker = firstProgram.getTypeChecker()
  const source = firstProgram.getSourceFile(target)
  assert(source)
  const symbol = checker.getSymbolAtLocation(source)
  assert(symbol)
  const exported = checker.getExportsOfModule(symbol)
  const symbols = [
    'RunnerTaskBase',
    'RunnerTaskResult',
    'RunnerTaskResultPack',
    'RunnerTaskEventPack',
  ].map((name) => {
    const symbol = exported.find((symbol) => symbol.name === name)
    assert(symbol, 'Missing public type export: ' + name)
    const actual =
      symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol
    assert.equal(Boolean(actual.flags & ts.SymbolFlags.Value), false)
    assert(actual.declarations?.length)
    assert(
      actual.declarations.every(
        (declaration) =>
          fs.realpathSync(declaration.getSourceFile().fileName) === taskTypes
      ),
      'Public task data types must come from the maintained Next task model'
    )
    return { name, exported: true, hasValueFlag: false }
  })
  assert.deepEqual(symbols, expected.typeOnlySymbols)
  lab.assertTypeOnlyImports(
    emittedSources.map(({ source }) => source),
    emittedSources.map(({ name }) => name),
    'Accepted type-only programs must not import a runtime'
  )
  process.stdout.write(
    JSON.stringify({
      runtime: process.version,
      rootConfigAndGlobalAugmentations: true,
      publishedFacadeTarget: true,
      actualNextTaskDataTypes: true,
      noExternalVitestViteFormatterDeclarations: true,
      typeOnlyImports: true,
      declarationOnlyTaskPacks: true,
      exactOptionalPrograms: rows.filter(
        (row) => row.exactOptionalPropertyTypes
      ).length,
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
