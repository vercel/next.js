const fs = require('node:fs'),
  path = require('node:path'),
  v8 = require('node:v8'),
  assert = require('node:assert/strict')
const repo = path.resolve(__dirname, '../../..'),
  consumer = path.join(repo, 'packages/next'),
  { decodeCoverageMap } = require(
    consumer + '/dist/experimental/testing/coverage/maps.js'
  ),
  { SourceMapGenerator } = require(consumer + '/dist/compiled/source-map'),
  { parse } = require(consumer + '/dist/compiled/acorn'),
  { parse: parseAuthored } = require(consumer + '/dist/compiled/babel/parser'),
  { bindParameterPropertyModel: bind } = require(
    consumer + '/dist/experimental/testing/coverage/parameter-properties'
  ),
  clone = (x) => v8.deserialize(v8.serialize(x))
function load(kind, mode) {
  const dir = path.join(__dirname, 'fixtures/parameter-property-calls', kind),
    facts = JSON.parse(
      fs.readFileSync(path.join(dir, mode, 'facts.json')),
      (key, value) => (key === 'column' && value === null ? Infinity : value)
    ),
    source = fs.readFileSync(path.join(dir, 'subject.ts.txt'), 'utf8'),
    authored = parseAuthored(source, {
      sourceType: 'module',
      plugins: ['estree', 'typescript'],
    }).program,
    emitted = parse(
      fs.readFileSync(path.join(dir, mode, 'emitted.js.txt'), 'utf8'),
      { ecmaVersion: 'latest', sourceType: 'module', locations: true }
    )
  return clone([
    facts.file,
    source,
    authored,
    emitted,
    facts.sourceMap,
    facts.model,
    facts.observed,
  ])
}
function nodes(t) {
  const out = []
  function visit(x) {
    if (!x || typeof x !== 'object') return
    if (Array.isArray(x)) return x.forEach(visit)
    if (x.type) out.push(x)
    for (const [k, v] of Object.entries(x))
      if (!['loc', 'comments', 'tokens'].includes(k)) visit(v)
  }
  visit(t)
  return out
}
function call(a) {
  return nodes(a[2]).find((n) => n.type === 'TSParameterProperty').parameter
    .right
}
function emittedCall(a) {
  return nodes(a[3]).find(
    (n) => n.type === 'MethodDefinition' && n.kind === 'constructor'
  ).value.params[0].right
}
function map(a, mutate) {
  const decoded = decodeCoverageMap(a[4]),
    gen = new SourceMapGenerator()
  for (const [s, c] of decoded.sources)
    if (c !== null) gen.setSourceContent(s, c)
  for (const point of decoded.mappings) {
    const point2 = mutate({ ...point })
    for (const p of Array.isArray(point2) ? point2 : [point2])
      if (p)
        gen.addMapping({
          generated: { line: p.generatedLine, column: p.generatedColumn },
          ...(p.source === null
            ? {}
            : {
                source: p.source,
                original: { line: p.originalLine, column: p.originalColumn },
                ...(p.name ? { name: p.name } : {}),
              }),
        })
  }
  a[4] = gen.toJSON()
}
const rows = []
let controls = 0
for (const kind of ['executed', 'untouched'])
  for (const mode of ['development', 'production']) {
    const input = load(kind, mode),
      before = clone(input),
      result = bind(...input)
    assert.deepEqual(input, before)
    for (const key of ['s', 'f', 'b'])
      assert.deepEqual(result.observed[key], input[6][key])
    assert.equal(
      Object.keys(result.original.statementMap).length,
      Object.keys(input[6].statementMap).length
    )
    controls++
    const tests = [
      [
        'missing call start',
        (a) => {
          const loc = emittedCall(a).loc.start
          map(a, (p) =>
            p.generatedLine === loc.line && p.generatedColumn === loc.column
              ? null
              : p
          )
        },
      ],
      [
        'missing call end',
        (a) => {
          const loc = emittedCall(a).loc.end
          map(a, (p) =>
            p.generatedLine === loc.line && p.generatedColumn === loc.column
              ? null
              : p
          )
        },
      ],
      [
        'foreign call start',
        (a) => {
          const loc = emittedCall(a).loc.start
          map(a, (p) =>
            p.generatedLine === loc.line && p.generatedColumn === loc.column
              ? { ...p, source: p.source + '-foreign' }
              : p
          )
        },
      ],
      [
        'wrong call end',
        (a) => {
          const loc = emittedCall(a).loc.end
          map(a, (p) =>
            p.generatedLine === loc.line && p.generatedColumn === loc.column
              ? { ...p, originalColumn: p.originalColumn + 1 }
              : p
          )
        },
      ],
      [
        'duplicate call start',
        (a) => {
          const loc = emittedCall(a).loc.start
          map(a, (p) =>
            p.generatedLine === loc.line && p.generatedColumn === loc.column
              ? [p, { ...p, name: 'duplicate-role' }]
              : p
          )
          assert.equal(
            decodeCoverageMap(a[4]).mappings.filter(
              (p) =>
                p.generatedLine === loc.line && p.generatedColumn === loc.column
            ).length,
            2
          )
        },
      ],
      [
        'authored optional',
        (a) => {
          call(a).optional = true
        },
      ],
      [
        'generated optional',
        (a) => {
          emittedCall(a).optional = true
        },
      ],
      [
        'authored member',
        (a) => {
          call(a).callee.type = 'MemberExpression'
        },
      ],
      [
        'generated member',
        (a) => {
          emittedCall(a).callee.type = 'MemberExpression'
        },
      ],
      [
        'authored argument',
        (a) => {
          call(a).arguments.push(clone(call(a).callee))
        },
      ],
      [
        'generated argument',
        (a) => {
          emittedCall(a).arguments.push(clone(emittedCall(a).callee))
        },
      ],
      [
        'foreign generated callee',
        (a) => {
          emittedCall(a).callee.name += 'Other'
        },
      ],
      [
        'duplicate authored call',
        (a) => {
          a[2].body.push(clone(call(a)))
        },
      ],
      [
        'duplicate generated call',
        (a) => {
          a[3].body.push(clone(emittedCall(a)))
        },
      ],
      [
        'wrong parameter assignment',
        (a) => {
          const n = nodes(a[3]).find(
            (n) =>
              n.type === 'AssignmentExpression' &&
              n.left?.object?.type === 'ThisExpression'
          )
          n.right.name += 'Other'
        },
      ],
      [
        'wrong branch endpoint',
        (a) => {
          Object.values(a[6].branchMap)[0].loc.end.column++
        },
      ],
      [
        'missing model metadata',
        (a) => {
          delete a[5].meta
        },
      ],
    ]
    for (const [label, mutate] of tests) {
      const a = clone(input)
      mutate(a)
      const before = clone(a)
      assert.throws(
        () => bind(...a),
        /cannot associate generated TSParameterProperty bodies/,
        label
      )
      assert.deepEqual(a, before, label)
      controls++
    }
    rows.push({
      file: input[0],
      positive: true,
      refusals: tests.map(([name]) => name),
      allInputsUnchanged: true,
      countersUnchanged: true,
    })
  }
console.log(JSON.stringify({ controls, passed: controls }))
