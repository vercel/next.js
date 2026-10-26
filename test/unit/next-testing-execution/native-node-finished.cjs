const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { pathToFileURL } = require('node:url')
const [base, output] = process.argv.slice(2)
;(async () => {
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    pathToFileURL(
      path.join(
        __dirname,
        '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
      )
    ).href
  )
  fs.mkdirSync(output, { recursive: true })
  const harness = fs.mkdtempSync(path.join(os.tmpdir(), 'next-node-finished-'))
  try {
    for (const name of [
      'native-coverage.cjs',
      'native-coverage-entry.cjs',
      'native-coverage-preload.cjs',
    ])
      fs.copyFileSync(path.join(__dirname, name), path.join(harness, name))
    const entry = fs.readFileSync(
      path.join(harness, 'native-coverage-entry.cjs')
    )
    assert.deepEqual(
      entry,
      fs.readFileSync(path.join(__dirname, 'native-coverage-entry.cjs'))
    )
    const helperPath = path.join(harness, 'native-coverage.cjs')
    let helper = fs.readFileSync(helperPath, 'utf8')
    const envAnchor =
      "NODE_OPTIONS: '--require ' + path.join(rootDir, 'preload.cjs'),"
    assert(helper.includes(envAnchor))
    helper = helper.replace(
      envAnchor,
      "NODE_OPTIONS: [process.env.NODE_OPTIONS, '--require ' + path.join(rootDir, 'preload.cjs')].filter(Boolean).join(' '),"
    )
    fs.writeFileSync(helperPath, helper)
    const preloadPath = path.join(harness, 'native-coverage-preload.cjs')
    let preload = fs.readFileSync(preloadPath, 'utf8')
    const terminalAnchor =
      "record({ event: 'terminal', coverageComplete: message.coverage?.complete })"
    assert(preload.includes(terminalAnchor))
    preload = preload.replace(
      terminalAnchor,
      "record({ event: 'terminal', coverageComplete: message.coverage?.complete, keys: Object.keys(message).sort(), hasModuleCompletion: Object.hasOwn(message, 'moduleCompletion'), nativeFields: Object.keys(message).filter(key => /native|body.*settlement/i.test(key)) })"
    )
    fs.writeFileSync(preloadPath, preload)
    const owner = await runOwnedNode([helperPath, base, 'body', output], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'development' },
      auditDir: path.join(output, 'owners'),
      timeoutMs: 30000,
    })
    fs.writeFileSync(
      path.join(output, 'OWNER.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    assertOwnedNodeCompleted(owner, 'actual Node finished assertion')
    assert.equal(owner.status, 0, owner.stderr)
    const actual = JSON.parse(fs.readFileSync(path.join(output, 'body.json')))
    const cases = actual.events.filter((event) => event.type === 'case-end')
    assert.deepEqual(
      cases.map((event) => event.status),
      ['failed', 'passed']
    )
    assert.equal(cases[0].errors.length, 1)
    assert.equal(cases[0].errors[0].phase, 'runtime')
    const reference = require('./native-node-finished-pristine.json').rows.find(
      (row) => row.name === 'original'
    )
    const expectedMessage =
      reference.cases.testResults[0].assertionResults[0].failureMessages[0].split(
        '\n    at '
      )[0]
    assert.equal('Error: ' + cases[0].errors[0].message, expectedMessage)
    const unhandled = actual.events.filter(
      (event) =>
        event.type === 'diagnostic' &&
        event.diagnostic.unhandled === 'rejection'
    )
    assert.equal(unhandled.length, 1)
    assert.equal(
      unhandled[0].diagnostic.message,
      'expected 1 to be 2 // Object.is equality'
    )
    const terminal = actual.trace.find((row) => row.event === 'terminal')
    assert.equal(terminal.coverageComplete, true)
    assert.equal(terminal.hasModuleCompletion, false)
    assert.deepEqual(terminal.nativeFields, [])
    assert.equal('moduleResult' in actual.result, false)
    assert.equal(actual.completions.length, 1)
    fs.writeFileSync(
      path.join(output, 'CHECKS.json'),
      JSON.stringify(
        {
          actualNativeInspector: true,
          originalAuthoredEntryUnchanged: true,
          genuineFinishedAssertionFailure: true,
          actualNativeRunErrorPreserved: true,
          noRequestedModuleOrNativeWireMetadata: true,
          actualCoverageComplete: true,
          inheritedAuditPreserved: true,
          allOwnersJoined: true,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    fs.rmSync(harness, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
