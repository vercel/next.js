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
const { bindJsxReturnEnds } = require(
  repo + '/packages/next/dist/experimental/testing/coverage/jsx-owners'
)
const clone = (value) => v8.deserialize(v8.serialize(value))
const same = (a, b) => a.line === b.line && a.column === b.column
const compare = (a, b) => a.line - b.line || a.column - b.column
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
function load(mode) {
  const root = path.join(__dirname, 'fixtures/jsx-returns'),
    data = JSON.parse(
      fs.readFileSync(path.join(root, mode, 'facts.json')),
      (key, value) => (key === 'column' && value === null ? Infinity : value)
    )
  data.authored = parseAuthored(
    fs.readFileSync(path.join(root, 'subject.tsx.txt'), 'utf8'),
    { sourceType: 'module', plugins: ['estree', 'typescript', 'jsx'] }
  ).program
  data.emitted = parse(
    fs.readFileSync(path.join(root, mode, 'emitted.js.txt'), 'utf8'),
    { ecmaVersion: 'latest', sourceType: 'module', locations: true }
  )
  data.map = JSON.parse(
    fs.readFileSync(path.join(root, mode, 'source-map.json'))
  )
  const original = nodes(data.authored).filter(
      (node) =>
        node.type === 'ReturnStatement' && node.argument?.type === 'JSXElement'
    ),
    generated = nodes(data.emitted).filter(
      (node) =>
        node.type === 'ReturnStatement' &&
        node.argument?.type === 'CallExpression' &&
        node.argument.arguments[0]?.value === 'p'
    )
  assert.equal(original.length, 1)
  assert.equal(generated.length, 1)
  data.original = original[0]
  data.generated = generated[0]
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
  bindJsxReturnEnds(
    data.file,
    data.model,
    data.observed,
    data.authored,
    data.emitted,
    data.map
  )
}
let controls = 0
for (const mode of ['development', 'production']) {
  const data = load(mode),
    body = data.original.argument
  assert(body.extra.parenthesized)
  assert(
    data.original.start < body.extra.parenStart &&
      body.extra.parenStart < body.start
  )
  assert(data.original.loc.end.line > body.loc.end.line)
  const expected = clone(data),
    statement = Object.values(expected.model.statementMap).find((loc) =>
      same(loc.start, data.original.loc.start)
    ),
    observed = Object.values(data.observed.statementMap).find((loc) =>
      same(loc.start, data.original.loc.start)
    )
  statement.end = clone(observed.end)
  run(data)
  assert.deepEqual(clone(data), expected)
  controls++
  const edits = [
    (data) => data.authored.body.push(clone(data.original)),
    (data) => data.emitted.body.push(clone(data.generated)),
    (data) => {
      data.generated.argument = undefined
    },
    (data) => {
      data.generated.argument.type = 'NewExpression'
    },
    (data) => {
      data.generated.argument.arguments[0].value = 'aside'
    },
    (data) => {
      data.original.argument.closingElement = undefined
    },
    (data) => {
      data.original.argument.closingElement.loc.end.column--
    },
    (data) => {
      data.original.argument.extra.parenthesized = false
    },
    (data) => {
      data.original.argument.extra.parenStart = data.original.argument.start
    },
    (data) => {
      data.model.statementMap.duplicate = clone(data.model.statementMap[0])
    },
    (data) => {
      data.observed.statementMap.duplicate = clone(
        data.observed.statementMap[0]
      )
    },
    (data) => {
      data.model.statementMap[0].end.line++
    },
    (data) => {
      data.model.statementMap[0].end.column = 0
    },
    (data) => {
      data.observed.statementMap[0].end.line++
    },
    (data) => {
      data.observed.statementMap[0].end.column = 0
    },
    (data) => {
      const start = data.generated.loc.start
      mapEdit(data, (m) =>
        same({ line: m.generatedLine, column: m.generatedColumn }, start)
          ? []
          : [m]
      )
    },
    (data) => {
      const start = data.generated.argument.loc.start
      mapEdit(data, (m) =>
        same({ line: m.generatedLine, column: m.generatedColumn }, start)
          ? []
          : [m]
      )
    },
    (data) => {
      const start = data.generated.argument.arguments[0].loc.start
      mapEdit(data, (m) =>
        same({ line: m.generatedLine, column: m.generatedColumn }, start)
          ? []
          : [m]
      )
    },
    (data) => {
      const end = data.original.argument.loc.end
      mapEdit(data, (m) =>
        m.source === data.file &&
        m.originalLine === end.line &&
        m.originalColumn === end.column - 1
          ? []
          : [m]
      )
    },
    (data) => {
      const end = data.original.argument.loc.end
      mapEdit(data, (m) =>
        m.source === data.file &&
        m.originalLine === end.line &&
        m.originalColumn === end.column - 1
          ? [{ ...m, originalColumn: end.column - 2 }]
          : [m]
      )
    },
    (data) => {
      const start = data.generated.loc.start
      mapEdit(data, (m) =>
        same({ line: m.generatedLine, column: m.generatedColumn }, start)
          ? [m, { ...m, source: '/foreign.tsx' }]
          : [m]
      )
    },
    (data) => {
      const call = data.generated.argument
      mapEdit(data, (m) =>
        m.source === data.file &&
        compare(
          { line: m.generatedLine, column: m.generatedColumn },
          call.loc.start
        ) > 0 &&
        compare(
          { line: m.generatedLine, column: m.generatedColumn },
          call.loc.end
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
    assert.throws(() => run(data), /JSX return association/)
    assert.deepEqual(clone(data), before)
    controls++
  }
}
process.stdout.write(JSON.stringify({ controls, passed: controls }) + '\n')
