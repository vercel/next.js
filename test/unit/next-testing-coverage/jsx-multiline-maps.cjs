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
const { bindJsxArrowInitializerEnds } = require(
  repo + '/packages/next/dist/experimental/testing/coverage/jsx-owners'
)
const clone = (value) => v8.deserialize(v8.serialize(value))
const equalPoint = (a, b) => a.line === b.line && a.column === b.column
const compare = (a, b) => a.line - b.line || a.column - b.column
let controls = 0
function load(mode) {
  const root = path.join(__dirname, 'fixtures/jsx-multiline')
  const data = JSON.parse(
    fs.readFileSync(path.join(root, mode, 'facts.json')),
    (key, value) => (key === 'column' && value === null ? Infinity : value)
  )
  const source = fs.readFileSync(path.join(root, 'subject.tsx.txt'), 'utf8')
  const code = fs.readFileSync(path.join(root, mode, 'emitted.js.txt'), 'utf8')
  data.authored = parseAuthored(source, {
    sourceType: 'module',
    plugins: ['estree', 'typescript', 'jsx'],
  }).program
  data.emitted = parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
  })
  data.map = JSON.parse(
    fs.readFileSync(path.join(root, mode, 'source-map.json'))
  )
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
function run(data) {
  bindJsxArrowInitializerEnds(
    data.file,
    data.model,
    data.observed,
    data.associations,
    data.map
  )
}
for (const mode of ['development', 'production']) {
  const data = load(mode),
    association = data.associations[0],
    body = association.original.body
  assert(body.loc.start.line < body.loc.end.line)
  assert(association.original.loc.end.line > body.loc.end.line)
  const expected = clone(data),
    location = Object.values(expected.model.statementMap).find((location) =>
      equalPoint(location.start, association.start)
    ),
    observed = Object.values(data.observed.statementMap).find((location) =>
      equalPoint(location.start, association.start)
    )
  location.end = clone(observed.end)
  run(data)
  assert.deepEqual(clone(data), expected)
  controls++
  const edits = [
    (data) => data.associations.push(data.associations[0]),
    (data) => {
      data.associations[0].generated.body = undefined
    },
    (data) => {
      data.associations[0].generated.body.arguments[0].value = 'aside'
    },
    (data) => {
      data.associations[0].original.body.closingElement = undefined
    },
    (data) => {
      data.associations[0].original.body.closingElement.loc.end.column--
    },
    (data) => {
      data.observed.statementMap.duplicate = clone(
        data.observed.statementMap[1]
      )
    },
    (data) => {
      data.model.statementMap.duplicate = clone(data.model.statementMap[0])
    },
    (data) => {
      data.observed.statementMap[0].end.column = 1
    },
    (data) => {
      data.observed.statementMap[1].end.line++
    },
    (data) => {
      data.model.statementMap[0].end.line++
    },
    (data) => {
      const start = data.associations[0].generated.body.loc.start
      mapEdit(data, (m) =>
        equalPoint({ line: m.generatedLine, column: m.generatedColumn }, start)
          ? []
          : [m]
      )
    },
    (data) => {
      const start = data.associations[0].generated.body.arguments[0].loc.start
      mapEdit(data, (m) =>
        equalPoint({ line: m.generatedLine, column: m.generatedColumn }, start)
          ? []
          : [m]
      )
    },
    (data) => {
      const end = data.associations[0].original.body.loc.end
      mapEdit(data, (m) =>
        m.source === data.file &&
        m.originalLine === end.line &&
        m.originalColumn === end.column - 1
          ? []
          : [m]
      )
    },
    (data) => {
      const end = data.associations[0].original.body.loc.end
      mapEdit(data, (m) =>
        m.source === data.file &&
        m.originalLine === end.line &&
        m.originalColumn === end.column - 1
          ? [{ ...m, originalColumn: end.column - 2 }]
          : [m]
      )
    },
    (data) => {
      const start = data.associations[0].generated.body.arguments[0].loc.start
      mapEdit(data, (m) =>
        equalPoint({ line: m.generatedLine, column: m.generatedColumn }, start)
          ? [m, { ...m, source: '/foreign.tsx' }]
          : [m]
      )
    },
    (data) => {
      const emitted = data.associations[0].generated.body
      mapEdit(data, (m) =>
        m.source === data.file &&
        compare(
          { line: m.generatedLine, column: m.generatedColumn },
          emitted.loc.start
        ) > 0 &&
        compare(
          { line: m.generatedLine, column: m.generatedColumn },
          emitted.loc.end
        ) < 0
          ? [{ ...m, source: '/foreign.tsx' }]
          : [m]
      )
    },
  ]
  for (const edit of edits) {
    const data = load(mode)
    edit(data)
    const before = clone(data)
    assert.throws(() => run(data), /JSX initializer association/)
    assert.deepEqual(clone(data), before)
    controls++
  }
}
process.stdout.write(JSON.stringify({ controls, passed: controls }) + '\n')
