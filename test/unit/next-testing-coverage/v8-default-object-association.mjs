import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
fs.mkdirSync(output, { recursive: true })
const fixture = JSON.parse(
  fs.readFileSync(
    new URL(
      './fixtures/istanbul-provider/v8-default-object-pristine.json',
      import.meta.url
    )
  )
)
const load = createRequire(consumer + '/package.json'),
  nextRoot = dirname(load.resolve('next/package.json')),
  lib = nextRoot + '/dist/experimental/testing',
  code = fixture.code,
  raw = fixture.sourceMap,
  decoded = load(lib + '/coverage/maps').decodeCoverageMap(raw),
  { SourceMapGenerator } = load('next/dist/compiled/source-map'),
  map = new SourceMapGenerator()
assert.equal(
  createHash('sha256').update(code).digest('hex'),
  fixture.codeSHA256
)
for (const m of decoded.mappings) {
  const generated = { line: m.generatedLine, column: m.generatedColumn }
  if (m.source === null) map.addMapping({ generated })
  else
    map.addMapping({
      generated,
      source: fileURLToPath(m.source),
      original: { line: m.originalLine, column: m.originalColumn },
    })
}
let file, source
for (const [identity, content] of decoded.sources) {
  file = fileURLToPath(identity)
  source = content
  map.setSourceContent(file, content)
}
const { bindDefaultObjectInitializer: associateDefaultObject } = load(
  lib + '/coverage/default-object'
)
assert.equal(
  createHash('sha256').update(fixture.sourceMapBytes).digest('hex'),
  fixture.sourceMapSHA256
)
assert.deepEqual(JSON.parse(fixture.sourceMapBytes), fixture.sourceMap)
const sourceMap = JSON.parse(map.toString()),
  { parse } = load('next/dist/compiled/acorn'),
  parseJS = (s) =>
    parse(s, { ecmaVersion: 'latest', sourceType: 'module', locations: true }),
  ast = parseJS(code),
  authored = parseJS(source),
  { convert } = load('next/dist/compiled/next-test-coverage'),
  functions = fixture.functions,
  model = await load(lib + '/coverage/istanbul').createUncoveredJavaScript(
    file,
    source
  ),
  generated = (
    await convert({
      code,
      ast,
      sourceMap,
      coverage: {
        url: pathToFileURL('/actual-retained-serializer.js').href,
        functions,
      },
    })
  )[file],
  snapshot = structuredClone(generated),
  result = associateDefaultObject(
    file,
    model,
    generated,
    authored,
    ast,
    sourceMap
  )
assert.notEqual(result, generated)
assert.deepEqual(generated, snapshot)
assert.equal(Object.keys(result.statementMap).length, 2)
assert.deepEqual(result.s, { 1: 1, 2: 1 })
assert.deepEqual(result.f, generated.f)
assert.deepEqual(result.b, generated.b)
const cases = []
function negative(name, fn) {
  assert.throws(fn, /ambiguous or absent/)
  cases.push(name)
}
negative('changed semantic method body', () => {
  const a = structuredClone(ast)
  const walk = (v) => {
    if (!v || typeof v !== 'object') return
    if (v.type === 'Literal' && v.value === 'SPECIAL(') v.value = 'CHANGED('
    for (const [k, c] of Object.entries(v))
      if (k !== 'loc') Array.isArray(c) ? c.forEach(walk) : walk(c)
  }
  walk(a)
  return associateDefaultObject(file, model, generated, authored, a, sourceMap)
})
negative('duplicate emitted object binding', () => {
  const a = structuredClone(ast),
    body = a.body[0].expression.right.elements[1].body.body
  const declaration = body.find((n) => n.type === 'VariableDeclaration')
  body.push(structuredClone(declaration))
  return associateDefaultObject(file, model, generated, authored, a, sourceMap)
})
negative('missing mapping', () =>
  associateDefaultObject(file, model, generated, authored, ast, {
    version: 3,
    sources: [],
    names: [],
    mappings: '',
  })
)
negative('borrowed file mapping', () =>
  associateDefaultObject(
    file + '-foreign',
    model,
    generated,
    authored,
    ast,
    sourceMap
  )
)
negative('duplicate extra statement', () => {
  const data = structuredClone(generated)
  data.statementMap[99] = structuredClone(data.statementMap[0])
  data.s[99] = 1
  return associateDefaultObject(file, model, data, authored, ast, sourceMap)
})
negative('missing actual counter', () => {
  const data = structuredClone(generated)
  delete data.s[0]
  return associateDefaultObject(file, model, data, authored, ast, sourceMap)
})
negative('different converter occurrence metadata', () => {
  const data = structuredClone(generated)
  data.meta.seen['s:1:15:4:Infinity'] = 99
  return associateDefaultObject(file, model, data, authored, ast, sourceMap)
})
negative('borrowed initializer end', () => {
  const data = structuredClone(generated)
  data.statementMap[0].end.line++
  return associateDefaultObject(file, model, data, authored, ast, sourceMap)
})
const ordinary = parseJS(
  'const serializer = ' + source.slice('export default '.length)
)
assert.equal(
  associateDefaultObject(file, model, generated, ordinary, ast, sourceMap),
  generated
)
cases.push('authored const unchanged')
const noExtra = {
  ...generated,
  statementMap: { 1: generated.statementMap[1], 2: generated.statementMap[2] },
  s: { 1: 1, 2: 1 },
}
assert.equal(
  associateDefaultObject(file, model, noExtra, authored, ast, sourceMap),
  noExtra
)
cases.push('no initializer counter unchanged')
fs.writeFileSync(
  output + '/VERIFIED.json',
  JSON.stringify(
    {
      uniqueActualSemanticSubtree: true,
      exactObjectClosingKeysAndReturns: true,
      rawDataUnchanged: true,
      actualInitializerExcludedOnly: true,
      authoredHitsUnchanged: true,
      remainingStatements: 2,
      functions: 2,
      negativeControls: cases,
      existingStrictCountChecksRetained: true,
    },
    null,
    2
  ) + '\n'
)
console.log(
  JSON.stringify({ positive: 1, controls: cases.length, rawPreserved: true })
)
