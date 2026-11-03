const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript')
const repo = path.resolve(__dirname, '../../..')
const packageDir = path.resolve(
  process.argv[2] ?? path.join(repo, 'packages/next')
)
const inputs = path.join(__dirname, 'records')
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
  path.join(os.tmpdir(), 'next-benchmark-types-')
)
try {
  const files = names.map((name) => {
    const filename = path.join(temporary, name)
    const source = fs.readFileSync(path.join(inputs, name + '.txt'))
    const row = expected.programs.find((item) => item.name === name)
    assert.equal(
      crypto.createHash('sha256').update(source).digest('hex'),
      row.sourceSHA256
    )
    fs.writeFileSync(filename, source)
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
        paths: {
          vitest: [path.join(packageDir, 'experimental/testing/vitest.d.ts')],
        },
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
  const programs = files.map((file, index) => {
    const rows = diagnostics.filter(
      (diagnostic) => diagnostic.file?.fileName === file
    )
    return {
      name: names[index],
      accepted: rows.length === 0,
      diagnostics: rows.map((diagnostic) => ({
        code: diagnostic.code,
        line:
          diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line +
          1,
      })),
    }
  })
  assert.deepEqual(
    programs,
    expected.programs.map(({ name, accepted, diagnostics }) => ({
      name,
      accepted,
      diagnostics,
    }))
  )
  const dependencies = program.getSourceFiles().map((file) => file.fileName)
  assert(
    !dependencies.some((name) =>
      /node_modules\/(?:vitest|vite|tinybench|@vitest)(?:\/|$)/.test(name)
    )
  )
  process.stdout.write(
    JSON.stringify({
      runtime: process.version,
      rootConfigAndGlobalAugmentations: true,
      noExternalVitestViteTinybenchDeclarations: true,
      typeOnlyNoBenchmarkExecution: true,
      programs: programs.length,
      accepted: programs.filter((row) => row.accepted).length,
      rejected: programs.filter((row) => !row.accepted).length,
      rows: programs,
    }) + '\n'
  )
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
