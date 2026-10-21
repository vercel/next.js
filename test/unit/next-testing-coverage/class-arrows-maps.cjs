const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const v8 = require('node:v8')
const repo = path.resolve(__dirname, '../../..')
const { parse } = require(repo + '/packages/next/dist/compiled/acorn')
const { parse: parseAuthored } = require(
  repo + '/packages/next/dist/compiled/babel/parser'
)
const { convert } = require(
  repo + '/packages/next/dist/compiled/next-test-coverage'
)
const {
  associateArrowBindings,
  arrowBindingMap,
  bindOriginalArrowLocations,
} = require(
  repo + '/packages/next/dist/experimental/testing/coverage/arrow-bindings'
)
const clone = (value) => v8.deserialize(v8.serialize(value))
function load(mode) {
  const root = path.join(__dirname, 'fixtures/class-arrows/local-arrows')
  const facts = JSON.parse(
    fs.readFileSync(path.join(root, mode, 'facts.json')),
    (key, value) => (key === 'column' && value === null ? Infinity : value)
  )
  facts.source = fs.readFileSync(path.join(root, 'subject.ts.txt'), 'utf8')
  facts.code = fs.readFileSync(path.join(root, mode, 'emitted.js.txt'), 'utf8')
  facts.authored = parseAuthored(facts.source, {
    sourceType: 'module',
    plugins: ['estree', 'typescript'],
  }).program
  facts.emitted = parse(facts.code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
  })
  return facts
}
async function run(data) {
  const associations = associateArrowBindings(
    data.file,
    data.authored,
    data.emitted,
    data.sourceMap
  )
  const observed = (
    await convert({
      code: data.code,
      ast: clone(data.emitted),
      sourceMap: arrowBindingMap(data.file, data.sourceMap, associations),
      coverage: data.coverage,
    })
  )[data.file]
  const model = clone(data.model)
  bindOriginalArrowLocations(data.file, model, observed, associations)
  return { model, observed, associations }
}
async function main() {
  let controls = 0
  for (const mode of ['development', 'production']) {
    const data = clone(load(mode)),
      before = clone(data)
    const result = await run(data)
    assert.equal(result.associations.length, 2)
    assert.deepEqual(data, before)
    for (const key of ['s', 'f', 'b'])
      assert.deepEqual(result.observed[key], data.observed[key])
    for (const id of ['2', '3']) {
      const line = Number(id) + 4
      assert.equal(result.observed.statementMap[id].end.column, Infinity)
      assert.equal(result.observed.statementMap[id].end.line, line)
      assert.equal(result.observed.fnMap[id].loc.end.column, Infinity)
    }
    for (const id of ['5', '6'])
      assert.equal(result.observed.statementMap[id].end.column, Infinity)
    controls++
    const fields = (tree) => {
      const result = []
      function visit(value) {
        if (!value || typeof value !== 'object') return
        if (Array.isArray(value)) return value.forEach(visit)
        if (
          ['ClassProperty', 'PropertyDefinition'].includes(value.type) &&
          value.value?.type === 'ArrowFunctionExpression'
        )
          result.push(value)
        for (const [key, child] of Object.entries(value))
          if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
      }
      visit(tree)
      return result
    }
    const owners = (tree) => {
      const result = []
      function visit(value) {
        if (!value || typeof value !== 'object') return
        if (Array.isArray(value)) return value.forEach(visit)
        if (value.type === 'ClassDeclaration') result.push(value)
        for (const [key, child] of Object.entries(value))
          if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
      }
      visit(tree)
      return result
    }
    const associationMutations = [
      (d) => {
        d.sourceMap.mappings = ''
      },
      (d) => {
        d.sourceMap.sources = d.sourceMap.sources.map(
          (file) => file + '-foreign'
        )
      },
      (d) => {
        owners(d.authored)[0].id.loc.start.column++
      },
      (d) => {
        owners(d.emitted)[0].id.loc.start.column++
      },
      (d) => {
        owners(d.emitted)[0].id.name += 'foreign'
      },
      (d) => {
        fields(d.emitted)[0].key.name += 'foreign'
      },
      (d) => {
        fields(d.emitted)[0].static = true
      },
      (d) => {
        fields(d.authored)[0].computed = true
      },
      (d) => {
        fields(d.emitted)[0].computed = true
      },
      (d) => {
        fields(d.emitted)[0].type = 'Property'
      },
      (d) => {
        fields(d.emitted)[0].loc.end.column++
      },
      (d) => {
        fields(d.authored)[0].loc.end.column++
      },
      (d) => {
        fields(d.emitted)[0].value.loc.start.column++
      },
      (d) => {
        fields(d.emitted)[0].value.params[0].loc.start.column++
      },
      (d) => {
        fields(d.emitted)[0].value.body.loc.start.column++
      },
      (d) => {
        fields(d.emitted)[0].value.body.loc.end.column++
      },
      (d) => {
        fields(d.emitted)[0].value.body.type = 'CallExpression'
      },
      (d) => {
        const owner = owners(d.emitted)[0]
        owner.body.body.push(clone(fields(d.emitted)[0]))
      },
      (d) => {
        fields(d.authored)[1].static = false
      },
      (d) => {
        owners(d.emitted)[0].id = null
      },
      (d) => {
        fields(d.authored)[0].value.params[0].type = 'RestElement'
      },
    ]
    for (const [index, mutate] of associationMutations.entries()) {
      const candidate = clone(data)
      mutate(candidate)
      const held = clone(candidate)
      await assert.rejects(
        run(candidate),
        /compiler-qualified binding maps/,
        mode + ': association mutation ' + index
      )
      assert.deepEqual(candidate, held)
      controls++
    }
    const associations = associateArrowBindings(
      data.file,
      data.authored,
      data.emitted,
      data.sourceMap
    )
    const rebound = (
      await convert({
        code: data.code,
        ast: clone(data.emitted),
        sourceMap: arrowBindingMap(data.file, data.sourceMap, associations),
        coverage: data.coverage,
      })
    )[data.file]
    const endpointMutations = [
      (m, o) => {
        o.statementMap[2].end.column++
      },
      (m) => {
        m.statementMap[2].end.column++
      },
      (m, o) => {
        o.statementMap[5].end.column++
      },
      (m) => {
        m.fnMap[99] = clone(m.fnMap[2])
        m.f[99] = 0
      },
      (m, o) => {
        o.fnMap[99] = clone(o.fnMap[2])
        o.f[99] = 0
      },
      (m, o) => {
        delete o.statementMap[3]
        delete o.s[3]
      },
      (m, o) => {
        o.statementMap[99] = clone(o.statementMap[6])
        o.s[99] = 0
      },
      (m) => {
        m.statementMap[6].end.column++
      },
    ]
    for (const mutate of endpointMutations) {
      const model = clone(data.model),
        observed = clone(rebound)
      mutate(model, observed)
      const held = clone({ model, observed })
      assert.throws(
        () =>
          bindOriginalArrowLocations(data.file, model, observed, associations),
        /ambiguous or absent/
      )
      assert.deepEqual({ model, observed }, held)
      controls++
    }
  }
  process.stdout.write(JSON.stringify({ controls, passed: controls }) + '\n')
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
