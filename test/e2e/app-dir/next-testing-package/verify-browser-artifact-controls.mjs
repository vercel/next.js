import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { assertBrowserArtifacts } from './browser-artifact-verifier.mjs'

// Synthetic verifier controls, not browser/compiler/runtime acceptance.
const output = resolve(process.argv[2])
mkdirSync(output)
const consumer = join(output, 'consumer')
mkdirSync(consumer)
for (const file of ['js.case.js', 'ts.case.ts'])
  writeFileSync(join(consumer, file), '')
const expected = new Map([
  ['JavaScript case', 'js.case.js'],
  ['TypeScript case', 'ts.case.ts'],
])
function record(name, file, id) {
  const scope = {
    version: 1,
    timestamp: 0,
    runId: 'control',
    entryId: file,
    caseId: `case-${id}`,
    attempt: { id: `attempt-${id}`, retry: 0, repeat: 0 },
  }
  const events = [
    {
      ...scope,
      type: 'file-start',
      entry: { id: file, file: join(consumer, file) },
    },
  ]
  for (const [kind, signature] of [
    ['screenshot', '89504e470d0a1a0a'],
    ['trace', '504b0304'],
  ]) {
    const path = join(output, `${id}-${kind}`)
    writeFileSync(path, Buffer.from(signature, 'hex'))
    events.push({ ...scope, type: 'attachment', attachment: { kind, path } })
  }
  return JSON.parse(
    JSON.stringify([
      ...events,
      {
        ...scope,
        type: 'case-end',
        name,
        status: 'passed',
        durationMs: 1,
        errors: [],
      },
    ])
  )
}
const javascript = record('JavaScript case', 'js.case.js', 'javascript')
const typescript = record('TypeScript case', 'ts.case.ts', 'typescript')
const duplicate = record(
  'JavaScript case',
  'js.case.js',
  'different-case-and-attempt'
)
const options = { expected, consumer, project: 'control' }
const positive = [...javascript, ...typescript]
writeFileSync(join(output, 'positive.json'), JSON.stringify(positive))
assert.equal(assertBrowserArtifacts(positive, options).length, 4)
const substituted = [...javascript, ...duplicate]
writeFileSync(
  join(output, 'duplicate-js-missing-ts.json'),
  JSON.stringify(substituted)
)
assert.throws(
  () => assertBrowserArtifacts(substituted, options),
  /Duplicate expected browser case: JavaScript case/
)
writeFileSync(join(output, 'missing-ts.json'), JSON.stringify(javascript))
assert.throws(
  () => assertBrowserArtifacts(javascript, options),
  /Missing expected browser name\/file pair/
)
for (const [name, mutate, message] of [
  [
    'wrong-run',
    (events) => {
      events[1].runId = 'different-run'
    },
    /Artifact must belong/,
  ],
  [
    'wrong-attempt',
    (events) => {
      events[1].attempt.id = 'different-attempt'
    },
    /Artifact must belong/,
  ],
  [
    'late-artifact',
    (events) => {
      events.push(events.splice(1, 1)[0])
    },
    /Artifact must precede/,
  ],
]) {
  const events = structuredClone(positive)
  mutate(events)
  writeFileSync(join(output, `${name}.json`), JSON.stringify(events))
  assert.throws(() => assertBrowserArtifacts(events, options), message)
}
writeFileSync(
  join(output, 'passed.json'),
  JSON.stringify(
    {
      synthetic: true,
      actualBrowserExecuted: false,
      controls: [
        'distinct JS and TS accepted',
        'duplicate JS with unique case/attempt/artifacts rejects missing TS',
        'missing TS rejects',
        'wrong run and attempt attribution reject',
        'artifact after terminal case rejects',
      ],
    },
    null,
    2
  )
)
console.log('Browser artifact verifier controls passed')
