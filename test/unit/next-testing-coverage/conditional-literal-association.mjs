import { readExpectedCoverageFixture } from './expected-coverage-fixtures.cjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { deserialize, serialize } from 'node:v8'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, phase] = process.argv.slice(2),
  consumer = path.resolve(consumerArg),
  output = path.resolve(outputArg)
fs.mkdirSync(output, { recursive: true })
if (phase !== 'child') {
  const env = { ...process.env, CI: '1', NODE_ENV: 'development' }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), consumer, output, 'child'],
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
  assertOwnedNodeCompleted(owner, 'actual compact conditional association')
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(consumer + '/package.json'),
    fixture = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'fixtures/conditional-literal'
    ),
    facts = readExpectedCoverageFixture(
      path.join(fixture, 'facts.json'),
      (key, value) => (key === 'column' && value === null ? Infinity : value)
    ),
    source = fs.readFileSync(path.join(fixture, 'subject.mjs.txt'), 'utf8'),
    code = fs.readFileSync(path.join(fixture, 'emitted.js.txt'), 'utf8'),
    rawMap = JSON.parse(fs.readFileSync(path.join(fixture, 'source-map.json'))),
    sha = (text) => createHash('sha256').update(text).digest('hex')
  assert.equal(facts.actualCaptureComplete, true)
  assert.equal(sha(source), facts.sourceSha256)
  assert.equal(sha(code), facts.codeSha256)
  assert.equal(sha(facts.sourceMapBytes), facts.sourceMapSha256)
  assert.deepEqual(JSON.parse(facts.sourceMapBytes), rawMap)
  const { parse } = load('next/dist/compiled/acorn'),
    { SourceMapConsumer, SourceMapGenerator } = load(
      'next/dist/compiled/source-map'
    ),
    { bindConditionalOperandEnds } = load(
      'next/dist/experimental/testing/coverage/conditional-operands'
    ),
    generator = new SourceMapGenerator()
  const decoded = load(
    'next/dist/experimental/testing/coverage/maps'
  ).decodeCoverageMap(rawMap)
  decoded.mappings.forEach((mapping) => {
    const generated = {
      line: mapping.generatedLine,
      column: mapping.generatedColumn,
    }
    generator.addMapping(
      mapping.source === null
        ? { generated }
        : {
            generated,
            source: fileURLToPath(mapping.source),
            original: {
              line: mapping.originalLine,
              column: mapping.originalColumn,
            },
          }
    )
  })
  const sourceMap = JSON.parse(generator.toString()),
    clone = (value) => deserialize(serialize(value)),
    ast = (text) =>
      parse(text, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
      }),
    baseline = {
      file: facts.file,
      model: facts.model,
      observed: facts.observed,
      authored: ast(source),
      emitted: ast(code),
      sourceMap,
    },
    nodes = (tree) => {
      const result = []
      const visit = (value) => {
        if (!value || typeof value !== 'object') return
        if (Array.isArray(value)) return value.forEach(visit)
        if (value.type === 'ConditionalExpression') result.push(value)
        for (const [key, child] of Object.entries(value))
          if (!['loc', 'tokens', 'comments'].includes(key)) visit(child)
      }
      visit(tree)
      return result
    },
    original = nodes(baseline.authored)[0],
    mapped = new SourceMapConsumer(sourceMap),
    emitted = nodes(baseline.emitted).find((node) => {
      const p = mapped.originalPositionFor(node.loc.start)
      return (
        p.source === facts.file &&
        p.line === original.loc.start.line &&
        p.column === original.loc.start.column
      )
    }),
    apply = (value) =>
      bindConditionalOperandEnds(
        value.file,
        value.model,
        value.observed,
        value.authored,
        value.emitted,
        value.sourceMap
      )
  assert(emitted)
  assert.deepEqual(
    [emitted.test.name, emitted.consequent.value, emitted.alternate.value],
    ['value', 1, 2]
  )
  assert.equal(baseline.observed.branchMap[0].locations[0].end.column, 45)
  assert.equal(baseline.model.branchMap[0].locations[0].end.column, 44)
  const frozen = clone([
      baseline.model,
      baseline.authored,
      baseline.emitted,
      baseline.sourceMap,
    ]),
    positive = clone(baseline)
  let controls = 0
  apply(positive)
  assert.deepEqual(positive.observed, positive.model)
  assert.deepEqual(
    [positive.model, positive.authored, positive.emitted, positive.sourceMap],
    frozen
  )
  controls++
  const repaired = clone(positive.observed)
  apply(positive)
  assert.deepEqual(positive.observed, repaired)
  controls++
  const counters = clone(baseline)
  counters.observed.s[0] = 7
  counters.observed.f[0] = 8
  counters.observed.b[0] = [3, 5]
  const expected = clone(counters.model)
  expected.s[0] = 7
  expected.f[0] = 8
  expected.b[0] = [3, 5]
  apply(counters)
  assert.deepEqual(counters.observed, expected)
  controls++
  const same = (a, b) => a.line === b.line && a.column === b.column
  function editMap(value, edit) {
    const generator = new SourceMapGenerator()
    new SourceMapConsumer(value.sourceMap).eachMapping((m) => {
      const entry = {
        generated: { line: m.generatedLine, column: m.generatedColumn },
        ...(typeof m.originalLine !== 'number' ||
        typeof m.originalColumn !== 'number'
          ? {}
          : {
              source: m.source,
              original: { line: m.originalLine, column: m.originalColumn },
            }),
      }
      for (const item of edit(entry)) generator.addMapping(item)
    })
    value.sourceMap = JSON.parse(generator.toString())
  }
  const reject = (edit) => {
    const value = clone(baseline)
    edit(value)
    const before = clone(value.observed)
    assert.throws(() => apply(value), /conditional operand association/)
    assert.deepEqual(value.observed, before)
    controls++
  }
  for (const point of [
    emitted.loc.start,
    emitted.consequent.loc.start,
    emitted.alternate.loc.start,
  ]) {
    reject((value) =>
      editMap(value, (entry) => (same(entry.generated, point) ? [] : [entry]))
    )
    reject((value) =>
      editMap(value, (entry) => [
        same(entry.generated, point)
          ? { ...entry, source: '/foreign/subject.mjs' }
          : entry,
      ])
    )
  }
  for (const role of ['test', 'consequent', 'alternate'])
    reject((value) => {
      const n = nodes(value.emitted).find(
        (node) =>
          node.loc.start.line === emitted.loc.start.line &&
          node.loc.start.column === emitted.loc.start.column
      )
      if (role === 'test') n.test.name = 'different'
      else n[role].value = 99
    })
  reject((value) => value.authored.body.push(clone(value.authored.body[0])))
  reject((value) => value.emitted.body.push(clone(emitted)))
  reject((value) => {
    value.observed.branchMap[99] = clone(value.observed.branchMap[0])
    value.observed.b[99] = [0, 0]
  })
  reject((value) => {
    value.model.branchMap[99] = clone(value.model.branchMap[0])
    value.model.b[99] = [0, 0]
  })
  reject((value) => {
    value.model.branchMap = {}
    value.model.b = {}
  })
  const beforeKey = Object.keys(baseline.observed.meta.seen).find((key) =>
      key.startsWith('b:')
    ),
    afterKey = Object.keys(baseline.model.meta.seen).find((key) =>
      key.startsWith('b:')
    )
  reject((value) => {
    delete value.observed.meta.seen[beforeKey]
  })
  reject((value) => {
    value.observed.meta.seen[afterKey] = 99
  })
  const unsupported = clone(baseline)
  nodes(unsupported.authored)[0].test.type = 'MemberExpression'
  const untouched = clone(unsupported.observed)
  apply(unsupported)
  assert.deepEqual(unsupported.observed, untouched)
  controls++
  const unknownEnd = clone(baseline)
  unknownEnd.observed.branchMap[0].locations[0].end.column = 46
  const unknownBefore = clone(unknownEnd.observed)
  apply(unknownEnd)
  assert.deepEqual(unknownEnd.observed, unknownBefore)
  controls++
  fs.writeFileSync(
    path.join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        controls,
        actualSourceCodeMapHashesHeld: true,
        fullActualBeforeAfterModel: true,
        actualCountersPreserved: true,
        atomicRefusals: true,
        rawInputsUnchanged: true,
        idempotence: true,
        noGenericEndpointReplacement: true,
      },
      null,
      2
    ) + '\n'
  )
}
