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
const { bindJsxLogicalChildEnds } = require(
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
  const root = path.join(__dirname, 'fixtures/jsx-multiline-logical'),
    data = JSON.parse(
      fs.readFileSync(path.join(root, mode, 'facts.json')),
      (key, value) => (key === 'column' && value === null ? Infinity : value)
    )
  data.mode = mode
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
  data.original = nodes(data.authored).find(
    (n) => n.type === 'LogicalExpression'
  )
  data.generated = nodes(data.emitted).find(
    (n) => n.type === 'LogicalExpression' && n.left.name === 'active'
  )
  data.owner = nodes(data.authored).find(
    (n) => n.type === 'JSXElement' && n.openingElement.name.name === 'section'
  )
  data.next = data.owner.children[3]
  data.generatedOwner = nodes(data.emitted).find(
    (n) => n.type === 'CallExpression' && n.arguments[0]?.value === 'section'
  )
  data.generatedChildren = data.generatedOwner.arguments[1].properties.find(
    (n) => n.key?.name === 'children'
  )
  data.generatedNext = data.generatedChildren.value.elements[1]
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
function run(data, model = data.model) {
  bindJsxLogicalChildEnds(
    data.file,
    data.observed,
    data.authored,
    data.emitted,
    data.map,
    data.mode,
    model
  )
}
let controls = 0
for (const mode of ['development', 'production']) {
  const data = load(mode),
    expected = clone(data),
    endpoint =
      mode === 'development'
        ? data.next.openingElement.name.loc.start
        : data.observed.branchMap[0].loc.end
  expected.model.branchMap[0].loc.end = clone(endpoint)
  if (mode === 'development') {
    expected.model.branchMap[0].locations[1].end = clone(endpoint)
    expected.observed.branchMap[0].loc.end = clone(endpoint)
    expected.observed.branchMap[0].locations[1].end = clone(endpoint)
  }
  run(data)
  assert.deepEqual(clone(data), expected)
  controls++
  const legacy = load(mode),
    beforeLegacy = clone(legacy)
  bindJsxLogicalChildEnds(
    legacy.file,
    legacy.observed,
    legacy.authored,
    legacy.emitted,
    legacy.map,
    legacy.mode
  )
  assert.deepEqual(clone(legacy), beforeLegacy)
  controls++
  const edits = [
    (d) => {
      d.mode = undefined
    },
    (d) => d.authored.body.push(clone(d.original)),
    (d) => d.emitted.body.push(clone(d.generated)),
    (d) => d.emitted.body.push(clone(d.generatedOwner)),
    (d) => {
      d.original.right.extra.parenthesized = false
    },
    (d) => {
      d.original.right.extra.parenStart = d.original.right.start
    },
    (d) => {
      d.original.right.extra.parenStart++
    },
    (d) => {
      d.original.right.closingElement = undefined
    },
    (d) => {
      d.next.closingElement = undefined
    },
    (d) => {
      d.owner.children[0].value = 'text'
    },
    (d) => {
      d.owner.children[2].value = ' '
    },
    (d) => {
      d.owner.children.splice(3, 1)
    },
    (d) => {
      d.owner.children.reverse()
    },
    (d) => {
      d.generatedChildren.value.elements.reverse()
    },
    (d) => {
      d.generatedChildren.value.elements.push(clone(d.generatedNext))
    },
    (d) => {
      d.generatedChildren.key.name = 'foreign'
    },
    (d) => {
      d.generatedRight = d.generated.right
      d.generatedRight.type = 'NewExpression'
    },
    (d) => {
      d.generated.right.arguments[0].value = 'aside'
    },
    (d) => {
      d.generatedNext.arguments[0].value = 'aside'
    },
    (d) => {
      d.model.branchMap.duplicate = clone(d.model.branchMap[0])
    },
    (d) => {
      d.observed.branchMap.duplicate = clone(d.observed.branchMap[0])
    },
    (d) => {
      d.model.branchMap[0].loc.end.line--
    },
    (d) => {
      d.model.branchMap[0].locations[0].end.column--
    },
    (d) => {
      d.model.branchMap[0].locations[1].end.line++
    },
    (d) => {
      d.observed.branchMap[0].loc.end.line++
    },
    (d) => {
      d.observed.branchMap[0].locations[0].end.column = 1
    },
    (d) => {
      d.observed.branchMap[0].locations[1].end.column = 1
    },
  ]
  const roles = [
    (d) => d.generated.left.loc.start,
    (d) => d.generated.right.loc.start,
    (d) => d.generated.right.arguments[0].loc.start,
    (d) => d.generatedOwner.loc.start,
    (d) => d.generatedNext.loc.start,
    (d) => d.generatedNext.arguments[0].loc.start,
  ]
  for (const role of roles) {
    edits.push((d) => {
      const point = role(d)
      mapEdit(d, (m) =>
        same({ line: m.generatedLine, column: m.generatedColumn }, point)
          ? []
          : [m]
      )
    })
    edits.push((d) => {
      const point = role(d)
      mapEdit(d, (m) =>
        same({ line: m.generatedLine, column: m.generatedColumn }, point)
          ? [{ ...m, source: '/foreign.tsx' }]
          : [m]
      )
    })
  }
  for (const authored of [
    (d) => d.original.right,
    (d) => d.next,
    (d) => d.owner,
  ]) {
    edits.push((d) => {
      const end = authored(d).loc.end
      mapEdit(d, (m) =>
        m.source === d.file &&
        m.originalLine === end.line &&
        m.originalColumn === end.column - 1
          ? []
          : [m]
      )
    })
  }
  edits.push((d) => {
    d.map.sourcesContent[d.map.sources.indexOf(d.file)] = d.map.sourcesContent[
      d.map.sources.indexOf(d.file)
    ].replace('active && (', 'active && [')
  })
  // An earlier valid repair must remain unapplied if a later owner is invalid.
  edits.push((d) => {
    const other = clone(d.owner)
    other.children[1].expression.loc.start.column++
    d.authored.body.push(other)
  })
  for (const edit of edits) {
    const data = load(mode)
    edit(data)
    const before = clone(data)
    assert.throws(() => run(data), /JSX logical child association/)
    assert.deepEqual(clone(data), before)
    controls++
  }
}
process.stdout.write(JSON.stringify({ controls, passed: controls }) + '\n')
