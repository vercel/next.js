const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  v8 = require('node:v8')
const repo = path.resolve(__dirname, '../../..')
const { parse } = require(repo + '/packages/next/dist/compiled/acorn')
const { parse: parseAuthored } = require(
  repo + '/packages/next/dist/compiled/babel/parser'
)
const { bindParameterPropertyModel } = require(
  repo +
    '/packages/next/dist/experimental/testing/coverage/parameter-properties'
)
function nodes(value) {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(nodes)
  return [
    ...(value.type ? [value] : []),
    ...Object.entries(value)
      .filter(([key]) => !['loc', 'comments', 'tokens'].includes(key))
      .flatMap(([, value]) => nodes(value)),
  ]
}
const clone = (value) => v8.deserialize(v8.serialize(value))
function load(name, mode) {
  const root = path.join(__dirname, 'fixtures/parameter-properties', name),
    data = JSON.parse(
      fs.readFileSync(path.join(root, mode, 'facts.json')),
      (key, value) => (key === 'column' && value === null ? Infinity : value)
    )
  data.source = fs.readFileSync(path.join(root, 'subject.ts.txt'), 'utf8')
  data.authored = parseAuthored(data.source, {
    sourceType: 'module',
    plugins: ['estree', 'typescript', 'jsx'],
  }).program
  data.emitted = parse(
    fs.readFileSync(path.join(root, mode, 'emitted.js.txt'), 'utf8'),
    { ecmaVersion: 'latest', sourceType: 'module', locations: true }
  )
  return data
}
function run(data) {
  return bindParameterPropertyModel(
    data.file,
    data.source,
    data.authored,
    data.emitted,
    data.sourceMap,
    data.model,
    data.observed
  )
}
let controls = 0
for (const name of [
  'parameter-property',
  'simple',
  'pair',
  'multiline',
  'mixed',
])
  for (const mode of ['development', 'production']) {
    const data = clone(load(name, mode)),
      before = clone(data),
      result = run(data)
    assert.deepEqual(data, before)
    for (const key of ['s', 'f', 'b'])
      assert.deepEqual(result.observed[key], data.observed[key])
    assert.equal(
      Object.keys(result.original.statementMap).length,
      Object.keys(data.observed.statementMap).length
    )
    Object.values(result.original.statementMap)[0].start.column++
    assert.deepEqual(data, before)
    controls++
    const mutations = [
      (d) => {
        d.sourceMap.mappings = ''
      },
      (d) => {
        d.sourceMap.sources = d.sourceMap.sources.map((s) => s + '-foreign')
      },
      (d) => {
        nodes(d.authored).find((n) => n.type === 'ClassDeclaration').id.loc
          .start.column++
      },
      (d) => {
        nodes(d.emitted).find((n) => n.type === 'ClassDeclaration').id.loc.start
          .column++
      },
      (d) => {
        nodes(d.authored).find(
          (n) => n.type === 'MethodDefinition' && n.kind === 'constructor'
        ).computed = true
      },
      (d) => {
        nodes(d.emitted)
          .find(
            (n) => n.type === 'MethodDefinition' && n.kind === 'constructor'
          )
          .value.params.pop()
      },
      (d) => {
        nodes(d.emitted).find(
          (n) => n.type === 'MethodDefinition' && n.kind === 'constructor'
        ).value.body.loc.start.column++
      },
      (d) => {
        const p = nodes(d.authored).find(
          (n) => n.type === 'TSParameterProperty'
        ).parameter
        ;(p.type === 'AssignmentPattern' ? p.left : p).name += 'foreign'
      },
      (d) => {
        const a = nodes(d.emitted).find(
          (n) =>
            n.type === 'AssignmentExpression' &&
            n.left.type === 'MemberExpression' &&
            n.left.object.type === 'ThisExpression'
        )
        a.right.name += 'foreign'
      },
      (d) => {
        const a = nodes(d.emitted).find(
          (n) =>
            n.type === 'AssignmentExpression' &&
            n.left.type === 'MemberExpression' &&
            n.left.object.type === 'ThisExpression'
        )
        a.left.computed = true
      },
      (d) => {
        const c = nodes(d.emitted).find(
          (n) => n.type === 'MethodDefinition' && n.kind === 'constructor'
        ).value.body
        c.body.push(clone(c.body.find((n) => n.type === 'ExpressionStatement')))
      },
      (d) => {
        const p = nodes(d.authored).find(
            (n) => n.type === 'TSParameterProperty'
          ).parameter,
          id = p.type === 'AssignmentPattern' ? p.left : p,
          s = Object.values(d.observed.statementMap).find(
            (s) =>
              s.start.line === id.loc.start.line &&
              s.start.column === id.loc.start.column
          )
        s.end.column++
      },
      (d) => {
        d.model.statementMap.extra = {
          start: { line: 999, column: 1 },
          end: { line: 999, column: 2 },
        }
        d.model.s.extra = 0
      },
      (d) => {
        delete d.model.meta
      },
      (d) => {
        nodes(d.authored).find(
          (n) => n.type === 'TSParameterProperty'
        ).parameter.type = 'ObjectPattern'
      },
    ]
    for (const mutate of mutations) {
      const changed = clone(data)
      mutate(changed)
      const before = clone(changed)
      assert.throws(
        () => run(changed),
        /cannot associate generated TSParameterProperty bodies/
      )
      assert.deepEqual(changed, before)
      controls++
    }
    const empty = clone(data)
    for (const p of nodes(empty.authored).filter(
      (n) => n.type === 'TSParameterProperty'
    ))
      p.type = 'Identifier'
    const unchanged = run(empty)
    assert.equal(unchanged.original, empty.model)
    assert.equal(unchanged.observed, empty.observed)
    controls++
  }
process.stdout.write(JSON.stringify({ controls, passed: controls }) + '\n')
