const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const ts = require('typescript')
const repo = path.resolve(__dirname, '../../..')
const packageDir = fs.realpathSync(
  process.argv[2] ?? path.join(repo, 'packages/next')
)
const target = fs.realpathSync(
  path.join(packageDir, 'experimental/testing/vitest.d.ts')
)
const taskTypes = fs.realpathSync(
  path.join(
    packageDir,
    'dist/experimental/testing/runner/public-task-types.d.ts'
  )
)
const inputs = path.join(__dirname, 'runner-task-type-records')
const expected = JSON.parse(
  fs.readFileSync(
    path.join(
      inputs,
      'genuine-' + process.versions.node.split('.')[0] + '.json'
    )
  )
)
const groups = [
  { list: 'PROGRAMS.json', exactOptionalPropertyTypes: false },
  { list: 'EXACT-PROGRAMS.json', exactOptionalPropertyTypes: true },
]
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-runner-task-types-')
)
try {
  const config = ts.readConfigFile(
    path.join(repo, 'tsconfig.json'),
    ts.sys.readFile
  )
  assert.equal(config.error, undefined)
  const rows = []
  const emittedSources = []
  let firstProgram
  for (const group of groups) {
    const names = JSON.parse(fs.readFileSync(path.join(inputs, group.list)))
    const sources = names.map((name) => {
      const source = fs.readFileSync(path.join(inputs, name + '.txt'))
      const row = expected.programs.find((row) => row.name === name)
      assert(row, 'Missing genuine type program: ' + name)
      assert.equal(
        row.exactOptionalPropertyTypes,
        group.exactOptionalPropertyTypes
      )
      assert.equal(
        createHash('sha256').update(source).digest('hex'),
        row.sourceSHA256
      )
      return source
    })
    const files = names.map((name, index) => {
      const filename = path.join(temporary, name)
      fs.writeFileSync(filename, sources[index])
      return filename
    })
    const parsed = ts.parseJsonConfigFileContent(
      {
        ...config.config,
        compilerOptions: {
          ...config.config.compilerOptions,
          strict: true,
          exactOptionalPropertyTypes: group.exactOptionalPropertyTypes,
          skipLibCheck: true,
          types: ['node'],
          typeRoots: [path.join(repo, 'node_modules/@types')],
          paths: { vitest: [target] },
        },
        files: [...files, path.join(packageDir, 'types/global.d.ts')],
        include: [],
        exclude: [],
      },
      ts.sys,
      repo
    )
    assert.deepEqual(parsed.errors, [])
    const program = ts.createProgram(parsed.fileNames, parsed.options)
    firstProgram ??= program
    const diagnostics = ts.getPreEmitDiagnostics(program)
    const foreign = diagnostics.filter(
      (diagnostic) => !files.includes(diagnostic.file?.fileName)
    )
    assert.equal(
      foreign.length,
      0,
      ts.formatDiagnostics(foreign, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => repo,
        getNewLine: () => '\n',
      })
    )
    files.forEach((file, index) => {
      const errors = diagnostics.filter(
        (diagnostic) => diagnostic.file?.fileName === file
      )
      const row = {
        name: names[index],
        sourceSHA256: createHash('sha256').update(sources[index]).digest('hex'),
        exactOptionalPropertyTypes: group.exactOptionalPropertyTypes,
        accepted: errors.length === 0,
        diagnostics: errors.map((diagnostic) => {
          const location = diagnostic.file.getLineAndCharacterOfPosition(
            diagnostic.start
          )
          return {
            code: diagnostic.code,
            category: diagnostic.category,
            line: location.line + 1,
            column: location.character + 1,
            message: ts.flattenDiagnosticMessageText(
              diagnostic.messageText,
              '\n'
            ),
          }
        }),
      }
      rows.push(row)
      if (row.accepted)
        emittedSources.push({ name: names[index], source: sources[index] })
    })
    assert(
      !program
        .getSourceFiles()
        .some((file) =>
          /node_modules\/(?:vitest|vite|tinybench|prettier|@vitest)(?:\/|$)/.test(
            file.fileName.split(path.sep).join('/')
          )
        )
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
  emittedSources.forEach(({ name, source }) => {
    const emitted = ts.transpileModule(source.toString(), {
      fileName: name,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: true,
      },
    }).outputText
    assert(
      !emitted.includes("from 'vitest'") &&
        !emitted.includes('require("vitest")'),
      'Accepted type-only programs must not import a runtime'
    )
  })
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
  fs.rmSync(temporary, { recursive: true, force: true })
}
