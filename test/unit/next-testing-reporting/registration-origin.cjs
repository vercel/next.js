const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { fileURLToPath, pathToFileURL } = require('node:url')
require('next/dist/server/node-environment-baseline')
const {
  SourceMapConsumer,
  SourceMapGenerator,
} = require('next/dist/compiled/source-map')
const {
  createArtifactSourceMapLookup,
} = require('next/dist/experimental/testing/execution/source-maps')
const {
  createArtifactRegistrationOriginMapper,
} = require('next/dist/experimental/testing/execution/registration-origin')
const {
  serializeSourceMappedDiagnostic,
} = require('next/dist/experimental/testing/reporting/source-mapped-diagnostics')
const {
  setBundlerFindSourceMapImplementation,
} = require('next/dist/server/patch-error-inspect')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'next-registration-origin-'))
let checks = 0
try {
  for (const mode of ['development', 'production']) {
    const fixture = path.join(__dirname, 'fixtures/registration-origin', mode)
    const facts = JSON.parse(fs.readFileSync(fixture + '.facts.json', 'utf8'))
    const raw = JSON.parse(fs.readFileSync(fixture + '.js.map', 'utf8'))
    const code = fs.readFileSync(fixture + '.js.txt', 'utf8')
    assert.equal(sha(code), facts.codeHash)
    assert.equal(sha(fs.readFileSync(fixture + '.js.map')), facts.mapHash)
    const dir = path.join(root, mode)
    fs.mkdirSync(dir)
    const chunk = path.join(dir, 'entry.js')
    fs.writeFileSync(chunk, code)
    fs.writeFileSync(chunk + '.map', JSON.stringify(raw))
    const entry = fileURLToPath(
      new URL(facts.source, pathToFileURL(chunk + '.map'))
    )
    const consumer = new SourceMapConsumer(raw)
    const source = consumer.sourceContentFor(facts.source, true)
    assert.equal(sha(source), facts.inputHash)
    const artifact = {
      version: 2,
      kind: 'node',
      entryId: mode,
      revision: 'actual-native-fixture',
      rootDir: dir,
      files: ['entry.js', 'entry.js.map'],
      entryPath: 'entry.js',
      profile: {
        id: mode,
        mode,
        environment: 'node',
        runtime: 'nodejs',
        bundler: 'turbopack',
      },
      sourceHash: facts.inputHash,
      diagnostics: [],
    }
    const error = new Error('retained body timeout')
    error.stack = `Error: retained body timeout\n    at declaration (${chunk}:${facts.generated.line}:${facts.generated.column0 + 1})\n    at following (node:internal/process/task_queues:104:5)`
    const descriptors = Object.getOwnPropertyDescriptors(error)
    const lookup = createArtifactSourceMapLookup(artifact)
    setBundlerFindSourceMapImplementation(lookup)
    const baseline = serializeSourceMappedDiagnostic(error, {
      phase: 'runtime',
    })
    const origin = createArtifactRegistrationOriginMapper(
      artifact,
      entry
    )(error)
    assert.deepEqual(origin, {
      location: { file: entry, ...facts.expected },
      source,
    })
    checks++
    const corrected = serializeSourceMappedDiagnostic(error, {
      phase: 'runtime',
      registrationOrigin: origin,
    })
    assert.deepEqual(Object.keys(corrected), Object.keys(baseline))
    assert.equal(corrected.stack, baseline.stack)
    assert.equal(corrected.frames[0].line, facts.expected.line)
    assert.equal(corrected.frames[0].column, facts.expected.column)
    assert.deepEqual(corrected.frames.slice(1), baseline.frames.slice(1))
    assert.deepEqual(Object.getOwnPropertyDescriptors(error), descriptors)
    assert.equal(
      JSON.stringify(corrected).includes('registrationOrigin'),
      false
    )
    checks++
    assert.deepEqual(
      serializeSourceMappedDiagnostic(error, { phase: 'runtime' }),
      baseline
    )
    assert.deepEqual(
      serializeSourceMappedDiagnostic(error, {
        phase: 'runtime',
        registrationOrigin: {
          ...origin,
          location: { ...origin.location, file: '/another-entry.ts' },
        },
      }),
      baseline
    )
    checks++
    for (const bad of [
      { ...artifact, sourceHash: '0'.repeat(64) },
      { ...artifact, sourceHash: undefined },
      {
        ...artifact,
        kind: 'rsc',
        profile: { ...artifact.profile, environment: 'rsc' },
      },
      { ...artifact, files: ['entry.js'] },
    ]) {
      assert.equal(
        createArtifactRegistrationOriginMapper(bad, entry)(error),
        undefined
      )
      checks++
    }
    assert.equal(
      createArtifactRegistrationOriginMapper(
        artifact,
        entry + '.foreign'
      )(error),
      undefined
    )
    checks++
    // A real map's raw mappings remain untouched above. Mutated negative maps
    // below withhold the call start or change every argument role.
    const mappings = []
    consumer.eachMapping((m) => mappings.push(m))
    const { parse } = require('next/dist/compiled/babel/parser')
    const calls = []
    function walk(v) {
      if (!v || typeof v !== 'object') return
      if (Array.isArray(v)) return v.forEach(walk)
      if (v.type === 'CallExpression') calls.push(v)
      for (const [k, c] of Object.entries(v))
        if (!['loc', 'comments', 'tokens'].includes(k)) walk(c)
    }
    walk(
      parse(code, {
        sourceType: 'unambiguous',
        createParenthesizedExpressions: true,
      })
    )
    const point = {
      line: facts.generated.line,
      column: facts.generated.column0,
    }
    const cmp = (a, b) => a.line - b.line || a.column - b.column
    const generated = calls.filter(
      (c) =>
        cmp(c.callee.loc.start, point) <= 0 && cmp(point, c.callee.loc.end) <= 0
    )
    assert.equal(generated.length, 1)
    for (const failure of ['missing-call-start', 'wrong-argument-roles']) {
      const map = new SourceMapGenerator()
      for (const m of mappings) {
        if (
          failure === 'missing-call-start' &&
          m.generatedLine === generated[0].loc.start.line &&
          m.generatedColumn === generated[0].loc.start.column
        )
          continue
        map.addMapping({
          generated: { line: m.generatedLine, column: m.generatedColumn },
          ...(m.source && m.originalLine !== null
            ? {
                source: m.source,
                original: {
                  line:
                    failure === 'wrong-argument-roles'
                      ? m.originalLine + 100
                      : m.originalLine,
                  column: m.originalColumn,
                },
                ...(m.name ? { name: m.name } : {}),
              }
            : {}),
        })
      }
      for (const name of consumer.sources)
        map.setSourceContent(name, consumer.sourceContentFor(name, true))
      fs.writeFileSync(chunk + '.map', JSON.stringify(map.toJSON()))
      setBundlerFindSourceMapImplementation(
        createArtifactSourceMapLookup(artifact)
      )
      assert.equal(
        createArtifactRegistrationOriginMapper(artifact, entry)(error),
        undefined
      )
      checks++
    }
    fs.writeFileSync(chunk + '.map', JSON.stringify(raw))
    const duplicate = structuredClone(raw)
    function owning(map) {
      return map.sections
        ? map.sections.map((s) => owning(s.map)).find(Boolean)
        : map.sources?.includes(facts.source)
          ? map
          : undefined
    }
    const leaf = owning(duplicate)
    const sourceIndex = leaf.sources.indexOf(facts.source)
    leaf.sources.push(facts.source)
    leaf.sourcesContent.push(leaf.sourcesContent[sourceIndex])
    fs.writeFileSync(chunk + '.map', JSON.stringify(duplicate))
    setBundlerFindSourceMapImplementation(
      createArtifactSourceMapLookup(artifact)
    )
    assert.equal(
      createArtifactRegistrationOriginMapper(artifact, entry)(error),
      undefined
    )
    checks++
    fs.writeFileSync(chunk + '.map', JSON.stringify(raw))
    setBundlerFindSourceMapImplementation((file) =>
      file.includes('foreign-helper')
        ? {
            version: 3,
            sources: ['file:///foreign-helper.ts'],
            sourcesContent: ['register()'],
            names: [],
            mappings: 'AAAA',
          }
        : lookup(file)
    )
    const foreign = new Error('foreign registration helper')
    foreign.stack = `Error: foreign\n    at helper (/foreign-helper.js:1:1)\n    at declaration (${chunk}:${facts.generated.line}:${facts.generated.column0 + 1})`
    assert.equal(
      createArtifactRegistrationOriginMapper(artifact, entry)(foreign),
      undefined
    )
    checks++
  }
  process.stdout.write(JSON.stringify({ profiles: 2, checks }))
} finally {
  setBundlerFindSourceMapImplementation(() => undefined)
  fs.rmSync(root, { recursive: true, force: true })
}
