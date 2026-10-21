const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const v8 = require('node:v8')
const repo = path.resolve(__dirname, '../../..')
const { parse } = require(repo + '/packages/next/dist/compiled/acorn')
const { parse: parseAuthored } = require(
  repo + '/packages/next/dist/compiled/babel/parser'
)
const { bindEnumModel } = require(
  repo + '/packages/next/dist/experimental/testing/coverage/enums'
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
const same = (a, b) => a.line === b.line && a.column === b.column
function load(family, mode) {
  const root = path.join(__dirname, 'fixtures/runtime-enums', family)
  const d = JSON.parse(
    fs.readFileSync(path.join(root, mode, 'facts.json')),
    (key, value) => (key === 'column' && value === null ? Infinity : value)
  )
  d.source = fs.readFileSync(path.join(root, 'subject.ts.txt'), 'utf8')
  d.authored = parseAuthored(d.source, {
    sourceType: 'module',
    plugins: ['estree', 'typescript'],
  }).program
  d.emitted = parse(
    fs.readFileSync(path.join(root, mode, 'emitted.js.txt'), 'utf8'),
    { ecmaVersion: 'latest', sourceType: 'module', locations: true }
  )
  return clone(d)
}
const owner = (d) =>
  nodes(d.authored).find((n) => n.type === 'TSEnumDeclaration')
const variable = (d) =>
  nodes(d.emitted).find(
    (n) => n.type === 'VariableDeclarator' && n.id?.name === owner(d).id.name
  )
const fn = (d) => variable(d).init.callee
const statementId = (d, node) =>
  Object.entries(d.generated.statementMap).find(([, loc]) =>
    same(loc.start, node.loc.start)
  )[0]
const functionId = (d) =>
  Object.entries(d.generated.fnMap).find(([, value]) =>
    same(value.decl.start, fn(d).loc.start)
  )[0]
const run = (d) =>
  bindEnumModel(
    d.file,
    d.source,
    d.authored,
    d.emitted,
    d.sourceMap,
    d.model,
    d.observed,
    d.generated
  )
let controls = 0
for (const family of ['mixed', 'automatic', 'strings', 'negative', 'quoted'])
  for (const mode of ['development', 'production']) {
    const data = load(family, mode),
      before = clone(data),
      result = run(data)
    assert.deepEqual(data, before)
    for (const value of [
      ...Object.values(result.original.s),
      ...Object.values(result.original.f),
      ...Object.values(result.original.b).flat(),
    ])
      assert.equal(value, 0)
    for (const [index, member] of owner(data).members.entries()) {
      const observedId = Object.entries(result.observed.statementMap).find(
        ([, loc]) => same(loc.start, member.loc.start)
      )[0]
      assert.equal(
        result.observed.s[observedId],
        data.generated.s[statementId(data, fn(data).body.body[index])]
      )
    }
    Object.values(result.original.statementMap)[0].start.column++
    Object.values(result.observed.fnMap)[0].decl.start.column++
    assert.deepEqual(data, before)
    controls++
    // A stopped last member keeps its own zero count even when the header ran.
    const stopped = load(family, mode),
      last = fn(stopped).body.body.at(-2),
      returned = fn(stopped).body.body.at(-1)
    stopped.generated.s[statementId(stopped, last)] = 0
    stopped.generated.s[statementId(stopped, returned)] = 0
    const stoppedBefore = clone(stopped),
      stoppedResult = run(stopped)
    const member = owner(stopped).members.at(-1)
    const id = Object.entries(stoppedResult.observed.statementMap).find(
      ([, loc]) => same(loc.start, member.loc.start)
    )[0]
    assert.equal(stoppedResult.observed.s[id], 0)
    assert.deepEqual(stopped, stoppedBefore)
    controls++
    const mutations = [
      (d) => {
        d.authored.body = [{ type: 'BlockStatement', body: d.authored.body }]
      },
      (d) => {
        d.sourceMap.mappings = ''
      },
      (d) => {
        d.sourceMap.sources = d.sourceMap.sources.map((s) => s + '-foreign')
      },
      (d) => {
        owner(d).id.loc.start.column++
      },
      (d) => {
        owner(d).const = true
      },
      (d) => {
        owner(d).declare = true
      },
      (d) => {
        owner(d).members.push(clone(owner(d).members[0]))
      },
      (d) => {
        owner(d).members[0].initializer = { type: 'CallExpression' }
      },
      (d) => {
        variable(d).init.arguments[0].properties.push({ type: 'Property' })
      },
      (d) => {
        fn(d).async = true
      },
      (d) => {
        fn(d).params[0].name = 'Foreign'
      },
      (d) => {
        fn(d).body.body.push(clone(fn(d).body.body[0]))
      },
      (d) => {
        fn(d).body.body.pop()
      },
      (d) => {
        fn(d).body.body[0].expression.operator = '+='
      },
      (d) => {
        fn(d).body.body.at(-1).argument.name = 'Foreign'
      },
      (d) => {
        delete d.generated.s[statementId(d, fn(d).body.body[0])]
      },
      (d) => {
        const id = statementId(d, fn(d).body.body[0])
        d.generated.statementMap.extra = clone(d.generated.statementMap[id])
        d.generated.s.extra = d.generated.s[id]
      },
      (d) => {
        d.generated.s[statementId(d, fn(d).body.body[0])] = -1
      },
      (d) => {
        d.generated.s[statementId(d, fn(d).body.body[0])] = 0.5
      },
      (d) => {
        d.generated.s[statementId(d, fn(d).body.body[0])] = 2
      },
      (d) => {
        d.generated.f[functionId(d)] = 0
      },
      (d) => {
        delete d.model.meta
      },
      (d) => {
        delete d.observed.meta
      },
      (d) => {
        const id = Object.keys(d.observed.fnMap).find(
          (id) =>
            d.observed.fnMap[id].decl.start.line === owner(d).loc.start.line
        )
        d.observed.f[id] = 0
      },
      (d) => {
        const loc = clone(owner(d).loc)
        d.observed.branchMap.extra = {
          type: 'if',
          loc,
          locations: [loc],
          line: loc.start.line,
        }
        d.observed.b.extra = [1]
      },
    ]
    for (const mutate of mutations) {
      const changed = load(family, mode)
      mutate(changed)
      const held = clone(changed)
      assert.throws(
        () => run(changed),
        /cannot associate generated TSEnumDeclaration bodies/
      )
      assert.deepEqual(changed, held)
      controls++
    }
  }
process.stdout.write(JSON.stringify({ controls, passed: controls }) + '\n')
