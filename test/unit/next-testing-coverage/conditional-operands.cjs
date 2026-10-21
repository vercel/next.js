const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const v8 = require('node:v8')
const repo = path.resolve(__dirname, '../../..')
const { parse } = require(repo + '/packages/next/dist/compiled/acorn')
const { SourceMapConsumer, SourceMapGenerator } = require(
  repo + '/packages/next/dist/compiled/source-map'
)
const { bindConditionalOperandEnds } = require(
  repo +
    '/packages/next/dist/experimental/testing/coverage/conditional-operands'
)
const clone = (value) => v8.deserialize(v8.serialize(value))
function nodes(tree) {
  const all = []
  function visit(value) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(visit)
    if (value.type) all.push(value)
    for (const [key, child] of Object.entries(value))
      if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
  }
  visit(tree)
  return all
}
const same = (a, b) => a.line === b.line && a.column === b.column
const key = (branch) =>
  'b:' +
  branch.locations
    .flatMap(({ start, end }) => [
      start.line,
      start.column,
      end.line,
      end.column,
    ])
    .map(String)
    .join(':')
function editMap(data, edit) {
  const consumer = new SourceMapConsumer(data.map),
    generator = new SourceMapGenerator()
  consumer.eachMapping((mapping) => {
    const value = {
      generated: {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      },
      ...(typeof mapping.originalLine === 'number' &&
      typeof mapping.originalColumn === 'number'
        ? {
            source: mapping.source,
            original: {
              line: mapping.originalLine,
              column: mapping.originalColumn,
            },
          }
        : {}),
    }
    for (const entry of edit(value)) generator.addMapping(entry)
  })
  data.map = JSON.parse(generator.toString())
}
let controls = 0
for (const mode of ['development', 'production']) {
  const dir = path.join(__dirname, 'fixtures/js-conditionals', mode)
  const d = {
    ...JSON.parse(fs.readFileSync(dir + '/facts.json'), (key, value) =>
      key === 'column' && value === null ? Infinity : value
    ),
    authored: parse(
      fs.readFileSync(path.join(dir, '../subject.mjs.txt'), 'utf8'),
      { ecmaVersion: 'latest', sourceType: 'module', locations: true }
    ),
    emitted: parse(fs.readFileSync(dir + '/emitted.js.txt', 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    }),
    map: JSON.parse(fs.readFileSync(dir + '/source-map.json')),
  }
  const original = nodes(d.authored).find(
    (node) => node.type === 'ConditionalExpression'
  )
  const consumer = new SourceMapConsumer(d.map)
  const emitted = nodes(d.emitted).find(
    (node) =>
      node.type === 'ConditionalExpression' &&
      same(consumer.originalPositionFor(node.loc.start), original.loc.start)
  )
  assert(emitted)
  const baseline = clone(d)
  const apply = (value) =>
    bindConditionalOperandEnds(
      value.file,
      value.model,
      value.observed,
      value.authored,
      value.emitted,
      value.map
    )
  const input = clone([d.authored, d.emitted, d.map])
  apply(d)
  assert.deepEqual(d.observed, d.model)
  assert.deepEqual(d.model, baseline.model)
  assert.deepEqual(clone([d.authored, d.emitted, d.map]), input)
  controls++
  const repaired = clone(d.observed)
  apply(d)
  assert.deepEqual(d.observed, repaired)
  controls++
  const refuse = (edit) => {
    const value = clone(baseline)
    edit(value)
    const before = clone(value.observed)
    assert.throws(() => apply(value), /conditional operand association/)
    assert.deepEqual(value.observed, before)
    controls++
  }
  const points = [
    emitted.test.loc.start,
    emitted.test.right.loc.start,
    emitted.consequent.loc.start,
    emitted.consequent.right.loc.start,
    emitted.alternate.loc.start,
  ]
  for (const point of points) {
    refuse((value) =>
      editMap(value, (entry) => (same(entry.generated, point) ? [] : [entry]))
    )
    refuse((value) =>
      editMap(value, (entry) => [
        same(entry.generated, point)
          ? { ...entry, source: 'foreign.mjs' }
          : entry,
      ])
    )
  }
  refuse((value) => {
    value.model.branchMap.extra = clone(value.model.branchMap[0])
  })
  refuse((value) => {
    value.observed.branchMap.extra = clone(value.observed.branchMap[0])
  })
  refuse((value) => {
    value.model.branchMap = {}
  })
  refuse((value) => {
    value.authored.body.push(clone(value.authored.body[0]))
  })
  refuse((value) => {
    value.emitted.body.push(
      clone(
        value.emitted.body.find((node) =>
          nodes(node).some((child) => child.type === 'ConditionalExpression')
        )
      )
    )
  })
  refuse((value) => {
    value.observed.meta.seen[key(value.observed.branchMap[0])] = 9
  })
  refuse((value) => {
    value.observed.meta.seen[key(value.model.branchMap[0])] = 9
  })
  refuse((value) => {
    nodes(value.emitted).find(
      (node) =>
        node.type === 'ConditionalExpression' &&
        same(node.loc.start, emitted.loc.start)
    ).consequent.right.value = 99
  })
  const withoutMeta = clone(baseline)
  delete withoutMeta.observed.meta
  apply(withoutMeta)
  const expected = clone(baseline.model)
  delete expected.meta
  assert.deepEqual(withoutMeta.observed, expected)
  controls++
}
console.log(JSON.stringify({ profiles: 2, controls, passed: controls }))
