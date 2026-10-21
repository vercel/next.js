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
const { bindClassFunctionExpressionEnds } = require(
  repo + '/packages/next/dist/experimental/testing/coverage/arrow-bindings'
)
const clone = (value) => v8.deserialize(v8.serialize(value))
const same = (a, b) => a.line === b.line && a.column === b.column
function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
  if (node.type) visit(node)
  for (const [key, child] of Object.entries(node))
    if (!['loc', 'comments', 'tokens'].includes(key)) walk(child, visit)
}
function fields(tree) {
  const values = []
  walk(tree, (node) => {
    if (node.type === 'ClassDeclaration')
      for (const field of node.body.body)
        if (
          ['ClassProperty', 'PropertyDefinition'].includes(field.type) &&
          field.value?.type === 'FunctionExpression'
        )
          values.push({ owner: node, field, fn: field.value })
  })
  return values
}
function load(kind, mode, state) {
  const root = path.join(__dirname, 'fixtures/class-functions', kind)
  const data = JSON.parse(
    fs.readFileSync(path.join(root, mode, state + '.json')),
    (key, value) => (key === 'column' && value === null ? Infinity : value)
  )
  const source = fs.readFileSync(path.join(root, 'subject.ts.txt'), 'utf8')
  const code = fs.readFileSync(path.join(root, mode, state + '.js.txt'), 'utf8')
  data.authored = parseAuthored(source, {
    sourceType: 'module',
    plugins: ['estree', 'typescript', 'decorators-legacy'],
  }).program
  const comments = []
  data.emitted = Object.assign(
    parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      onComment: comments,
    }),
    { comments }
  )
  return data
}
function bind(data, file = data.file) {
  bindClassFunctionExpressionEnds(
    file,
    data.model,
    data.observed,
    data.authored,
    data.emitted,
    data.sourceMap
  )
}
function terminalMap(data, mode) {
  const point = fields(data.emitted)[1].field.loc.end
  const decoded = decodeCoverageMap(data.sourceMap)
  const map = new SourceMapGenerator()
  for (const value of decoded.mappings) {
    const target =
      value.generatedLine === point.line &&
      value.generatedColumn === point.column
    const original =
      value.source === null
        ? undefined
        : { line: value.originalLine, column: value.originalColumn }
    const add = (at = original) =>
      map.addMapping({
        generated: { line: value.generatedLine, column: value.generatedColumn },
        ...(at ? { source: value.source, original: at } : {}),
      })
    if (target && mode === 'missing') continue
    if (target && mode === 'wrong')
      add({ ...original, column: original.column + 1 })
    else add()
    if (target && mode === 'duplicate')
      add({ ...original, column: original.column + 1 })
  }
  for (const [file, source] of decoded.sources)
    map.setSourceContent(file, source)
  data.sourceMap = JSON.parse(map.toString())
}
let controls = 0
for (const kind of ['local-functions', 'functions'])
  for (const mode of ['development', 'production'])
    for (const state of ['positive', 'zero']) {
      const data = clone(load(kind, mode, state))
      const before = clone(data)
      const expected = clone(data)
      for (const { field, fn } of fields(expected.authored)) {
        for (const part of [expected.model, expected.observed]) {
          const fns = Object.values(part.fnMap).filter((value) =>
            same(value.decl.start, fn.loc.start)
          )
          const statements = Object.values(part.statementMap).filter((value) =>
            same(value.start, fn.loc.start)
          )
          assert.equal(fns.length, 1)
          assert.equal(statements.length, 1)
          for (const location of [fns[0].loc, statements[0]])
            location.end = { line: field.loc.end.line, column: Infinity }
        }
      }
      bind(data)
      assert.deepEqual(data, expected)
      for (const key of ['s', 'f', 'b'])
        for (const part of ['model', 'observed'])
          assert.deepEqual(data[part][key], before[part][key])
      controls++
      const mutations = [
        (d) => {
          d.sourceMap.mappings = ''
        },
        (d) => {
          d.sourceMap.sources = d.sourceMap.sources.map(
            (file) => file + '-foreign'
          )
        },
        (d) => {
          fields(d.emitted)[0].owner.id.name += '-foreign'
        },
        (d) => {
          fields(d.emitted)[0].field.key.name += '-foreign'
        },
        (d) => {
          fields(d.emitted)[0].field.static = true
        },
        (d) => {
          fields(d.emitted)[0].field.computed = true
        },
        (d) => {
          fields(d.emitted)[0].fn.loc.start.column++
        },
        (d) => {
          fields(d.emitted)[0].fn.params[0].loc.start.column++
        },
        (d) => {
          fields(d.emitted)[0].fn.body.body[0].loc.start.column++
        },
        (d) => {
          fields(d.emitted)[0].fn.body.body[0].argument.operator = '?'
        },
        (d) => {
          fields(d.emitted)[1].field.loc.end.column++
        },
        (d) => {
          fields(d.authored)[1].field.loc.end.column++
        },
        (d) => {
          const value = fields(d.emitted)[0]
          value.owner.body.body.push(clone(value.field))
        },
        (d) => {
          const value = Object.values(d.model.fnMap).find((fn) =>
            same(fn.decl.start, fields(d.authored)[0].fn.loc.start)
          )
          d.model.fnMap[999] = clone(value)
          d.model.f[999] = 0
        },
        (d) => {
          const value = Object.values(d.observed.fnMap).find((fn) =>
            same(fn.decl.start, fields(d.authored)[0].fn.loc.start)
          )
          d.observed.fnMap[999] = clone(value)
          d.observed.f[999] = 0
        },
        (d) => {
          Object.values(d.model.statementMap).find((loc) =>
            same(loc.start, fields(d.authored)[1].fn.loc.start)
          ).end.column++
        },
        (d) => {
          Object.values(d.observed.statementMap).find((loc) =>
            same(loc.start, fields(d.authored)[1].fn.loc.start)
          ).end.column++
        },
        (d) => {
          Object.values(d.model.fnMap).find((fn) =>
            same(fn.decl.start, fields(d.authored)[1].fn.loc.start)
          ).loc.end.column++
        },
        (d) => {
          Object.values(d.observed.fnMap).find((fn) =>
            same(fn.decl.start, fields(d.authored)[1].fn.loc.start)
          ).loc.end.column++
        },
        (d) => terminalMap(d, 'missing'),
        (d) => terminalMap(d, 'wrong'),
        (d) => terminalMap(d, 'duplicate'),
      ]
      for (const [index, mutate] of mutations.entries()) {
        const candidate = clone(before)
        mutate(candidate)
        const held = clone(candidate)
        assert.throws(
          () => bind(candidate),
          /class function endpoint is ambiguous or absent/,
          `${kind}/${mode}/${state}/${index}`
        )
        assert.deepEqual(candidate, held)
        controls++
      }
      for (const extension of ['js', 'jsx', 'tsx', 'd.ts', 'd.mts', 'd.cts']) {
        const candidate = clone(before)
        bind(candidate, candidate.file.replace(/\.ts$/, '.' + extension))
        assert.deepEqual(candidate, before)
        controls++
      }
      for (const excluded of [
        'async',
        'generator',
        'named',
        'untyped',
        'computed',
        'anonymous-class',
      ]) {
        const candidate = clone(before)
        for (const tree of [candidate.authored, candidate.emitted])
          for (const value of fields(tree)) {
            if (excluded === 'async') value.fn.async = true
            if (excluded === 'generator') value.fn.generator = true
            if (excluded === 'named')
              value.fn.id = {
                type: 'Identifier',
                name: 'outsideQualifiedShape',
                loc: clone(value.fn.loc),
              }
            if (excluded === 'untyped') delete value.fn.params[0].typeAnnotation
            if (excluded === 'computed') value.field.computed = true
            if (excluded === 'anonymous-class') value.owner.id = null
          }
        const held = clone(candidate)
        bind(candidate)
        assert.deepEqual(candidate, held)
        controls++
      }
    }
console.log(
  JSON.stringify({
    actualFixtures: 8,
    controls,
    countersHeld: true,
    wholeDescriptorsHeldExceptQualifiedEnds: true,
    lateFieldFailureAtomic: true,
  })
)
