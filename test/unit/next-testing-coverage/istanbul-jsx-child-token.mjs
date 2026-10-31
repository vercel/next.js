import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const [consumer, mutation] = process.argv.slice(2)
const load = createRequire(path.join(consumer, 'package.json'))
const { bindIstanbulTypeScriptBodyMappings } = load(
  'next/dist/experimental/testing/coverage/istanbul-typescript-body-map'
)
const { parse } = load('next/dist/compiled/babel/parser')
const { traverse } = load('next/dist/compiled/babel/core')
const { SourceMapConsumer, SourceMapGenerator } = load(
  'next/dist/compiled/source-map'
)
const { remapIstanbulCoverage } = load(
  'next/dist/compiled/next-test-instrumentation'
)
const original = JSON.parse(
  fs.readFileSync(
    new URL(
      './fixtures/istanbul-provider/jsx-child-token-pristine.json',
      import.meta.url
    )
  )
)
const canonical = (value) => {
  if (typeof value === 'string')
    return value.replaceAll('<fixture>', '/next-coverage-jsx')
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key.replaceAll('<fixture>', '/next-coverage-jsx'),
        canonical(child),
      ])
    )
  return value
}
const fixture = canonical(original),
  rawCoverage = structuredClone(fixture.rawCoverage)
const mappings = (map) => {
  const rows = []
  new SourceMapConsumer(map).eachMapping((value) => rows.push(value))
  return rows
}
if (mutation === 'missing-branch') delete rawCoverage.branchMap['1']
if (mutation === 'duplicate-branch') {
  rawCoverage.branchMap['2'] = structuredClone(rawCoverage.branchMap['1'])
  rawCoverage.b['2'] = [0, 0]
}
if (mutation === 'different-branch-location')
  rawCoverage.branchMap['1'].loc.end.column++
if (mutation === 'changed-consequent-range')
  rawCoverage.branchMap['1'].locations[0].end.column++
if (mutation === 'counter-cardinality') rawCoverage.b['1'].push(0)
if (mutation === 'conflicting-closing-role') {
  const parsed = parse(fixture.emittedSource, {
    sourceType: 'module',
    tokens: true,
  })
  let properties
  traverse(parsed, {
    ConditionalExpression(expression) {
      if (expression.node.loc.start.line === 7)
        properties = expression.parentPath.parentPath.node
    },
  })
  assert.equal(properties.type, 'ObjectExpression')
  const tokens = parsed.tokens.filter(
    (token) => token.type?.label === '}' && token.end === properties.end
  )
  assert.equal(tokens.length, 1)
  const generator = SourceMapGenerator.fromSourceMap(
    new SourceMapConsumer(rawCoverage.inputSourceMap)
  )
  generator.addMapping({
    source: fixture.file,
    generated: {
      line: tokens[0].loc.start.line,
      column: tokens[0].loc.start.column,
    },
    original: { line: 3, column: 75 },
  })
  rawCoverage.inputSourceMap = JSON.parse(generator.toString())
}
const emittedSource =
  mutation === 'changed-child-value'
    ? fixture.emittedSource.replace("'hit'", "'bad'")
    : fixture.emittedSource
if (mutation === 'changed-child-value')
  assert.notEqual(emittedSource, fixture.emittedSource)
const before = JSON.stringify(rawCoverage)
const associated = bindIstanbulTypeScriptBodyMappings({
  file: fixture.file,
  authoredSource: fixture.authoredSource,
  emittedSource,
  rawCoverage,
})
assert.equal(JSON.stringify(rawCoverage), before)
if (mutation !== 'unchanged') assert.equal(associated, undefined)
else {
  assert(associated)
  for (const mapping of mappings(rawCoverage.inputSourceMap))
    assert(
      mappings(associated.inputSourceMap).some(
        (value) => JSON.stringify(value) === JSON.stringify(mapping)
      )
    )
  assert.deepEqual(
    associated.inputSourceMap.sourcesContent,
    rawCoverage.inputSourceMap.sourcesContent
  )
  const { inputSourceMap: actualMap, ...actualCounters } = associated,
    { inputSourceMap: originalMap, ...originalCounters } = rawCoverage
  assert.deepEqual(actualCounters, originalCounters)
  const report = await remapIstanbulCoverage({ [fixture.file]: associated })
  assert.deepEqual(JSON.parse(JSON.stringify(report)), fixture.expectedReport)
}
console.log(
  JSON.stringify({
    mutation,
    passed: true,
    rawMapsCountersAndAuthoredBytesHeld: true,
  })
)
