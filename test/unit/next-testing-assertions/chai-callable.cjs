const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createRequire } = require('node:module')

const families = {
  data: ['default', 'disabled', 'forwarding', 'forwarding-disabled'],
  name: ['default', 'proxy-disabled', 'proxify', 'proxify-disabled'],
  fields: ['default', 'disabled'],
  intrinsic: ['default', 'disabled'],
}
function expectedCases(kind, family) {
  if (kind === 'name') return family.startsWith('proxify') ? 2 : 3
  return kind === 'intrinsic' || family.startsWith('forwarding') ? 3 : 2
}
function readFixture(kind, family) {
  assert(families[kind]?.includes(family))
  const disabled = family.endsWith('disabled')
  const body = disabled
    ? family.startsWith('forwarding')
      ? 'forwarding'
      : family.startsWith('proxify')
        ? 'proxify'
        : 'default'
    : family
  const lines = fs
    .readFileSync(
      path.join(
        __dirname,
        `fixtures/chai-callable-${kind}`,
        body,
        'runtime.test.mjs.txt'
      ),
      'utf8'
    )
    .split('\n')
  if (disabled) lines.splice(2, 0, 'chai.config.useProxy = false')
  return lines.join('\n')
}
async function runPrivate(kind, configure) {
  const [project, output, family = 'default'] = process.argv.slice(2)
  assert(project)
  const body = readFixture(kind, family)
  const contract = configure(family)
  const req = createRequire(path.join(project, 'package.json'))
  const next = path.dirname(req.resolve('next/package.json'))
  req(next + '/dist/server/node-environment-baseline')
  const runner = req(next + '/dist/experimental/testing/runner')
  const vitest = req(next + '/dist/experimental/testing/vitest')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `next-chai-${kind}-`))
  const file = runner.initializeTestFile({
    fileId: `actual-chai-${kind}`,
    filePath: path.join(dir, 'actual.test.mjs'),
  })
  const cases = []
  try {
    let captured
    await file.collect(async () => {
      captured = new Function(
        'vitest',
        'assert',
        '"use strict";const{expect,test,chai,afterAll}=vitest;\n' +
          body.split('\n').slice(2).join('\n') +
          '\nreturn ' +
          contract.capture
      )(vitest, assert)
    })
    const result = await file.run({
      runId: `actual-chai-${kind}-run`,
      signal: new AbortController().signal,
      onCaseResult(_task, value) {
        cases.push({
          name: value.name,
          state: value.status,
          errors: value.errors,
        })
      },
    })
    assert.equal(result.interrupted, false)
    assert.deepEqual(result.errors, [])
    assert.equal(cases.length, expectedCases(kind, family))
    assert.equal(new Set(cases.map((value) => value.name)).size, cases.length)
    assert(
      cases.every(
        (value) => value.state === 'passed' && value.errors.length === 0
      )
    )
    await contract.verify(captured, () => file.dispose())
    const facts = {
      cases: cases.length,
      behaviorAssertions: true,
      actualFileDisposalJoined: true,
      ...contract.facts,
    }
    if (output)
      fs.writeFileSync(
        output,
        JSON.stringify({ cases, ...facts }, null, 2) + '\n'
      )
    process.stdout.write(JSON.stringify(facts) + '\n')
  } finally {
    await file.dispose()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
module.exports = { families, expectedCases, readFixture, runPrivate }
