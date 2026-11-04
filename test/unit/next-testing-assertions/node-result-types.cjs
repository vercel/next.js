const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const repo = path.resolve(process.argv[5] ?? path.join(__dirname, '../../..'))
const ts = require(path.join(repo, 'node_modules/typescript'))
const packageDir = fs.realpathSync(
  process.argv[2] ?? path.join(repo, 'packages/next')
)
const referenceDir =
  process.argv[3] === '--capture-reference' && process.argv[4]
const inputs = path.join(__dirname, 'node-result-type-records')
const names = JSON.parse(fs.readFileSync(path.join(inputs, 'PROGRAMS.json')))
const symbols = [
  'TestModuleState',
  'TestResult',
  'TestResultFailed',
  'TestResultPassed',
  'TestResultPending',
  'TestResultSkipped',
  'TestState',
  'TestSuiteState',
]
const temporary = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'next-node-result-types-'))
)
const digest = (value) => createHash('sha256').update(value).digest('hex')

function diagnosticRow(diagnostic) {
  const source = diagnostic.file
  const start = diagnostic.start
  const end = start + diagnostic.length
  const position = source.getLineAndCharacterOfPosition(start)
  let span = source
  function visit(node) {
    if (node.getStart(source) <= start && node.end >= end) {
      span = node
      ts.forEachChild(node, visit)
    }
  }
  visit(source)
  return {
    code: diagnostic.code,
    category: diagnostic.category,
    start,
    length: diagnostic.length,
    line: position.line + 1,
    column: position.character + 1,
    text: source.text.slice(start, end),
    ast: {
      kind: ts.SyntaxKind[span.kind],
      start: span.getStart(source),
      end: span.end,
      text: span.getText(source),
    },
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }
}

async function run() {
  fs.mkdirSync(path.join(temporary, 'node_modules'))
  fs.symlinkSync(packageDir, path.join(temporary, 'node_modules/next'), 'dir')
  fs.symlinkSync(
    path.join(repo, 'node_modules/@types'),
    path.join(temporary, 'node_modules/@types'),
    'dir'
  )
  fs.symlinkSync(
    path.join(repo, 'node_modules/typescript'),
    path.join(temporary, 'node_modules/typescript'),
    'dir'
  )
  if (referenceDir) {
    const referencePackage = JSON.parse(
      fs.readFileSync(path.join(referenceDir, 'package.json'))
    )
    assert.equal(referencePackage.name, 'vitest')
    assert.equal(referencePackage.version, '5.0.4')
    fs.symlinkSync(
      referenceDir,
      path.join(temporary, 'node_modules/vitest'),
      'dir'
    )
  }
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"private":true}\n')
  const sources = names.map((name) =>
    fs.readFileSync(path.join(inputs, name + '.txt'))
  )
  const files = names.map((name, index) => {
    const file = path.join(temporary, name)
    fs.writeFileSync(file, sources[index])
    return file
  })
  const configPath = path.join(temporary, 'tsconfig.json')
  const configuration = {
    extends: path.join(repo, 'tsconfig.json'),
    compilerOptions: {
      strict: true,
      skipLibCheck: true,
      types: referenceDir
        ? ['node']
        : ['node', 'next/experimental/testing/vitest-global'],
    },
    files: [...files, path.join(packageDir, 'types/global.d.ts')],
    include: [],
    exclude: [],
  }
  fs.writeFileSync(configPath, JSON.stringify(configuration))
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  assert.equal(read.error, undefined)
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    temporary,
    undefined,
    configPath
  )
  assert.deepEqual(parsed.errors, [])
  // No compatibility paths or compiler host overrides: the consumer uses only
  // the published package opt-in and TypeScript's normal package resolution.
  assert.equal(parsed.options.paths?.['vitest/node'], undefined)
  assert.equal(parsed.options.paths?.vitest, undefined)
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  const foreign = diagnostics.filter(
    (item) => !files.includes(item.file?.fileName)
  )
  assert.equal(
    foreign.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(foreign, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => temporary,
      getNewLine: () => '\n',
    })
  )
  const programs = files.map((file, index) => {
    const errors = diagnostics.filter((item) => item.file?.fileName === file)
    return {
      name: names[index],
      sourceSHA256: digest(sources[index]),
      accepted: errors.length === 0,
      diagnostics: errors.map(diagnosticRow),
    }
  })
  const checker = program.getTypeChecker()
  const imported = program
    .getSourceFile(files[0])
    .statements.find(ts.isImportDeclaration)
  const moduleSymbol = checker.getSymbolAtLocation(imported.moduleSpecifier)
  assert(moduleSymbol)
  const exports = checker.getExportsOfModule(moduleSymbol)
  for (const name of symbols) {
    const exported = exports.find((item) => item.name === name)
    assert(exported, 'Missing named Node type: ' + name)
    const symbol =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported
    assert.equal(Boolean(symbol.flags & ts.SymbolFlags.Value), false, name)
  }
  const evidence = {
    version: '5.0.4',
    typescript: ts.version,
    programs,
    typeOnlySymbols: symbols,
  }
  if (referenceDir) {
    process.stdout.write(JSON.stringify(evidence, null, 2) + '\n')
    return
  }
  const expected = JSON.parse(
    fs.readFileSync(path.join(inputs, 'genuine.json'))
  )
  assert.deepEqual(evidence, expected)
  assert.deepEqual(exports.map((item) => item.name).sort(), symbols)
  const dependencies = program.getSourceFiles().map((file) => file.fileName)
  assert(
    !dependencies.some((filename) =>
      /node_modules\/(?:vitest|vite|@vitest)(?:\/|$)/.test(
        filename.split(path.sep).join('/')
      )
    )
  )
  assert(
    fs.existsSync(
      path.join(packageDir, 'experimental/testing/vitest-node.d.ts')
    )
  )
  const packed = JSON.parse(
    fs.readFileSync(path.join(packageDir, 'package.json'))
  )
  assert(packed.files.includes('experimental/testing/vitest-node.d.ts'))
  for (let index = 0; index < files.length; index++) {
    assert.deepEqual(fs.readFileSync(files[index]), sources[index])
    const emitted = ts.transpileModule(sources[index].toString(), {
      fileName: names[index],
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
      },
    }).outputText
    assert(
      !emitted.includes('vitest'),
      'Type imports must not produce runtime aliases'
    )
  }

  // The normal typecheck worker owns its own aliases. Remove the editor opt-in
  // so this second consumer cannot accidentally rely on ambient declarations.
  configuration.compilerOptions.types = ['node']
  fs.writeFileSync(configPath, JSON.stringify(configuration))
  const { normalizeTestConfig } = require(
    path.join(packageDir, 'dist/experimental/testing/config')
  )
  const { discoverTests } = require(
    path.join(packageDir, 'dist/experimental/testing/discovery')
  )
  const { runTypecheckProject } = require(
    path.join(packageDir, 'dist/experimental/testing/typecheck')
  )
  const config = normalizeTestConfig({
    test: {
      watch: false,
      fileTimeout: 30000,
      typecheck: {
        enabled: true,
        only: true,
        include: ['*.ts'],
        tsconfig: './tsconfig.json',
      },
    },
  })
  const projects = await discoverTests(temporary, config)
  assert.equal(projects.length, 1)
  assert.equal(projects[0].entries.length, names.length)
  const result = await runTypecheckProject(temporary, projects[0], {
    signal: new AbortController().signal,
  })
  assert.deepEqual(result.sourceErrors, [])
  for (const row of expected.programs) {
    const entry = projects[0].entries.find(
      (item) => path.basename(item.file) === row.name
    )
    assert(entry)
    const file = result.files.find((item) => item.entryId === entry.id)
    assert(file)
    assert.equal(file.revision, row.sourceSHA256)
    assert.equal(file.status, row.accepted ? 'passed' : 'failed', row.name)
    assert.deepEqual(
      file.errors.map((error) => ({
        message: error.message,
        line: error.location.line,
        column: error.location.column,
      })),
      row.diagnostics.map(({ message, line, column }) => ({
        message,
        line,
        column,
      })),
      row.name
    )
    assert.equal(file.cases.length, 1)
    assert.equal(file.cases[0].status, 'passed')
  }
  process.stdout.write(
    JSON.stringify({
      programs: programs.length,
      accepted: programs.filter((row) => row.accepted).length,
      rejected: programs.filter((row) => !row.accepted).length,
      namedTypeOnlyExports: symbols.length,
      exactDiagnosticsAndAstSpans: true,
      rootConfigAndGlobalAugmentations: true,
      publishedOptInWithoutPaths: true,
      normalTypecheckWorkerWithoutOptIn: true,
      noExternalVitestViteDeclarations: true,
    }) + '\n'
  )
}
run()
  .catch((error) => {
    process.stderr.write(error.stack + '\n')
    process.exitCode = 1
  })
  .finally(() => fs.rmSync(temporary, { recursive: true, force: true }))
