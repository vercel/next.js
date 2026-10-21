const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const v8 = require('node:v8')
const repo = path.resolve(__dirname, '../../..')
const { parse } = require(repo + '/packages/next/dist/compiled/acorn')
const { SourceMapConsumer, SourceMapGenerator } = require(
  repo + '/packages/next/dist/compiled/source-map'
)
const { bindIfReturnEnds } = require(
  repo +
    '/packages/next/dist/experimental/testing/coverage/if-return-boundaries'
)
const clone = (x) => v8.deserialize(v8.serialize(x))
let controls = 0
function nodes(value) {
  const all = []
  function visit(x) {
    if (!x || typeof x !== 'object') return
    if (Array.isArray(x)) return x.forEach(visit)
    if (x.type) all.push(x)
    for (const [key, child] of Object.entries(x))
      if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
  }
  visit(value)
  return all
}
const same = (a, b) => a.line === b.line && a.column === b.column
const branchKey = (branch) =>
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
function editMap(d, edit) {
  const original = new SourceMapConsumer(d.map),
    map = new SourceMapGenerator()
  original.eachMapping((m) => {
    const entries = edit({
      generated: { line: m.generatedLine, column: m.generatedColumn },
      ...(typeof m.originalLine !== 'number' ||
      typeof m.originalColumn !== 'number'
        ? {}
        : {
            source: m.source,
            original: { line: m.originalLine, column: m.originalColumn },
          }),
    })
    for (const entry of entries) map.addMapping(entry)
  })
  d.map = JSON.parse(map.toString())
}
for (const mode of ['development', 'production']) {
  const dir = path.join(__dirname, 'fixtures/lcovonly/if-return', mode)
  const facts = JSON.parse(
    fs.readFileSync(dir + '/facts.json'),
    (key, value) => (key === 'column' && value === null ? Infinity : value)
  )
  const d = {
    ...facts,
    authored: parse(fs.readFileSync(dir + '/authored.js.txt', 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    }),
    emitted: parse(fs.readFileSync(dir + '/emitted.js.txt', 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    }),
    map: JSON.parse(fs.readFileSync(dir + '/source-map.json')),
  }
  const authored = nodes(d.authored).find((n) => n.type === 'IfStatement')
  const consumer = new SourceMapConsumer(d.map)
  const emitted = nodes(d.emitted).find(
    (n) =>
      n.type === 'IfStatement' &&
      same(consumer.originalPositionFor(n.loc.start), authored.loc.start)
  )
  assert(emitted)
  const block = nodes(d.emitted).find(
    (n) => n.type === 'BlockStatement' && n.body.includes(emitted)
  )
  const next = block.body[block.body.indexOf(emitted) + 1]
  const apply = (x) =>
    bindIfReturnEnds(x.file, x.model, x.observed, x.authored, x.emitted, x.map)
  const inputsBefore = clone([d.authored, d.emitted, d.map])
  const before = clone(d),
    expected = clone(d.observed),
    oldKey = branchKey(expected.branchMap[0]),
    newKey = branchKey(d.model.branchMap[0])
  expected.branchMap[0].loc.end = { ...authored.loc.end }
  expected.branchMap[0].locations[0].end = { ...authored.loc.end }
  delete expected.meta.seen[oldKey]
  expected.meta.seen[newKey] = 0
  apply(d)
  assert.deepEqual(d.observed, expected)
  assert.deepEqual(d.model, before.model)
  assert.deepEqual(clone([d.authored, d.emitted, d.map]), inputsBefore)
  controls++
  for (const target of ['both', 'observed']) {
    const data = clone(before)
    for (const report of target === 'both'
      ? [data.model, data.observed]
      : [data.observed])
      report.branchMap[0].locations[1] = {
        start: { line: undefined, column: undefined },
        end: { line: undefined, column: undefined },
      }
    const expected = clone(data.observed)
    expected.branchMap[0].loc.end = { ...authored.loc.end }
    expected.branchMap[0].locations[0].end = { ...authored.loc.end }
    delete expected.meta.seen[oldKey]
    expected.meta.seen[newKey] = 0
    apply(data)
    assert.deepEqual(data.observed, expected)
    controls++
  }
  const refuse = (edit) => {
    const value = clone(before)
    edit(value)
    const held = clone(value.observed)
    assert.throws(
      () => apply(value),
      /if-return endpoint association is ambiguous or absent/
    )
    assert.deepEqual(value.observed, held)
    controls++
  }
  for (const point of [
    emitted.loc.start,
    emitted.test.loc.start,
    emitted.consequent.loc.start,
    emitted.consequent.argument.loc.start,
    next.loc.start,
    next.argument.loc.start,
  ]) {
    refuse((x) => editMap(x, (m) => (same(m.generated, point) ? [] : [m])))
    refuse((x) =>
      editMap(x, (m) =>
        same(m.generated, point) ? [{ ...m, source: x.file + '.foreign' }] : [m]
      )
    )
  }
  refuse((x) =>
    editMap(x, (m) =>
      same(m.generated, emitted.loc.start)
        ? [
            m,
            {
              ...m,
              original: { ...m.original, column: m.original.column + 1 },
            },
          ]
        : [m]
    )
  )
  refuse((x) => {
    x.emitted.extra = clone(block)
  })
  refuse((x) => {
    x.model.branchMap.duplicate = clone(x.model.branchMap[0])
  })
  refuse((x) => {
    x.observed.branchMap.duplicate = clone(x.observed.branchMap[0])
  })
  refuse((x) => {
    x.observed.meta.seen[oldKey] = 9
  })
  refuse((x) => {
    x.observed.meta.seen[newKey] = 8
  })
  const unchanged = clone(before)
  unchanged.observed = clone(expected)
  const held = clone(unchanged)
  apply(unchanged)
  assert.deepEqual(unchanged, held)
  controls++
}
console.log(JSON.stringify({ profiles: 2, controls, passed: controls }))
