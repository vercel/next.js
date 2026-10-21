const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const v8 = require('node:v8')
const repo = path.resolve(__dirname, '../../..')
const { parse } = require(repo + '/packages/next/dist/compiled/acorn')
const { parse: authoredParse } = require(
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
const revive = (key, value) =>
  key === 'column' && value === null ? Infinity : value
let controls = 0
function load(shape, mode) {
  const root = path.join(__dirname, 'fixtures/jsx-owners', shape + '-' + mode)
  const data = JSON.parse(fs.readFileSync(root + '/facts.json'), revive)
  const code = fs.readFileSync(root + '/emitted.js.txt', 'utf8')
  const source = fs.readFileSync(root + '/authored.tsx.txt', 'utf8')
  data.authored = authoredParse(source, {
    sourceType: 'module',
    plugins: ['estree', 'typescript', 'jsx'],
  }).program
  data.emitted = parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
  })
  data.map = JSON.parse(fs.readFileSync(root + '/source-map.json'))
  if (shape === 'arrow') {
    data.associations = associateArrowBindings(
      data.file,
      data.authored,
      data.emitted,
      data.map
    )
    bindOriginalArrowLocations(
      data.file,
      data.model,
      data.observed,
      data.associations
    )
  }
  return data
}
function nodes(ast) {
  const result = []
  function visit(value) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(visit)
    if (value.type) result.push(value)
    for (const [key, child] of Object.entries(value))
      if (!['loc', 'tokens', 'comments'].includes(key)) visit(child)
  }
  visit(ast)
  return result
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
function run(shape, data) {
  if (shape === 'arrow')
    bindJsxArrowInitializerEnds(
      data.file,
      data.model,
      data.observed,
      data.associations,
      data.map
    )
  else
    bindJsxLogicalChildEnds(
      data.file,
      data.observed,
      data.authored,
      data.emitted,
      data.map
    )
}
for (const mode of ['development', 'production']) {
  for (const shape of ['arrow', 'logical']) {
    const data = load(shape, mode),
      expected = clone(data)
    if (shape === 'arrow')
      expected.model.statementMap[0].end = clone(
        expected.observed.statementMap[0].end
      )
    else {
      expected.observed.branchMap[0].loc.end.column = Infinity
      expected.observed.branchMap[0].locations[1].end.column = Infinity
    }
    run(shape, data)
    assert.deepEqual(clone(data), expected)
    controls++
  }
  const arrowEdits = [
    (data) => data.associations.push(data.associations[0]),
    (data) => {
      data.associations[0].generated.body.arguments[0].value = 'aside'
    },
    (data) => {
      data.observed.statementMap[0].end.column = 1
    },
    (data) => {
      data.observed.statementMap.duplicate = clone(
        data.observed.statementMap[1]
      )
    },
    (data) => {
      data.model.statementMap.duplicate = clone(data.model.statementMap[0])
    },
    (data) =>
      mapEdit(data, (m) =>
        m.source === data.file && m.originalLine === 5 && m.originalColumn === 2
          ? []
          : [m]
      ),
    (data) =>
      mapEdit(data, (m) =>
        m.source === data.file && m.originalLine === 5 && m.originalColumn === 3
          ? []
          : [m]
      ),
    (data) =>
      mapEdit(data, (m) =>
        m.source === data.file &&
        m.originalLine === 5 &&
        m.originalColumn === 38
          ? [{ ...m, originalColumn: 37 }]
          : [m]
      ),
    (data) =>
      mapEdit(data, (m) =>
        m.source === data.file && m.originalLine === 5 && m.originalColumn === 3
          ? [m, { ...m, source: '/foreign.tsx' }]
          : [m]
      ),
  ]
  for (const edit of arrowEdits) {
    const data = load('arrow', mode)
    edit(data)
    const before = clone(data)
    assert.throws(() => run('arrow', data), /JSX initializer association/)
    assert.deepEqual(clone(data), before)
    controls++
  }
  const logicalEdits = [
    (data) => {
      const node = nodes(data.authored).find(
        (n) => n.type === 'LogicalExpression'
      )
      data.authored.body.push(clone(node))
    },
    (data) => {
      const node = nodes(data.emitted).find(
        (n) =>
          n.type === 'LogicalExpression' &&
          n.loc.start.line === (mode === 'development' ? 43 : 44)
      )
      data.emitted.body.push(clone(node))
    },
    (data) => {
      const node = nodes(data.emitted).find(
        (n) =>
          n.type === 'LogicalExpression' &&
          n.loc.start.line === (mode === 'development' ? 43 : 44)
      )
      node.right.arguments[0].value = 'aside'
    },
    (data) => {
      data.observed.branchMap.duplicate = clone(data.observed.branchMap[0])
    },
    (data) => {
      data.observed.branchMap[0].locations[0].end.column--
    },
    (data) => {
      data.observed.branchMap[0].locations[1].end.column--
    },
    (data) =>
      mapEdit(data, (m) =>
        m.source === data.file &&
        m.originalLine === 5 &&
        m.originalColumn === 19
          ? []
          : [m]
      ),
    (data) =>
      mapEdit(data, (m) =>
        m.source === data.file &&
        m.originalLine === 5 &&
        m.originalColumn === 30
          ? []
          : [m]
      ),
    (data) =>
      mapEdit(data, (m) =>
        m.source === data.file &&
        m.originalLine === 5 &&
        m.originalColumn === 58
          ? [{ ...m, originalColumn: 57 }]
          : [m]
      ),
    (data) =>
      mapEdit(data, (m) =>
        m.source === data.file &&
        m.originalLine === 5 &&
        m.originalColumn === 69
          ? []
          : [m]
      ),
    (data) =>
      mapEdit(data, (m) =>
        m.source === data.file &&
        m.originalLine === 5 &&
        m.originalColumn === 69
          ? [m, { ...m, originalColumn: 68 }]
          : [m]
      ),
    (data) => {
      const property = nodes(data.emitted).find(
        (n) =>
          n.type === 'Property' &&
          n.key.name === 'children' &&
          n.value.type === 'LogicalExpression' &&
          n.value.left.name === 'active'
      )
      property.key.name = 'other'
    },
  ]
  for (const edit of logicalEdits) {
    const data = load('logical', mode)
    edit(data)
    const before = clone(data)
    assert.throws(() => run('logical', data), /JSX logical child association/)
    assert.deepEqual(clone(data), before)
    controls++
  }
}
process.stdout.write(JSON.stringify({ controls, passed: controls }) + '\n')
