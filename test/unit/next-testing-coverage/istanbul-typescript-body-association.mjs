import { readExpectedCoverageFixture } from './expected-coverage-fixtures.cjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { deserialize, serialize } from 'node:v8'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg, extension, phase] = process.argv.slice(2)
const consumer = path.resolve(consumerArg)
const output = path.resolve(outputArg)
fs.mkdirSync(output, { recursive: true })
if (phase !== 'child') {
  const env = { ...process.env, CI: '1', NODE_ENV: 'development' }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), consumer, output, extension, 'child'],
    {
      cwd: consumer,
      env,
      auditDir: path.join(output, 'owners'),
      timeoutMs: 30000,
    }
  )
  fs.writeFileSync(
    path.join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'Istanbul TypeScript body association')
  assert.equal(owner.status, 0, owner.stderr)
} else {
  assert(['ts', 'mts'].includes(extension))
  const load = createRequire(path.join(consumer, 'package.json'))
  const fixture = readExpectedCoverageFixture(
    new URL(
      './fixtures/istanbul-typescript-functions/' + extension + '.json',
      import.meta.url
    )
  )
  const hash = (value) => createHash('sha256').update(value).digest('hex')
  assert.equal(hash(fixture.authoredSource), fixture.authoredSha256)
  assert.equal(hash(fixture.emittedSource), fixture.emittedSha256)
  const { bindIstanbulTypeScriptBodyMappings: bind } = load(
    'next/dist/experimental/testing/coverage/istanbul-typescript-body-map'
  )
  const { SourceMapConsumer, SourceMapGenerator } = load(
    'next/dist/compiled/source-map'
  )
  const { remapIstanbulCoverage } = load(
    'next/dist/compiled/next-test-instrumentation'
  )
  const clone = (value) => deserialize(serialize(value))
  const input = {
    file: fixture.file,
    authoredSource: fixture.authoredSource,
    emittedSource: fixture.emittedSource,
    rawCoverage: fixture.rawCoverage,
  }
  const before = serialize(input)
  const associated = bind(input)
  assert(associated)
  assert.notEqual(associated, input.rawCoverage)
  assert.deepEqual(serialize(input), before)
  const { inputSourceMap: originalMap, ...originalData } = input.rawCoverage
  const { inputSourceMap: associatedMap, ...associatedData } = associated
  assert.deepEqual(associatedData, originalData)
  const mappings = (map) => {
    const result = []
    new SourceMapConsumer(map).eachMapping((mapping) => result.push(mapping))
    return result
  }
  const originalRoles = mappings(originalMap)
  const associatedRoles = mappings(associatedMap)
  assert.equal(associatedRoles.length, originalRoles.length + 2)
  for (const mapping of originalRoles)
    assert(
      associatedRoles.some(
        (candidate) => JSON.stringify(candidate) === JSON.stringify(mapping)
      )
    )
  assert.deepEqual(associatedMap.sourcesContent, originalMap.sourcesContent)
  const report = JSON.parse(
    JSON.stringify(await remapIstanbulCoverage({ [input.file]: associated }))
  )
  assert.deepEqual(Object.keys(report), [input.file])
  assert.deepEqual(report[input.file], {
    ...fixture.genuineCoverage,
    path: input.file,
  })
  assert.deepEqual(bind({ ...input, rawCoverage: associated }), associated)
  const untouched = JSON.parse(
    JSON.stringify(
      await remapIstanbulCoverage({ [input.file]: input.rawCoverage })
    )
  )
  assert.notDeepEqual(untouched[input.file], {
    ...fixture.genuineCoverage,
    path: input.file,
  })
  const refused = []
  const reject = (name, mutate) => {
    const candidate = clone(input)
    mutate(candidate)
    const snapshot = serialize(candidate)
    assert.equal(bind(candidate), undefined, name)
    assert.deepEqual(serialize(candidate), snapshot, name + ': input mutation')
    refused.push(name)
  }
  const alterMap = (candidate, update) => {
    const source = candidate.rawCoverage.inputSourceMap
    const generator = SourceMapGenerator.fromSourceMap(
      new SourceMapConsumer(source)
    )
    update(generator)
    candidate.rawCoverage.inputSourceMap = JSON.parse(generator.toString())
  }
  reject('actual source content mismatch', (value) => {
    value.authoredSource += '\n'
  })
  reject('missing actual name anchor', (value) => {
    const generator = new SourceMapGenerator()
    new SourceMapConsumer(value.rawCoverage.inputSourceMap).eachMapping(
      (mapping) => {
        if (mapping.name === value.rawCoverage.fnMap[0].name) return
        generator.addMapping({
          generated: {
            line: mapping.generatedLine,
            column: mapping.generatedColumn,
          },
          ...(mapping.source === null
            ? {}
            : {
                source: mapping.source,
                original: {
                  line: mapping.originalLine,
                  column: mapping.originalColumn,
                },
                ...(mapping.name === null ? {} : { name: mapping.name }),
              }),
        })
      }
    )
    generator.setSourceContent(value.file, value.authoredSource)
    value.rawCoverage.inputSourceMap = JSON.parse(generator.toString())
  })
  reject('conflicting exact body anchor', (value) => {
    alterMap(value, (map) =>
      map.addMapping({
        generated: value.rawCoverage.fnMap[0].loc.start,
        original: { line: 1, column: 0 },
        source: value.file,
      })
    )
  })
  reject('ambiguous actual name anchor', (value) => {
    alterMap(value, (map) =>
      map.addMapping({
        generated: value.rawCoverage.fnMap[0].decl.start,
        original: { line: 1, column: 0 },
        name: value.rawCoverage.fnMap[0].name,
        source: value.file,
      })
    )
  })
  reject('duplicate actual function role', (value) => {
    value.rawCoverage.fnMap[1] = clone(value.rawCoverage.fnMap[0])
  })
  reject('foreign later role is atomic', (value) => {
    value.rawCoverage.fnMap[1].name = 'foreign'
  })
  reject('wrong actual function body end', (value) => {
    value.rawCoverage.fnMap[0].loc.end.column++
  })
  reject('different runtime body', (value) => {
    value.emittedSource = value.emittedSource.replace('return 1', 'return 2')
  })
  reject('JavaScript has no typed role', (value) => {
    value.file = value.file.replace(/\.(?:ts|mts)$/, '.mjs')
  })
  reject('wrong coverage source', (value) => {
    value.rawCoverage.path += '.foreign'
  })
  reject('missing actual map', (value) => {
    delete value.rawCoverage.inputSourceMap
  })
  reject('unrequested map root', (value) => {
    value.rawCoverage.inputSourceMap.sourceRoot = '/foreign'
  })
  reject('extra actual map source', (value) => {
    value.rawCoverage.inputSourceMap.sources.push('/foreign')
  })
  reject('source directive is outside the bounded grammar', (value) => {
    value.authoredSource = "'use client'\n" + value.authoredSource
    value.rawCoverage.inputSourceMap.sourcesContent[0] = value.authoredSource
  })
  reject('root constant is outside the bounded grammar', (value) => {
    value.authoredSource += '\nexport const unqualified = 1\n'
    value.rawCoverage.inputSourceMap.sourcesContent[0] = value.authoredSource
  })
  reject('missing function role', (value) => {
    delete value.rawCoverage.fnMap[1]
  })
  assert.deepEqual(serialize(input), before)
  const observed = {
    extension,
    completeGenuineZeroModelEqual: true,
    unassociatedWholeModelMismatchRetained: true,
    originalMappings: originalRoles.length,
    associatedMappings: associatedRoles.length,
    rawInputAndDeclarationsAndCountersUnchanged: true,
    idempotent: true,
    refused,
    scope:
      'Pure map component only; no lowering/evaluation/effective config or typed admission claim',
  }
  fs.writeFileSync(
    path.join(output, 'OBSERVED.json'),
    JSON.stringify(observed, null, 2) + '\n'
  )
  console.log(JSON.stringify(observed))
}
