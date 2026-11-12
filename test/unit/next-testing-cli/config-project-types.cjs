const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const ts = require('typescript')
const repo = path.resolve(__dirname, '../../..')
const packageDir = fs.realpathSync(
  process.argv[2] ?? path.join(repo, 'packages/next')
)
const target = path.join(
  packageDir,
  'dist/experimental/testing/config-api.d.ts'
)
assert(fs.statSync(target).isFile())
const inputs = path.join(__dirname, 'config-project-types')
const expected = JSON.parse(
  fs.readFileSync(path.join(inputs, 'expected-diagnostics.json'), 'utf8')
)
const rootConfig = ts.readConfigFile(
  path.join(repo, 'tsconfig.json'),
  ts.sys.readFile
)
assert.equal(rootConfig.error, undefined)
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-config-project-types-')
)
const results = []
try {
  for (const kind of ['positive', 'negative']) {
    const filename = path.join(temporary, kind + '.ts')
    const original = fs.readFileSync(path.join(inputs, kind + '.ts.txt'))
    fs.writeFileSync(filename, original)
    const config = ts.parseJsonConfigFileContent(
      {
        ...rootConfig.config,
        compilerOptions: {
          ...rootConfig.config.compilerOptions,
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
          typeRoots: [path.join(repo, 'node_modules/@types')],
          paths: { 'vitest/config': [target] },
        },
        files: [filename, path.join(packageDir, 'types/global.d.ts')],
        include: [],
        exclude: [],
      },
      ts.sys,
      repo
    )
    assert.deepEqual(config.errors, [])
    const program = ts.createProgram(config.fileNames, config.options)
    assert(
      program
        .getSourceFiles()
        .some(
          (file) => fs.realpathSync(file.fileName) === fs.realpathSync(target)
        )
    )
    const diagnostics = ts.getPreEmitDiagnostics(program)
    assert(
      diagnostics.every((diagnostic) => diagnostic.file?.fileName === filename),
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => repo,
        getNewLine: () => '\n',
      })
    )
    const actual = diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      line:
        diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line +
        1,
    }))
    assert.deepEqual(actual, expected[kind])
    assert.deepEqual(fs.readFileSync(filename), original)
    results.push({ kind, diagnostics: actual })
  }
  process.stdout.write(
    JSON.stringify({
      results,
      namedTypes: 6,
      strict: true,
      rootConfigAndGlobalAugmentations: true,
      physicalPackageDeclarations: true,
    }) + '\n'
  )
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
