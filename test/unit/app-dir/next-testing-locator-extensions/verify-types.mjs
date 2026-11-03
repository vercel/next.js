import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg, compilerRootArg = consumerArg] =
  process.argv.slice(2)
assert(consumerArg && outputArg)
const consumer = fs.realpathSync(consumerArg),
  output = path.resolve(outputArg),
  compilerRoot = fs.realpathSync(compilerRootArg),
  directory = path.dirname(fileURLToPath(import.meta.url)),
  hash = (value) => createHash('sha256').update(value).digest('hex')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.mkdirSync(output)
const require = createRequire(path.join(consumer, 'package.json')),
  compiler = createRequire(path.join(compilerRoot, 'package.json')).resolve(
    'typescript/bin/tsc'
  ),
  next = path.dirname(require.resolve('next/package.json')),
  entry = path.join(next, 'experimental/testing/vitest-browser.d.ts'),
  base = fs.readFileSync(path.join(directory, 'consumer.mts.txt'), 'utf8'),
  expected = JSON.parse(fs.readFileSync(path.join(directory, 'reference.json')))
assert.equal(hash(base), expected.typeInput)
assert.equal((base.match(/@ts-expect-error/g) || []).length, 3)
assert(
  JSON.parse(fs.readFileSync(path.join(next, 'package.json'))).files.includes(
    'experimental/testing/vitest-browser.d.ts'
  )
)
const entryPin = hash(fs.readFileSync(entry)),
  decl = path.join(
    next,
    'dist/experimental/testing/client/browser-context.d.ts'
  ),
  declPin = hash(fs.readFileSync(decl)),
  runs = []
for (const specifier of ['vitest/browser', '@vitest/browser/context']) {
  const label =
      specifier === 'vitest/browser' ? 'vitest-browser' : 'browser-context',
    evidence = path.join(output, label)
  fs.mkdirSync(evidence)
  const fixture = fs.mkdtempSync(
    path.join(consumer, '.next-test-locator-extensions-types-')
  )
  fs.mkdirSync(path.join(fixture, 'node_modules'))
  fs.symlinkSync(next, path.join(fixture, 'node_modules/next'), 'dir')
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    '{"type":"module","private":true}\n'
  )
  const source =
    specifier === 'vitest/browser'
      ? base
      : base.replaceAll("'vitest/browser'", "'" + specifier + "'")
  fs.writeFileSync(path.join(fixture, 'consumer.mts'), source)
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
  fs.writeFileSync(
    path.join(fixture, 'tsconfig.json'),
    JSON.stringify(config, null, 2) + '\n'
  )
  fs.writeFileSync(path.join(evidence, 'consumer.mts.txt'), source)
  fs.writeFileSync(
    path.join(evidence, 'tsconfig.json.txt'),
    JSON.stringify(config, null, 2) + '\n'
  )
  const env = { ...process.env }
  for (const key of ['NODE_OPTIONS', 'NODE_PATH']) delete env[key]
  let joined = false
  try {
    const args = [
      compiler,
      '--project',
      path.join(fixture, 'tsconfig.json'),
      '--pretty',
      'false',
      '--listFiles',
    ]
    const owner = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: path.join(evidence, 'owners'),
      timeoutMs: 60000,
    })
    fs.writeFileSync(
      path.join(evidence, 'owner.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    fs.writeFileSync(path.join(evidence, 'stdout.log'), owner.stdout)
    fs.writeFileSync(path.join(evidence, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, 'shipped locator declaration ' + specifier)
    joined = true
    assert.equal(owner.status, 0, owner.stdout + '\n' + owner.stderr)
    const closure = Object.fromEntries(
      owner.stdout
        .split('\n')
        .filter(
          (line) =>
            path.isAbsolute(line) &&
            fs.existsSync(line) &&
            fs.statSync(line).isFile()
        )
        .map((file) => [file, hash(fs.readFileSync(file))])
    )
    assert(Object.hasOwn(closure, decl))
    assert(Object.hasOwn(closure, entry))
    const transitiveVitestFiles = Object.keys(closure).filter((file) =>
      /node_modules\/(?:\.pnpm\/vitest@[^/]+\/node_modules\/)?vitest\//.test(
        file
      )
    )
    const ts = createRequire(path.join(compilerRoot, 'package.json'))(
      'typescript'
    )
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
    const program = ts.createProgram(parsed.fileNames, parsed.options)
    const checker = program.getTypeChecker()
    const actualSource = program.getSourceFile(
      path.join(fixture, 'consumer.mts')
    )
    assert(actualSource)
    const symbolOwnership = []
    for (const statement of actualSource.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !statement.importClause?.namedBindings ||
        !ts.isNamedImports(statement.importClause.namedBindings)
      )
        continue
      for (const imported of statement.importClause.namedBindings.elements) {
        const symbol = checker.getSymbolAtLocation(imported.name)
        assert(symbol)
        const target =
          symbol.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(symbol)
            : symbol
        const declarations =
          target.declarations?.map(
            (declaration) => declaration.getSourceFile().fileName
          ) ?? []
        assert(
          declarations.includes(decl),
          imported.name.text + ' must come from the actual Next declaration'
        )
        assert(
          declarations.every(
            (file) =>
              file === decl || file === path.join(fixture, 'consumer.mts')
          )
        )
        const isRuntimeValue = !!(target.flags & ts.SymbolFlags.Value)
        assert.equal(
          isRuntimeValue,
          ['locators', 'page'].includes(imported.name.text)
        )
        symbolOwnership.push({
          name: imported.name.text,
          isRuntimeValue,
          declarations,
        })
      }
    }
    assert.equal(symbolOwnership.length, 6)
    fs.writeFileSync(
      path.join(evidence, 'SYMBOL-OWNERSHIP.json'),
      JSON.stringify(
        {
          symbolOwnership,
          transitiveVitestFiles,
          actualNextExportsAndConsumerAugmentationOnly: true,
        },
        null,
        2
      ) + '\n'
    )
    fs.writeFileSync(
      path.join(evidence, 'COMPILED-CLOSURE.json'),
      JSON.stringify(closure, null, 2) + '\n'
    )
    runs.push({
      specifier,
      status: owner.status,
      threeNegativeAssertionsConsumed: true,
      retainedLocatorAndFacadeAugmentation: true,
      noPathsMapping: true,
      noSeparateVitestPackageInListedClosure:
        transitiveVitestFiles.length === 0,
      actualNextSymbolOwnership: true,
      listedClosureFiles: Object.keys(closure).length,
      allOwnersJoined: true,
    })
  } finally {
    if (joined) fs.rmSync(fixture, { recursive: true, force: true })
  }
}
assert.equal(hash(fs.readFileSync(entry)), entryPin)
assert.equal(hash(fs.readFileSync(decl)), declPin)
fs.writeFileSync(
  path.join(output, 'VERIFIED.json'),
  JSON.stringify(
    {
      profiles: runs.length,
      cases: runs.length,
      runs,
      actualShippedAmbientEntry: true,
      actualShippedDeclaration: true,
      allOwnersJoined: true,
      allFixturesRemoved: true,
      entrySHA256: entryPin,
      declarationSHA256: declPin,
    },
    null,
    2
  ) + '\n'
)
