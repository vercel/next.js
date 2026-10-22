const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { pathToFileURL } = require('node:url')

async function main() {
  const repo = path.resolve(__dirname, '../../..')
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    pathToFileURL(
      path.join(
        repo,
        'test/e2e/app-dir/next-testing-package/process-supervisor.mjs'
      )
    ).href
  )
  const source = path.join(__dirname, 'fixtures/case-result-parent')
  const authored = path.join(
    __dirname,
    '../next-testing-lifecycle/declaration-fn-records'
  )
  const body = await fs.readFile(path.join(authored, 'task-scope.case.mjs.txt'))
  const expected = JSON.parse(
    await fs.readFile(path.join(authored, 'pristine-task-scope.json'), 'utf8')
  )
  const callbacks = JSON.parse(
    await fs.readFile(path.join(source, 'pristine.json'), 'utf8')
  )
  const evidence = await fs.mkdtemp(
    path.join(os.tmpdir(), 'next-test-case-parent-')
  )
  let cases = 0,
    authoredRows = 0,
    callbackRows = 0,
    success = false
  try {
    for (const mode of ['development', 'production']) {
      const fixture = await fs.mkdtemp(
        path.join(repo, '.next-test-case-parent-')
      )
      let joined = false
      try {
        await fs.writeFile(path.join(fixture, 'task-scope.case.mjs'), body)
        await fs.copyFile(
          path.join(source, 'reporter.mjs.txt'),
          path.join(fixture, 'reporter.mjs')
        )
        await fs.writeFile(
          path.join(fixture, 'package.json'),
          '{"type":"module"}\n'
        )
        await fs.symlink(
          path.join(repo, 'node_modules'),
          path.join(fixture, 'node_modules'),
          'dir'
        )
        await fs.writeFile(
          path.join(fixture, 'next.config.mjs'),
          'export default {}\n'
        )
        await fs.writeFile(
          path.join(fixture, 'next.test.config.json'),
          JSON.stringify({
            maxWorkers: 1,
            projects: [
              {
                name: 'fn-task-scope',
                mode,
                environment: 'node',
                include: ['task-scope.case.mjs'],
                allowOnly: true,
              },
            ],
          })
        )
        const out = path.join(evidence, mode)
        await fs.mkdir(out)
        const reportFile = path.join(out, 'report.json')
        const callbackFile = path.join(out, 'callbacks.jsonl')
        const env = {
          ...process.env,
          NODE_ENV: mode,
          NEXT_TELEMETRY_DISABLED: '1',
          FORCE_COLOR: '0',
          NEXT_TEST_HIERARCHY_FILE: callbackFile,
        }
        for (const key of [
          'CI',
          'NODE_OPTIONS',
          'NODE_PATH',
          'NEXT_TEST_NATIVE_DIR',
          'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
        ])
          delete env[key]
        const owner = await runOwnedNode(
          [
            path.join(repo, 'packages/next/dist/bin/next'),
            'test',
            fixture,
            '--run',
            '--reporter=json',
            '--reporter=./reporter.mjs',
            `--outputFile=${reportFile}`,
          ],
          {
            cwd: fixture,
            env,
            timeoutMs: 120000,
            auditDir: path.join(out, 'processes'),
          }
        )
        await fs.writeFile(path.join(out, 'owner.json'), JSON.stringify(owner))
        assertOwnedNodeCompleted(owner, `actual reporter parents ${mode}`)
        joined = true
        const raw = JSON.parse(await fs.readFile(reportFile, 'utf8'))
        const rows = raw.next.events
          .filter((event) => event.type === 'output')
          .flatMap((event) =>
            event.text
              .split('\n')
              .filter((line) => line.startsWith('DECLARATION_FN:'))
              .map((line) => ({
                stream: event.stream,
                prefix: 'DECLARATION_FN',
                value: JSON.parse(line.slice(15)),
              }))
          )
        const outcomes = raw.testResults
          .flatMap((file) => file.assertionResults)
          .map((test) => ({
            name: test.fullName,
            status: test.status,
            failureMessages: test.failureMessages,
          }))
        const counts = Object.fromEntries(
          [
            'numTotalTests',
            'numPassedTests',
            'numFailedTests',
            'numPendingTests',
            'numTodoTests',
            'success',
          ].map((key) => [key, raw[key]])
        )
        assert.deepEqual(
          { rows, cases: outcomes, counts, exit: owner.status },
          expected
        )
        const actual = (await fs.readFile(callbackFile, 'utf8'))
          .trim()
          .split('\n')
          .map((row) => JSON.parse(row))
        assert.deepEqual(actual, callbacks)
        assert.deepEqual(
          await fs.readFile(path.join(fixture, 'task-scope.case.mjs')),
          body
        )
        cases += outcomes.length
        authoredRows += rows.length
        callbackRows += actual.length
      } finally {
        if (joined) await fs.rm(fixture, { recursive: true, force: true })
      }
    }
    success = true
    process.stdout.write(
      JSON.stringify({
        profiles: 2,
        cases,
        authoredRows,
        callbackRows,
        fullReferenceRows: true,
      })
    )
  } finally {
    if (success) await fs.rm(evidence, { recursive: true, force: true })
    else process.stderr.write(`Reporter parent evidence: ${evidence}\n`)
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
