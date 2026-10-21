const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const v8 = require('node:v8')
const repo = path.resolve(__dirname, '../../..')
const { parse } = require(repo + '/packages/next/dist/compiled/acorn')
const { parse: parseAuthored } = require(
  repo + '/packages/next/dist/compiled/babel/parser'
)
const { SourceMapGenerator } = require(
  repo + '/packages/next/dist/compiled/source-map'
)
const { decodeCoverageMap } = require(
  repo + '/packages/next/dist/experimental/testing/coverage/maps'
)
const { associateArrowBindings, bindOriginalArrowLocations } = require(
  repo + '/packages/next/dist/experimental/testing/coverage/arrow-bindings'
)
const { bindJsxArrowInitializerEnds, bindJsxLogicalChildEnds } = require(
  repo + '/packages/next/dist/experimental/testing/coverage/jsx-owners'
)
const clone = (value) => v8.deserialize(v8.serialize(value))
function nodes(ast) {
  const result = []
  function visit(value) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(visit)
    if (value.type) result.push(value)
    for (const [key, child] of Object.entries(value))
      if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
  }
  visit(ast)
  return result
}
function load(mode) {
  const root = path.join(__dirname, 'fixtures/jsx-fragment-owners', mode)
  const data = JSON.parse(
    fs.readFileSync(root + '/facts.json'),
    (key, value) => (key === 'column' && value === null ? Infinity : value)
  )
  data.mode = mode
  data.authored = parseAuthored(
    fs.readFileSync(root + '/authored.tsx.txt', 'utf8'),
    { sourceType: 'module', plugins: ['estree', 'typescript', 'jsx'] }
  ).program
  data.emitted = parse(fs.readFileSync(root + '/emitted.js.txt', 'utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
  })
  data.map = JSON.parse(fs.readFileSync(root + '/source-map.json'))
  data.associations = associateArrowBindings(
    data.file,
    data.authored,
    data.emitted,
    data.map
  )
  assert.equal(data.associations.length, 1)
  bindOriginalArrowLocations(
    data.file,
    data.model,
    data.observed,
    data.associations
  )
  return data
}
function roles(data) {
  const authored = nodes(data.authored),
    emitted = nodes(data.emitted)
  const logical = authored.find(
    (n) => n.type === 'LogicalExpression' && n.left?.name === 'active'
  )
  const container = authored.find(
    (n) => n.type === 'JSXExpressionContainer' && n.expression === logical
  )
  const owner = authored.find(
    (n) => n.type === 'JSXFragment' && n.children?.includes(container)
  )
  const generated = emitted.find(
    (n) => n.type === 'LogicalExpression' && n.left?.name === 'active'
  )
  const generatedOwner = emitted.find(
    (n) =>
      n.type === 'CallExpression' &&
      n.arguments?.[1]?.properties?.some(
        (p) =>
          p.key?.name === 'children' && p.value?.elements?.[0] === generated
      )
  )
  const children = generatedOwner.arguments[1].properties.find(
    (p) => p.key?.name === 'children'
  )
  return {
    logical,
    container,
    owner,
    generated,
    generatedOwner,
    children,
    next: owner.children[1],
    generatedNext: children.value.elements[1],
  }
}
function mapEdit(data, edit) {
  const decoded = decodeCoverageMap(data.map),
    next = new SourceMapGenerator()
  for (const mapping of decoded.mappings)
    for (const value of edit({ ...mapping }) || []) {
      const generated = {
        line: value.generatedLine,
        column: value.generatedColumn,
      }
      if (value.source === null) next.addMapping({ generated })
      else
        next.addMapping({
          generated,
          source: value.source,
          original: { line: value.originalLine, column: value.originalColumn },
        })
    }
  for (const [file, content] of decoded.sources)
    next.setSourceContent(file, content)
  data.map = JSON.parse(next.toString())
}
function at(mapping, point, file) {
  return (
    mapping.source === file &&
    mapping.originalLine === point.line &&
    mapping.originalColumn === point.column
  )
}
function logical(data) {
  bindJsxLogicalChildEnds(
    data.file,
    data.observed,
    data.authored,
    data.emitted,
    data.map,
    data.mode
  )
}
function arrow(data) {
  bindJsxArrowInitializerEnds(
    data.file,
    data.model,
    data.observed,
    data.associations,
    data.map
  )
}
const logicalEdits = [
  (d) => {
    d.mode = undefined
  },
  (d) => {
    d.mode = 'unknown'
  },
  (d) => {
    d.mode = d.mode === 'development' ? 'production' : 'development'
  },
  (d) => {
    d.observed.branchMap.duplicate = clone(d.observed.branchMap[0])
  },
  (d) => {
    d.authored.body.push({ ...roles(d).owner })
  },
  (d) => {
    roles(d).owner.type = 'MissingFragment'
  },
  (d) => {
    d.emitted.body.push({ ...roles(d).generatedOwner })
  },
  (d) => {
    roles(d).owner.children.push({ type: 'JSXText', value: 'extra' })
  },
  (d) => {
    roles(d).children.value.elements.push({ type: 'Literal', value: 'extra' })
  },
  (d) => {
    roles(d).children.value.elements.reverse()
  },
  (d) => {
    roles(d).generated.right.arguments[0].value = 'aside'
  },
  (d) => {
    roles(d).generatedNext.arguments[0].value = 'aside'
  },
  (d) => {
    roles(d).generatedOwner.arguments[0].property.value = 'OtherFragment'
  },
  (d) => {
    roles(d).generatedOwner.callee.expressions[1].property.value = 'other'
  },
  (d) => {
    roles(d).generated.right.callee.expressions[1].property.value = 'other'
  },
  (d) => {
    roles(d).generatedNext.callee.expressions[1].property.value = 'other'
  },
  (d) => {
    const point = roles(d).next.openingElement.name.loc.start
    mapEdit(d, (m) => (at(m, point, d.file) ? [] : [m]))
  },
  (d) => {
    const point = roles(d).owner.loc.start
    mapEdit(d, (m) => (at(m, point, d.file) ? [] : [m]))
  },
  (d) => {
    const point = roles(d).owner.loc.end
    mapEdit(d, (m) =>
      at(m, { line: point.line, column: point.column - 1 }, d.file)
        ? [{ ...m, originalColumn: m.originalColumn - 1 }]
        : [m]
    )
  },
  (d) => {
    const point = roles(d).logical.right.loc.end
    mapEdit(d, (m) =>
      at(m, { line: point.line, column: point.column - 1 }, d.file)
        ? [{ ...m, originalColumn: m.originalColumn - 1 }]
        : [m]
    )
  },
  (d) => {
    const point = roles(d).next.openingElement.name.loc.start
    mapEdit(d, (m) =>
      at(m, point, d.file)
        ? [m, { ...m, originalColumn: m.originalColumn + 1 }]
        : [m]
    )
  },
  (d) => {
    d.observed.branchMap[0].loc.end.column--
  },
  (d) => {
    d.observed.branchMap[0].locations[1].end.column--
  },
  (d) => {
    const point = roles(d).logical.left.loc.start
    mapEdit(d, (m) => (at(m, point, d.file) ? [] : [m]))
  },
  (d) => {
    roles(d).children.key.name = 'other'
  },
  (d) => {
    roles(d).owner.closingFragment.loc.end.column--
  },
]
const arrowEdits = [
  (d) => {
    d.associations.push(d.associations[0])
  },
  (d) => {
    d.observed.statementMap.duplicate = clone(d.observed.statementMap[1])
  },
  (d) => {
    d.model.statementMap.duplicate = clone(d.model.statementMap[1])
  },
  (d) => {
    d.associations[0].generated.body.arguments[0].property.value =
      'OtherFragment'
  },
  (d) => {
    const point = d.associations[0].original.body.loc.end
    mapEdit(d, (m) =>
      at(m, { line: point.line, column: point.column - 1 }, d.file) ? [] : [m]
    )
  },
  (d) => {
    const point = d.associations[0].original.body.loc.start
    mapEdit(d, (m) => (at(m, point, d.file) ? [] : [m]))
  },
]
let controls = 0
for (const mode of ['development', 'production']) {
  const positive = load(mode),
    counters = clone([
      positive.observed.s,
      positive.observed.f,
      positive.observed.b,
    ]),
    ast = clone([positive.authored, positive.emitted]),
    map = clone(positive.map)
  arrow(positive)
  logical(positive)
  assert.deepEqual(
    [positive.observed.s, positive.observed.f, positive.observed.b],
    counters
  )
  assert.deepEqual(clone([positive.authored, positive.emitted]), ast)
  assert.deepEqual(positive.map, map)
  const points = roles(positive),
    expected =
      mode === 'development'
        ? points.next.openingElement.name.loc.start
        : points.next.loc.start
  assert.deepEqual(positive.observed.branchMap[0].loc.end, { ...expected })
  assert.deepEqual(
    positive.model.statementMap[1].end,
    positive.observed.statementMap[1].end
  )
  controls++
  for (const [run, edits] of [
    [logical, logicalEdits],
    [arrow, arrowEdits],
  ])
    for (const edit of edits) {
      const data = load(mode)
      edit(data)
      const before = clone(data)
      assert.throws(
        () => run(data),
        /JSX (logical child|initializer) association/
      )
      assert.deepEqual(clone(data), before)
      controls++
    }
}
process.stdout.write(JSON.stringify({ controls, passed: controls }) + '\n')
