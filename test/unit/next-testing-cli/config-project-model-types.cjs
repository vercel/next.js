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
const inputs = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'config-project-types/model-programs.json'),
    'utf8'
  )
)
const rootConfig = ts.readConfigFile(
  path.join(repo, 'tsconfig.json'),
  ts.sys.readFile
)
assert.equal(rootConfig.error, undefined)
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-config-project-model-types-')
)
try {
  const files = inputs.map((input) => {
    const filename = path.join(temporary, input.name + '.ts')
    fs.writeFileSync(filename, input.source)
    return filename
  })
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
      files: [...files, path.join(packageDir, 'types/global.d.ts')],
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
  const outside = diagnostics.filter(
    (diagnostic) => !files.includes(diagnostic.file?.fileName)
  )
  assert.deepEqual(outside, [])
  const results = inputs.map((input, index) => {
    const selected = diagnostics.filter(
      (diagnostic) => diagnostic.file?.fileName === files[index]
    )
    const accepted = selected.length === 0
    assert.equal(
      accepted,
      input.accepted,
      input.name +
        '\n' +
        ts.formatDiagnosticsWithColorAndContext(selected, {
          getCanonicalFileName: (file) => file,
          getCurrentDirectory: () => repo,
          getNewLine: () => '\n',
        })
    )
    assert.equal(fs.readFileSync(files[index], 'utf8'), input.source)
    return { name: input.name, accepted }
  })
  process.stdout.write(
    JSON.stringify({
      programs: results.length,
      accepted: results.filter((result) => result.accepted).length,
      rejected: results.filter((result) => !result.accepted).length,
      strict: true,
      namedTypesDirectlyAnnotated: true,
      rootConfigAndGlobalAugmentations: true,
      physicalPackageDeclarations: true,
      outsideDiagnostics: outside.length,
    }) + '\n'
  )
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
