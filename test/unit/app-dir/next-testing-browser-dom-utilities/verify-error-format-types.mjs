import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [qualification, consumerArg, outputArg, compilerRootArg = consumerArg] =
  process.argv.slice(2)
assert(
  ['source', 'installed'].includes(qualification) && consumerArg && outputArg,
  'Usage: node verify-error-format-types.mjs <source|installed> <consumer-root> <new-evidence-dir> [existing-compiler-root]'
)
const consumer = fs.realpathSync(consumerArg),
  compilerRoot = fs.realpathSync(compilerRootArg),
  output = path.resolve(outputArg),
  directory = path.dirname(fileURLToPath(import.meta.url)),
  hash = (value) => createHash('sha256').update(value).digest('hex'),
  save = (where, name, value) =>
    fs.writeFileSync(
      path.join(where, name),
      JSON.stringify(value, null, 2) + '\n'
    ),
  require = createRequire(path.join(consumer, 'package.json')),
  compilerRequire = createRequire(path.join(compilerRoot, 'package.json')),
  compiler = compilerRequire.resolve('typescript/bin/tsc'),
  ts = compilerRequire('typescript'),
  next = path.dirname(require.resolve('next/package.json')),
  entry = path.join(next, 'experimental/testing/vitest-browser.d.ts'),
  decl = path.join(
    next,
    'dist/experimental/testing/client/browser-context.d.ts'
  ),
  expected = JSON.parse(
    fs.readFileSync(path.join(directory, 'error-format-types.reference.json'))
  ),
  base = fs.readFileSync(path.join(directory, 'error-format.consumer.mts.txt')),
  invalid = fs.readFileSync(
    path.join(directory, 'error-format.invalid.mts.txt')
  )
assert.equal(hash(base), expected.typeInput)
assert.equal(hash(invalid), expected.invalidTypeInput)
assert.equal(
  (base.toString().match(/@ts-expect-error/g) || []).length,
  expected.typeNegativeCases
)
assert(
  JSON.parse(fs.readFileSync(path.join(next, 'package.json'))).files.includes(
    'experimental/testing/vitest-browser.d.ts'
  )
)
const entryPin = hash(fs.readFileSync(entry)),
  declPin = hash(fs.readFileSync(decl))
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.mkdirSync(output)
const fixture = fs.realpathSync(
  fs.mkdtempSync(path.join(tmpdir(), 'next-browser-error-format-types-'))
)
fs.mkdirSync(path.join(fixture, 'node_modules'))
fs.symlinkSync(next, path.join(fixture, 'node_modules/next'), 'dir')
fs.writeFileSync(
  path.join(fixture, 'package.json'),
  '{"type":"module","private":true}\n'
)
fs.writeFileSync(path.join(fixture, 'consumer.mts'), base)
fs.writeFileSync(path.join(fixture, 'invalid.mts'), invalid)
const config = {
  compilerOptions: {
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    target: 'ES2022',
    lib: ['ESNext', 'DOM'],
    types: ['next/experimental/testing/vitest-browser'],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  },
  files: ['consumer.mts'],
}
save(fixture, 'tsconfig.json', config)
save(fixture, 'tsconfig.invalid.json', { ...config, files: ['invalid.mts'] })
fs.writeFileSync(path.join(output, 'consumer.mts.txt'), base)
fs.writeFileSync(path.join(output, 'invalid.mts.txt'), invalid)
save(output, 'tsconfig.json.txt', config)
save(output, 'tsconfig.invalid.json.txt', {
  ...config,
  files: ['invalid.mts'],
})
const env = { ...process.env }
for (const key of ['NODE_OPTIONS', 'NODE_PATH']) delete env[key]
const runs = []
let startedOwners = 0
let joinedOwners = 0
try {
  for (const kind of ['positive', 'negative']) {
    const evidence = path.join(output, kind)
    fs.mkdirSync(evidence)
    const args = [
      compiler,
      '--project',
      path.join(
        fixture,
        kind === 'positive' ? 'tsconfig.json' : 'tsconfig.invalid.json'
      ),
      '--pretty',
      'false',
      '--listFiles',
    ]
    startedOwners++
    const owner = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: path.join(evidence, 'owners'),
      timeoutMs: 60000,
    })
    save(evidence, 'owner.json', owner)
    fs.writeFileSync(path.join(evidence, 'stdout.log'), owner.stdout)
    fs.writeFileSync(path.join(evidence, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, 'shipped errorFormat types ' + kind)
    joinedOwners++
    assert.equal(owner.status, kind === 'positive' ? 0 : 2, owner.stdout)
    assert.equal(owner.stderr, '')
    const closure = {},
      diagnostics = []
    for (const line of owner.stdout.split('\n')) {
      if (!line) continue
      if (line.includes('error TS')) diagnostics.push(line)
      else {
        assert(path.isAbsolute(line) && fs.statSync(line).isFile(), line)
        closure[line] = hash(fs.readFileSync(line))
      }
    }
    assert.deepEqual(
      diagnostics,
      kind === 'positive' ? [] : expected.negativeDiagnostics
    )
    assert(Object.hasOwn(closure, entry))
    assert(Object.hasOwn(closure, decl))
    const transitiveVitestFiles = Object.keys(closure).filter((file) =>
      /\/node_modules\/(?:vitest\/|@vitest\/)/.test(
        fs.realpathSync(file).split(path.sep).join('/')
      )
    )
    if (qualification === 'installed')
      assert.equal(
        transitiveVitestFiles.length,
        0,
        'Installed Next declarations must not load separate Vitest declarations'
      )
    save(evidence, 'COMPILED-CLOSURE.json', closure)
    save(evidence, 'TRANSITIVE-VITEST.json', transitiveVitestFiles)
    save(evidence, 'DIAGNOSTICS.json', diagnostics)
    runs.push({
      kind,
      status: owner.status,
      diagnosticCount: diagnostics.length,
      listedClosureFiles: Object.keys(closure).length,
      separateVitestFiles: transitiveVitestFiles.length,
      installedZeroVitestQualified: qualification === 'installed',
      allOwnersJoined: true,
    })
  }
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.join(fixture, 'tsconfig.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(diagnostic) {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        )
      },
    }
  )
  assert(parsed)
  const program = ts.createProgram(parsed.fileNames, parsed.options),
    checker = program.getTypeChecker(),
    source = program.getSourceFile(path.join(fixture, 'consumer.mts')),
    symbols = []
  assert(source)
  let first
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    )
      continue
    for (const name of statement.importClause.namedBindings.elements) {
      const local = checker.getSymbolAtLocation(name.name)
      assert(local)
      const target = checker.getAliasedSymbol(local)
      first ??= target
      assert.equal(target, first)
      assert(target.flags & ts.SymbolFlags.Value)
      const declarations =
        target.declarations?.map((node) => node.getSourceFile().fileName) ?? []
      assert.deepEqual(declarations, [decl])
      let value = checker.getTypeOfSymbolAtLocation(target, name.name)
      for (const key of ['config', 'browser', 'locators', 'errorFormat']) {
        const property = checker.getPropertyOfType(value, key)
        assert(property, key)
        assert.equal(property.flags & ts.SymbolFlags.Optional, 0, key)
        value = checker.getTypeOfSymbolAtLocation(property, name.name)
      }
      assert(value.isUnion())
      const literals = value.types.map((type) => type.value)
      assert.deepEqual(literals, expected.unionLiterals)
      symbols.push({
        specifier: statement.moduleSpecifier.text,
        name: name.name.text,
        declarations,
        sameActualNextServerSymbol: target === first,
        errorFormatUnionLiterals: literals,
      })
    }
  }
  assert.deepEqual(
    symbols.map((symbol) => symbol.specifier),
    ['vitest/browser', '@vitest/browser/context']
  )
  save(output, 'SYMBOL-OWNERSHIP.json', symbols)
  assert.equal(hash(fs.readFileSync(entry)), entryPin)
  assert.equal(hash(fs.readFileSync(decl)), declPin)
  save(output, 'VERIFIED.json', {
    qualification,
    profiles: runs.length,
    runs,
    bothAliasesResolveSameActualNextServerSymbol: true,
    requiredWritableThreeLiteralUnion: true,
    negativeAssertionsConsumed: expected.typeNegativeCases,
    unsuppressedNegativeDiagnosticsExact: true,
    actualShippedAmbientEntry: true,
    actualShippedDeclaration: true,
    noPathsMapping: true,
    installedZeroVitestQualified: qualification === 'installed',
    allOwnersJoined: true,
    allFixturesRemoved: true,
    entrySHA256: entryPin,
    declarationSHA256: declPin,
  })
} finally {
  const allOwnersJoined = startedOwners > 0 && joinedOwners === startedOwners
  if (allOwnersJoined) fs.rmSync(fixture, { recursive: true, force: true })
  save(output, 'closure.json', {
    allOwnersJoined,
    fixtureAbsent: !fs.existsSync(fixture),
  })
}
