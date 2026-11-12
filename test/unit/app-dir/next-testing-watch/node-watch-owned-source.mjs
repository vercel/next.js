import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { watchFile, unwatchFile } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

async function probe(args) {
  const [consumerArg, mode, outputArg, fixtureArg] = args
  assert.ok(
    consumerArg &&
      ['development', 'production'].includes(mode) &&
      outputArg &&
      fixtureArg
  )
  const consumer = path.resolve(consumerArg)
  const output = path.resolve(outputArg)
  const inputFixture = path.resolve(fixtureArg)
  const load = createRequire(path.join(consumer, 'package.json'))
  await mkdir(output, { recursive: true })
  const fixture = await mkdtemp(
    path.join(consumer, '.next-test-node-watch-owner-')
  )
  const source = await readFile(
    path.join(inputFixture, 'node.case.mjs.txt'),
    'utf8'
  )
  const events = new EventEmitter()
  let stdout = '',
    stderr = '',
    closed = false,
    child
  const changed = () => events.emit('change')
  const readJSON = async (file) => JSON.parse(await readFile(file, 'utf8'))
  const hostFile = path.join(output, 'host.json')
  const blockedFile = path.join(output, 'blocked.json')
  const resultFile = path.join(fixture, 'result.json')
  const observeFiles = [hostFile, blockedFile, resultFile]
  let host
  async function wait(check, label, timeout = 45000) {
    return new Promise((resolve, reject) => {
      let active = false
      let finished = false
      let again = false
      const deadline = setTimeout(
        () =>
          finish(
            new Error(label + ' deadline exceeded\n' + stdout + '\n' + stderr)
          ),
        timeout
      )
      function finish(error, value) {
        if (finished) return
        finished = true
        clearTimeout(deadline)
        events.removeListener('change', inspect)
        error ? reject(error) : resolve(value)
      }
      async function inspect() {
        if (finished) return
        if (active) {
          again = true
          return
        }
        active = true
        try {
          const value = await check()
          if (value) return finish(undefined, value)
          if (closed)
            finish(new Error(label + ': CLI closed\n' + stdout + '\n' + stderr))
        } catch (error) {
          if (error.code !== 'ENOENT') finish(error)
        } finally {
          active = false
          if (again && !finished) {
            again = false
            void inspect()
          }
        }
      }
      events.on('change', inspect)
      void inspect()
    })
  }
  try {
    await writeFile(path.join(fixture, 'contract.case.mjs'), source)
    await writeFile(path.join(fixture, 'package.json'), '{"type":"module"}\n')
    await writeFile(
      path.join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    await writeFile(
      path.join(fixture, 'next.test.config.json'),
      JSON.stringify({
        test: {
          environment: 'node',
          mode,
          include: ['contract.case.mjs'],
          isolate: true,
        },
      }) + '\n'
    )
    for (const file of observeFiles) watchFile(file, { interval: 10 }, changed)
    const env = {
      ...process.env,
      CI: '1',
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      NO_COLOR: '1',
      OWNED_SOURCE_SCENARIO: 'blocked-close',
      OWNED_SOURCE_HOST_PIDFILE: hostFile,
      OWNED_SOURCE_BLOCKED: blockedFile,
      OWNED_SOURCE_SNAPSHOT: path.join(output, 'snapshot.json'),
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        '--require=' + JSON.stringify(path.join(inputFixture, 'preload.cjs')),
      ]
        .filter(Boolean)
        .join(' '),
    }
    child = spawn(
      process.execPath,
      [
        load.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--watch',
        '--max-workers=1',
        '--reporter=default',
        '--reporter=json',
        '--outputFile=result.json',
      ],
      { cwd: consumer, env, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      changed()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      changed()
    })
    child.once('error', (error) => {
      stderr += String(error)
      closed = true
      changed()
    })
    child.once('close', () => {
      closed = true
      changed()
    })
    await wait(
      () => stdout.includes('Waiting for file changes...'),
      'actual ordinary Node generation'
    )
    const firstBytes = await readFile(resultFile, 'utf8')
    const first = JSON.parse(firstBytes)
    assert.equal(first.numPassedTests, 1)
    assert.equal(first.numFailedTests, 0)
    assert.equal(first.success, true)
    assert.equal(first.testResults.length, 1)
    assert.equal(
      first.testResults[0].assertionResults[0].fullName,
      'real ordinary Node watch case'
    )
    host = await readJSON(hostFile)
    assert.ok(Number.isInteger(host.pid) && host.pid > 1)
    process.kill(host.pid, 0)
    child.kill('SIGINT')
    await wait(
      () => readJSON(blockedFile),
      'actual blocked source close',
      10000
    )
    await wait(() => closed, 'source owner physical join after SIGINT', 10000)
    assert.equal(child.exitCode, 130, stderr)
    assert.equal(child.signalCode, null)
    for (const pid of [host.pid, -host.pid])
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    assert.equal(await readFile(resultFile, 'utf8'), firstBytes)
    assert.equal(
      await readFile(path.join(fixture, 'contract.case.mjs'), 'utf8'),
      source
    )
    await writeFile(
      path.join(output, 'CHECKS.json'),
      JSON.stringify(
        {
          mode,
          actualNodeCasePassed: true,
          actualInputSourceHost: host,
          actualBlockedClose: await readJSON(blockedFile),
          sourceProcessAndGroupJoined: true,
          exitCode: child.exitCode,
          priorReportUnchanged: true,
          sourceBytesUnchanged: true,
        },
        null,
        2
      ) + '\n'
    )
    console.log(
      JSON.stringify({
        mode,
        casePassed: true,
        closed: true,
        blockedNativeCloseReclaimed: true,
        exitCode: 130,
      })
    )
  } finally {
    for (const file of observeFiles) unwatchFile(file, changed)
    if (child && !closed) {
      const exit = new Promise((resolve) => child.once('close', resolve))
      child.kill('SIGINT')
      const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
      await exit
      clearTimeout(timer)
    }
    child?.stdin.destroy()
    await writeFile(path.join(output, 'stdout.log'), stdout)
    await writeFile(path.join(output, 'stderr.log'), stderr)
    if (closed) await rm(fixture, { recursive: true, force: true })
  }
}
const args = process.argv.slice(2)
if (args[0] === '--probe') {
  await probe(args.slice(1))
} else {
  const [consumer, mode, output, inputFixture] = args
  assert.ok(consumer && mode && output && inputFixture)
  await mkdir(output, { recursive: true })
  const result = await runOwnedNode(
    [
      fileURLToPath(import.meta.url),
      '--probe',
      consumer,
      mode,
      path.join(output, 'probe'),
      inputFixture,
    ],
    {
      cwd: consumer,
      env: { ...process.env },
      auditDir: path.join(output, 'owners'),
      timeoutMs: 65000,
    }
  )
  await writeFile(
    path.join(output, 'owner.json'),
    JSON.stringify(result, null, 2) + '\n'
  )
  assertOwnedNodeCompleted(
    result,
    'actual ordinary Node watch input-source lifetime ' + mode
  )
  assert.equal(result.status, 0, result.stderr)
  process.stdout.write(result.stdout)
}
