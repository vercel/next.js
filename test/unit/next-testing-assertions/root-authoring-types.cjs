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
const inputs = path.join(__dirname, 'fixtures/root-authoring-types')
const expected = JSON.parse(
  fs.readFileSync(path.join(inputs, 'reference.json'))
)
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-root-authoring-types-')
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
        paths: {
          vitest: [target],
          'actual-bundled': [
            path.join(next, 'dist/compiled/next-test-primitives/index.d.ts'),
          ],
        },
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
  const foreign = diagnostics.filter((d) => !files.includes(d.file?.fileName))
  assert.equal(
    foreign.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(foreign, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => repo,
      getNewLine: () => String.fromCharCode(10),
    })
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
  assert.equal(expected.programs.length, 24)
  process.stdout.write(
    JSON.stringify({
      programs: 24,
      accepted: 6,
      rejected: 18,
      rootConfigAndGlobalAugmentations: true,
      publishedFacadeTarget: true,
      transitiveSnapshotTypeIdentity: true,
      typeOnlyExports: true,
    }) + '\n'
  )
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
