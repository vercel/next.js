const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const ts = require('typescript')

const repo = path.resolve(__dirname, '../../..')
const packageDir = process.argv[2] ?? path.join(repo, 'packages/next')
const target = path.join(packageDir, 'experimental/testing/vitest.d.ts')
assert(fs.statSync(target).isFile())
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-testing-fn-types-')
)
try {
  const inputs = path.join(__dirname, 'declaration-fn-records')
  const config = ts.readConfigFile(
    path.join(repo, 'tsconfig.json'),
    ts.sys.readFile
  )
  assert.equal(config.error, undefined)
  const results = []
  for (const kind of ['positive', 'negative']) {
    const filename = path.join(temporary, `${kind}.ts`)
    const original = fs.readFileSync(
      path.join(inputs, `suite-types-${kind}.ts.txt`)
    )
    fs.writeFileSync(filename, original)
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
        files: [filename, path.join(packageDir, 'types/global.d.ts')],
        include: [],
        exclude: [],
      },
      ts.sys,
      repo
    )
    assert.deepEqual(parsed.errors, [])
    const program = ts.createProgram(parsed.fileNames, parsed.options)
    const diagnostics = ts.getPreEmitDiagnostics(program)
    assert(
      diagnostics.every((d) => d.file?.fileName === filename),
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (f) => f,
        getCurrentDirectory: () => repo,
        getNewLine: () => '\n',
      })
    )
    const actual = diagnostics.map((d) => ({
      code: d.code,
      line: d.file.getLineAndCharacterOfPosition(d.start).line + 1,
    }))
    assert.deepEqual(
      actual,
      kind === 'positive'
        ? []
        : [
            { code: 2345, line: 3 },
            { code: 2345, line: 4 },
            { code: 2322, line: 5 },
            { code: 2339, line: 6 },
            { code: 2345, line: 7 },
            { code: 2339, line: 8 },
            { code: 2339, line: 9 },
            { code: 2345, line: 10 },
          ]
    )
    assert.deepEqual(fs.readFileSync(filename), original)
    results.push({ kind, diagnostics: actual })
  }
  process.stdout.write(
    JSON.stringify({
      results,
      publicPackageTarget: 'experimental/testing/vitest.d.ts',
      rootConfigAndGlobalAugmentations: true,
    }) + '\n'
  )
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
