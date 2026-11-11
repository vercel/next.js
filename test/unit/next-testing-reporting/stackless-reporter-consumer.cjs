const assert = require('node:assert/strict')
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os')
const { createRequire } = require('node:module'),
  { pathToFileURL } = require('node:url'),
  { fork } = require('node:child_process'),
  { serialize } = require('node:v8'),
  { createHash } = require('node:crypto')
const driver = process.argv[2] === '--driver',
  args = process.argv.slice(driver ? 3 : 2),
  [project, output, family = 'default'] = args
assert(project && output && ['default', 'falsy'].includes(family))
;(async () => {
  if (!driver) {
    fs.mkdirSync(output, { recursive: true })
    const { runOwnedNode, assertOwnedNodeCompleted } = await import(
      pathToFileURL(
        path.resolve(
          __dirname,
          '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
        )
      ).href
    )
    const value = await runOwnedNode(
      [__filename, '--driver', project, output, family],
      {
        cwd: project,
        env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' },
        auditDir: path.join(output, 'owners'),
        timeoutMs: 20000,
      }
    )
    fs.writeFileSync(
      path.join(output, 'OWNER.json'),
      JSON.stringify(value, null, 2) + '\n'
    )
    fs.writeFileSync(path.join(output, 'stdout.log'), value.stdout)
    fs.writeFileSync(path.join(output, 'stderr.log'), value.stderr)
    assertOwnedNodeCompleted(value, 'actual stackless reporter consumer')
    assert.equal(value.status, 0, value.stderr)
    console.log(value.stdout.trim())
    return
  }
  const req = createRequire(path.join(project, 'package.json')),
    next = path.dirname(req.resolve('next/package.json'))
  req(next + '/dist/server/node-environment-baseline')
  const { createCollector } = req(
      next + '/dist/experimental/testing/runner/collector'
    ),
    { runCollected } = req(
      next + '/dist/experimental/testing/runner/lifecycle'
    ),
    { captureReporterTaskTree } = req(
      next + '/dist/experimental/testing/reporting/live-tasks'
    )
  const input = path.join(
      __dirname,
      family === 'falsy'
        ? 'fixtures/stackless-projection-falsy'
        : 'fixtures/stackless-projection'
    ),
    model = JSON.parse(
      fs.readFileSync(path.join(input, 'reference.json'), 'utf8')
    ),
    body = fs.readFileSync(path.join(input, model.source), 'utf8')
  assert.equal(
    createHash('sha256').update(body).digest('hex'),
    model.bodySHA256
  )
  const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'next-stackless-reporter-')
    ),
    collector = createCollector('stackless-file'),
    snapshots = [],
    logical = []
  const header = body.slice(0, body.indexOf('\n') + 1)
  assert(header === "import { test } from 'vitest'\n")
  new Function('test', '"use strict";\n' + body.slice(header.length))(
    collector.api.test
  )
  const result = await runCollected(
    collector.close(),
    {
      runId: 'stackless-consumer-run',
      signal: new AbortController().signal,
      filePath: path.join(dir, 'probe.test.mjs'),
      onCollected(file) {
        snapshots.push(captureReporterTaskTree(file))
      },
      onCaseResult(task, value) {
        snapshots.push(captureReporterTaskTree(task.file))
        logical.push({ ...value, publicErrors: task.result?.errors ?? [] })
      },
    },
    () => {}
  )
  assert.equal(result.interrupted, false)
  assert.deepEqual(result.errors, [])
  assert.equal(logical.length, family === 'falsy' ? 4 : 6)
  assert(logical.every((value) => value.status === 'failed'))
  const root = snapshots[0],
    profile = {
      id: 'node',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    },
    completion = {
      entries: [{ entry: { id: root.id, file: root.filepath, profile } }],
      files: [
        {
          entryId: root.id,
          file: root.filepath,
          status: 'failed',
          durationMs: 0,
        },
      ],
      suites: [],
      cases: logical.map((value) => ({ ...value, errors: value.publicErrors })),
      events: logical.map((value) => ({
        type: 'case-end',
        entryId: root.id,
        caseId: value.caseId,
        errors: value.publicErrors,
      })),
      status: 'failed',
    }
  const raw = serialize({ snapshots, completion }),
    trace = path.join(output, 'rows.jsonl'),
    closed = path.join(output, 'closed')
  fs.writeFileSync(trace, '')
  const reporter = path.join(dir, 'observer.mjs')
  fs.writeFileSync(
    reporter,
    `import{appendFileSync,writeFileSync}from'node:fs';const save=x=>appendFileSync(${JSON.stringify(trace)},JSON.stringify(x)+'\\n');const row=(test,phase)=>{const one=test.result(),two=test.result(),errors=one.errors??[];save({phase,name:test.fullName,state:one.state,sameArray:one.errors===two.errors,sameErrors:errors.map((error,index)=>error===two.errors?.[index]),errorKeys:errors.map(error=>Object.keys(error)),stacksDescriptors:errors.map(error=>{const d=Object.getOwnPropertyDescriptor(error,'stacks');return d?{enumerable:d.enumerable,writable:d.writable,configurable:d.configurable,value:d.value}:null}),errors})};export default class Observer{onInit(context){context.onClose(()=>writeFileSync(${JSON.stringify(closed)},'closed'))}onTestCaseResult(test){row(test,'live')}onTestRunEnd(modules){for(const module of modules)for(const test of module.children.allTests())row(test,'terminal')}}`
  )
  const child = fork(
    next + '/dist/experimental/testing/reporting/custom-reporter-worker.js',
    [],
    {
      execPath: process.execPath,
      cwd: project,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' },
      serialization: 'advanced',
    }
  )
  let stdout = '',
    stderr = ''
  const messages = [],
    pending = []
  child.stdout.on('data', (value) => (stdout += value))
  child.stderr.on('data', (value) => (stderr += value))
  child.on('message', (value) => {
    messages.push(value)
    pending.shift()?.(value)
  })
  const exited = new Promise((resolve) =>
      child.once('exit', (code, signal) => resolve({ code, signal }))
    ),
    request = (value) =>
      new Promise((resolve, reject) => {
        pending.push(resolve)
        child.send(value, (error) => {
          if (error) reject(error)
        })
      })
  try {
    let response = await request({
      type: 'run',
      input: { files: [reporter], projectDir: dir, queuedProjectRoot: dir },
    })
    assert.equal(
      response.type,
      'custom-reporter-result',
      JSON.stringify(response)
    )
    child.send({ type: 'task-state', taskTree: snapshots[0] })
    for (let index = 0; index < logical.length; index++) {
      child.send({
        type: 'task-state',
        taskTree: snapshots[index + 1],
        taskUpdateIds: [logical[index].caseId],
      })
      response = await request({
        type: 'case-result',
        entryId: root.id,
        caseId: logical[index].caseId,
      })
      assert.equal(
        response.type,
        'custom-reporter-result',
        JSON.stringify(response)
      )
    }
    response = await request({
      type: 'module-end',
      entryId: root.id,
      completion,
    })
    assert.equal(
      response.type,
      'custom-reporter-result',
      JSON.stringify(response)
    )
    response = await request({ type: 'finish', completion })
    assert.equal(
      response.type,
      'custom-reporter-result',
      JSON.stringify(response)
    )
    response = await request({ type: 'shutdown' })
    assert.equal(
      response.type,
      'custom-reporter-result',
      JSON.stringify(response)
    )
    const exit = await exited
    assert.deepEqual(exit, { code: 0, signal: null })
    const rows = fs
      .readFileSync(trace, 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse)
    assert.deepEqual(rows, model.rows)
    assert.deepEqual(serialize({ snapshots, completion }), raw)
    assert.equal(fs.readFileSync(closed, 'utf8'), 'closed')
    const facts = {
      cases: family === 'falsy' ? 4 : 6,
      completeGenuineRows: family === 'falsy' ? 8 : 12,
      actualExecutionTaskSnapshotsAndCompletionBytePreserved: true,
      reporterErrorAndArrayIdentityPreserved: true,
      reportedDescriptorsExact: true,
      closeJoined: true,
      actualWorkerExit: exit,
    }
    fs.writeFileSync(
      path.join(output, 'VERIFIED.json'),
      JSON.stringify(
        {
          node: { execPath: process.execPath, versions: process.versions },
          rows,
          ...facts,
        },
        null,
        2
      ) + '\n'
    )
    console.log(JSON.stringify(facts))
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      await exited
    }
    fs.writeFileSync(
      path.join(output, 'MESSAGES.json'),
      JSON.stringify(messages, null, 2) + '\n'
    )
    fs.writeFileSync(path.join(output, 'worker-stdout.log'), stdout)
    fs.writeFileSync(path.join(output, 'worker-stderr.log'), stderr)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
