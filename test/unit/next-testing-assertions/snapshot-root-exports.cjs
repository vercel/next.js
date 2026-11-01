const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const ts = require('typescript')
const repo = path.resolve(__dirname, '../../..')
const next = process.argv[2] || path.join(repo, 'packages/next')
const target = fs.realpathSync(
  path.join(next, 'experimental/testing/vitest.d.ts')
)
const inputs = path.join(__dirname, 'fixtures/snapshot-root-exports')
const expected = JSON.parse(
  fs.readFileSync(path.join(inputs, 'reference.json'))
)
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-snapshot-root-exports-')
)
try {
  const config = ts.readConfigFile(
    path.join(repo, 'tsconfig.json'),
    ts.sys.readFile
  )
  assert.equal(config.error, undefined)
  const files = expected.programs.map((row) => {
    const source = fs.readFileSync(path.join(inputs, row.source))
    assert.equal(
      createHash('sha256').update(source).digest('hex'),
      row.sourceSHA256
    )
    const file = path.join(temporary, row.name)
    fs.writeFileSync(file, source)
    const emitted = ts.transpileModule(source.toString(), {
      fileName: row.name,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: true,
      },
    }).outputText
    assert(
      !emitted.includes("from 'vitest'") &&
        !emitted.includes('require("vitest")'),
      'Type-only imports must not load a runtime'
    )
    return file
  })
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
      files: [...files, path.join(next, 'types/global.d.ts')],
      include: [],
      exclude: [],
    },
    ts.sys,
    repo
  )
  assert.deepEqual(parsed.errors, [])
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (process.argv[3])
    fs.writeFileSync(
      process.argv[3],
      JSON.stringify(
        {
          runtime: process.version,
          typescript: ts.version,
          target,
          sourceFiles: program.getSourceFiles().map((file) => file.fileName),
          programs: files.map((file, index) => ({
            name: expected.programs[index].name,
            sourceSHA256: createHash('sha256')
              .update(fs.readFileSync(file))
              .digest('hex'),
            diagnostics: diagnostics
              .filter((d) => d.file?.fileName === file)
              .map((d) => ({
                code: d.code,
                line: d.file.getLineAndCharacterOfPosition(d.start).line + 1,
                message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
              })),
          })),
        },
        null,
        2
      ) + '\n'
    )
  const foreign = diagnostics.filter((d) => !files.includes(d.file?.fileName))
  assert.equal(
    foreign.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(foreign, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => repo,
      getNewLine: () => '\n',
    })
  )
  const foreignDependencies = program
    .getSourceFiles()
    .map((file) => file.fileName)
    .filter((file) =>
      /[\\/]node_modules[\\/](?:vitest|vite|pretty-format|@vitest)[\\/]/.test(
        file
      )
    )
  assert.deepEqual(
    foreignDependencies,
    [],
    'Published types must be independent of Vitest, Vite and formatter packages'
  )
  for (let index = 0; index < files.length; index++) {
    const file = files[index],
      row = expected.programs[index]
    const actual = diagnostics
      .filter((d) => d.file?.fileName === file)
      .map((d) => ({
        code: d.code,
        line: d.file.getLineAndCharacterOfPosition(d.start).line + 1,
      }))
    assert.deepEqual(actual, row.diagnostics, row.name)
    assert.equal(actual.length === 0, row.accepted, row.name)
    assert.deepEqual(
      fs.readFileSync(file),
      fs.readFileSync(path.join(inputs, row.source))
    )
  }
  assert.equal(expected.programs.length, 20)
  process.stdout.write(
    JSON.stringify({
      programs: 20,
      accepted: 8,
      rejected: 12,
      rootConfigAndGlobalAugmentations: true,
      publishedFacadeTarget: true,
      transitiveSnapshotTypeIdentity: true,
      serializerOverloadContracts: true,
      noVitestViteFormatterDependencies: true,
      typeOnlyImports: true,
    }) + '\n'
  )
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
