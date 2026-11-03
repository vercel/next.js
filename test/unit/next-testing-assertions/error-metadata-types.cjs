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
const primitive = fs.realpathSync(
  path.join(packageDir, 'dist/compiled/next-test-primitives/index.d.ts')
)
const inputs = path.join(__dirname, 'error-metadata-type-records')
const expected = JSON.parse(
  fs.readFileSync(
    path.join(
      inputs,
      'genuine-' + process.versions.node.split('.')[0] + '.json'
    )
  )
)
const names = JSON.parse(fs.readFileSync(path.join(inputs, 'PROGRAMS.json')))
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-error-metadata-types-')
)
try {
  const sources = names.map((name) => {
    const source = fs.readFileSync(path.join(inputs, name + '.txt'))
    const reference = expected.programs.find((row) => row.name === name)
    assert(reference, 'Missing genuine type program: ' + name)
    assert.equal(
      createHash('sha256').update(source).digest('hex'),
      reference.sourceSHA256
    )
    return source
  })
  const files = names.map((name, index) => {
    const filename = path.join(temporary, name)
    fs.writeFileSync(filename, sources[index])
    return filename
  })
  const config = ts.readConfigFile(
    path.join(repo, 'tsconfig.json'),
    ts.sys.readFile
  )
  assert.equal(config.error, undefined)
  const parsed = ts.parseJsonConfigFileContent(
    {
      ...config.config,
      compilerOptions: {
        ...config.config.compilerOptions,
        strict: true,
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
  const diagnostics = ts.getPreEmitDiagnostics(program)
  const foreign = diagnostics.filter(
    (diagnostic) => !files.includes(diagnostic.file?.fileName)
  )
  assert.equal(
    foreign.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(foreign, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => repo,
      getNewLine: () => '\n',
    })
  )
  const rows = files.map((file, index) => {
    const errors = diagnostics.filter(
      (diagnostic) => diagnostic.file?.fileName === file
    )
    return {
      name: names[index],
      sourceSHA256: createHash('sha256').update(sources[index]).digest('hex'),
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
  const dependencies = program.getSourceFiles().map((file) => file.fileName)
  assert(
    !dependencies.some((filename) =>
      /node_modules\/(?:vitest|vite|prettier|tinybench|@vitest)(?:\/|$)/.test(
        filename.split(path.sep).join('/')
      )
    )
  )
  rows.forEach((row, index) => {
    if (!row.accepted) return
    const emitted = ts.transpileModule(sources[index].toString(), {
      fileName: names[index],
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
  fs.rmSync(temporary, { recursive: true, force: true })
}
