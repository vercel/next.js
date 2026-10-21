const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const v8 = require('node:v8')
const repo = path.resolve(__dirname, '../../..')
const { parse } = require(repo + '/packages/next/dist/compiled/acorn')
const { parse: parseAuthored } = require(
  repo + '/packages/next/dist/compiled/babel/parser'
)
const { bindNamespaceModel } = require(
  repo + '/packages/next/dist/experimental/testing/coverage/namespaces'
)
const clone = (value) => v8.deserialize(v8.serialize(value))
function nodes(value) {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(nodes)
  return [
    ...(value.type ? [value] : []),
    ...Object.entries(value)
      .filter(([key]) => !['loc', 'comments', 'tokens'].includes(key))
      .flatMap(([, child]) => nodes(child)),
  ]
}
function load(mode) {
  const root = path.join(__dirname, 'fixtures/runtime-namespace')
  const data = JSON.parse(
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
function run(d) {
  return bindNamespaceModel(
    d.file,
    d.source,
    d.authored,
    d.emitted,
    d.sourceMap,
    d.model,
    d.observed
  )
}
const namespace = (d) =>
  nodes(d.authored).find((n) => n.type === 'TSModuleDeclaration')
const owner = (d) =>
  nodes(d.emitted).find(
    (n) => n.type === 'FunctionExpression' && n.params?.[0]?.name === 'Box'
  )
const publication = (d) =>
  owner(d).body.body.find(
    (n) =>
      n.type === 'ExpressionStatement' && n.expression?.right?.name === 'choose'
  )
const literal = (d) =>
  owner(d).body.body.find(
    (n) =>
      n.type === 'ExpressionStatement' &&
      n.expression?.right?.type === 'Literal'
  )
let controls = 0
for (const mode of ['development', 'production']) {
  const data = clone(load(mode)),
    before = clone(data),
    result = run(data)
  assert.deepEqual(data, before)
  assert.deepEqual(result.observed.f, data.observed.f)
  assert.deepEqual(result.observed.b, data.observed.b)
  const removed = Object.keys(data.observed.s).filter(
    (id) => !Object.hasOwn(result.observed.s, id)
  )
  assert.equal(removed.length, 1)
  const authoredFunction = nodes(data.authored).find(
    (n) => n.type === 'FunctionDeclaration'
  )
  assert.deepEqual(
    data.observed.statementMap[removed[0]].start,
    authoredFunction.id.loc.start
  )
  for (const [id, count] of Object.entries(result.observed.s))
    assert.equal(count, data.observed.s[id])
  for (const value of [
    ...Object.values(result.original.s),
    ...Object.values(result.original.f),
    ...Object.values(result.original.b).flat(),
  ])
    assert.equal(value, 0)
  Object.values(result.original.statementMap)[0].start.column++
  Object.values(result.observed.fnMap)[0].decl.start.column++
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
      namespace(d).id.loc.start.column++
    },
    (d) => {
      namespace(d).kind = 'module'
    },
    (d) => {
      namespace(d).declare = true
    },
    (d) => {
      namespace(d).body.body.push(clone(namespace(d).body.body[0]))
    },
    (d) => {
      namespace(d).body.body[0].declaration.kind = 'let'
    },
    (d) => {
      namespace(d).body.body[0].declaration.declarations[0].init.type =
        'CallExpression'
    },
    (d) => {
      delete d.model.meta
    },
    (d) => {
      delete d.observed.meta
    },
    (d) => {
      owner(d).async = true
    },
    (d) => {
      owner(d).params[0].name = 'Foreign'
    },
    (d) => {
      owner(d).params[0].loc.start.column++
    },
    (d) => {
      owner(d).params.push(clone(owner(d).params[0]))
    },
    (d) => {
      owner(d).body.loc.end.column++
    },
    (d) => {
      const call = nodes(d.emitted).find(
        (n) => n.type === 'CallExpression' && n.callee === owner(d)
      )
      call.arguments[0].operator = '&&'
    },
    (d) => {
      const call = nodes(d.emitted).find(
        (n) => n.type === 'CallExpression' && n.callee === owner(d)
      )
      call.arguments[0].right.right.properties.push({ type: 'Property' })
    },
    (d) => {
      literal(d).expression.left.computed = true
    },
    (d) => {
      literal(d).expression.left.property.name = 'foreign'
    },
    (d) => {
      literal(d).expression.right.value = 'foreign'
    },
    (d) => {
      literal(d).expression.right.loc.start.column++
    },
    (d) => {
      publication(d).expression.left.object.name = 'foreign'
    },
    (d) => {
      publication(d).expression.right.name = 'foreign'
    },
    (d) => {
      publication(d).expression.right.loc.start.column++
    },
    (d) => {
      owner(d).body.body.push(clone(publication(d)))
    },
    (d) => {
      owner(d).body.body.push({ type: 'EmptyStatement' })
    },
    (d) => {
      Object.values(d.observed.fnMap).find(
        (f) => f.name === '(anonymous_0)'
      ).name = 'foreign'
    },
    (d) => {
      Object.values(d.observed.fnMap).find((f) => f.name === '(anonymous_0)')
        .loc.end.line++
    },
    (d) => {
      const id = Object.keys(d.observed.statementMap).find(
        (id) =>
          d.observed.statementMap[id].start.column ===
            authoredFunction.id.loc.start.column &&
          d.observed.statementMap[id].start.line ===
            authoredFunction.id.loc.start.line
      )
      d.observed.s[id]++
    },
    (d) => {
      const id = Object.keys(d.observed.statementMap).find(
        (id) =>
          d.observed.statementMap[id].start.line ===
          namespace(d).id.loc.start.line
      )
      d.observed.statementMap.extra = clone(d.observed.statementMap[id])
      d.observed.s.extra = d.observed.s[id]
    },
    (d) => {
      Object.values(d.observed.branchMap)
        .find((b) => b.type === 'binary-expr')
        .locations.pop()
    },
    (d) => {
      const id = Object.keys(d.model.statementMap).find(
        (id) => d.model.statementMap[id].start.line === 2
      )
      delete d.model.statementMap[id]
      delete d.model.s[id]
    },
  ]
  for (const mutate of mutations) {
    const changed = clone(data)
    mutate(changed)
    const retained = clone(changed)
    assert.throws(
      () => run(changed),
      /cannot associate generated TSModuleDeclaration bodies/
    )
    assert.deepEqual(changed, retained)
    controls++
  }
  const noNamespace = clone(data)
  namespace(noNamespace).type = 'Identifier'
  const unchanged = run(noNamespace)
  assert.equal(unchanged.original, noNamespace.model)
  assert.equal(unchanged.observed, noNamespace.observed)
  controls++
}
process.stdout.write(JSON.stringify({ controls, passed: controls }) + '\n')
