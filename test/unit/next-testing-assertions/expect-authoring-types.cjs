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
const primitiveTarget = fs.realpathSync(
  path.join(next, 'dist/compiled/next-test-primitives/index.d.ts')
)
const assertionTarget = fs.realpathSync(
  path.join(next, 'dist/experimental/testing/assertions/index.d.ts')
)
const inputs = path.join(__dirname, 'fixtures/expect-authoring-types')
const expected = JSON.parse(
  fs.readFileSync(path.join(inputs, 'reference.json'))
)
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-expect-authoring-types-')
)
const formatHost = {
  getCanonicalFileName: (f) => f,
  getCurrentDirectory: () => repo,
  getNewLine: () => '\n',
}
try {
  const config = ts.readConfigFile(
    path.join(repo, 'tsconfig.json'),
    ts.sys.readFile
  )
  assert.equal(config.error, undefined)
  let primitiveGraphChecked = false
  for (const row of expected.programs) {
    const source = fs.readFileSync(path.join(inputs, row.source))
    assert.equal(
      createHash('sha256').update(source).digest('hex'),
      row.sourceSHA256
    )
    const file = path.join(temporary, row.name)
    fs.writeFileSync(file, source)
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
        files: [file, path.join(next, 'types/global.d.ts')],
        include: [],
        exclude: [],
      },
      ts.sys,
      repo
    )
    assert.deepEqual(parsed.errors, [])
    const program = ts.createProgram(parsed.fileNames, parsed.options)
    const diagnostics = ts.getPreEmitDiagnostics(program)
    const foreign = diagnostics.filter((d) => d.file?.fileName !== file)
    assert.equal(
      foreign.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(foreign, formatHost)
    )
    const actual = diagnostics
      .filter((d) => d.file?.fileName === file)
      .map((d) => ({
        code: d.code,
        line: d.file.getLineAndCharacterOfPosition(d.start).line + 1,
      }))
    assert.deepEqual(actual, row.diagnostics, row.name)
    assert.equal(actual.length === 0, row.accepted, row.name)
    assert.deepEqual(fs.readFileSync(file), source)
    if (row.name === 'matcher-static-not-augmentation.ts') {
      const checker = program.getTypeChecker()
      const primitiveSource = program.getSourceFile(primitiveTarget)
      assert(primitiveSource)
      const moduleSymbol = checker.getSymbolAtLocation(primitiveSource)
      const exported = checker
        .getExportsOfModule(moduleSymbol)
        .find((s) => s.name === 'Matchers')
      assert(exported)
      const symbol =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported
      const declarations = symbol
        .getDeclarations()
        .map((d) => fs.realpathSync(d.getSourceFile().fileName))
      assert(
        declarations.includes(primitiveTarget),
        'actual primitive interface declaration'
      )
      assert(
        declarations.includes(assertionTarget),
        'actual emitted module augmentation'
      )
      const actualMatchers = checker.getDeclaredTypeOfSymbol(symbol)
      const authored = checker.getPropertyOfType(actualMatchers, 'toBePayload')
      assert(
        authored,
        'real compiled Matchers inherits the public facade augmentation'
      )
      assert(
        authored
          .getDeclarations()
          .some((d) => d.getSourceFile().fileName === file),
        'matcher originates in the unchanged authored program'
      )
      const actualExpect = checker
        .getExportsOfModule(moduleSymbol)
        .find((s) => s.name === 'ExpectStatic')
      assert(actualExpect)
      const expectSymbol =
        actualExpect.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(actualExpect)
          : actualExpect
      assert(
        checker.getPropertyOfType(
          checker.getDeclaredTypeOfSymbol(expectSymbol),
          'toBePayload'
        ),
        'actual primitive ExpectStatic sees the same matcher'
      )
      primitiveGraphChecked = true
    }
  }
  assert.equal(expected.programs.length, 37)
  assert(primitiveGraphChecked)
  const runtimeFacade = fs.readFileSync(
    path.join(next, 'dist/experimental/testing/vitest.js'),
    'utf8'
  )
  assert(!runtimeFacade.includes('ExpectStatic'))
  assert(!runtimeFacade.includes('ExpectPollOptions'))
  process.stdout.write(
    JSON.stringify({
      programs: 37,
      accepted: 20,
      rejected: 17,
      eachAugmentationIsolated: true,
      rootConfigAndGlobalAugmentations: true,
      publishedFacadeTarget: true,
      actualPrimitiveMatcherGraph: true,
      realUserAugmentationDeclarations: true,
      typeOnlyExports: true,
    }) + '\n'
  )
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
