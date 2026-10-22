const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createHash } = require('node:crypto')

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
  const inputs = path.join(__dirname, 'declaration-fn-records')
  const evidence = await fs.mkdtemp(
    path.join(require('node:os').tmpdir(), 'next-testing-declaration-fn-')
  )
  const results = []
  let success = false
  try {
    for (const mode of ['development', 'production']) {
      for (const group of [
        'contract',
        'focus',
        'retention',
        'suite-collector',
        'suite-queue',
      ]) {
        const fixture = await fs.mkdtemp(
          path.join(repo, '.next-test-declaration-fn-')
        )
        let joined = false
        try {
          const names =
            group === 'retention'
              ? ['helpers.case.mjs', 'realm.case.mjs', 'realm-cache.mjs']
              : [`${group}.case.mjs`]
          const sources = await Promise.all(
            names.map((name) => fs.readFile(path.join(inputs, `${name}.txt`)))
          )
          for (let index = 0; index < names.length; index++)
            await fs.writeFile(path.join(fixture, names[index]), sources[index])
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
            `export default ${JSON.stringify({ turbopack: { root: repo } })}\n`
          )
          await fs.writeFile(
            path.join(fixture, 'next.test.config.json'),
            JSON.stringify({
              maxWorkers: 1,
              projects: [
                {
                  name: `fn-${group}`,
                  mode,
                  environment: 'node',
                  include: names.filter((name) => name.endsWith('.case.mjs')),
                  allowOnly: true,
                },
              ],
            })
          )
          const out = path.join(evidence, `${mode}-${group}`)
          await fs.mkdir(out)
          const reportFile = path.join(out, 'report.json')
          const env = {
            ...process.env,
            NODE_ENV: mode,
            NEXT_TELEMETRY_DISABLED: '1',
            FORCE_COLOR: '0',
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
              `--outputFile=${reportFile}`,
            ],
            {
              cwd: fixture,
              env,
              timeoutMs: 120000,
              auditDir: path.join(out, 'processes'),
            }
          )
          await fs.writeFile(
            path.join(out, 'owner.json'),
            JSON.stringify(owner)
          )
          assertOwnedNodeCompleted(owner, `declaration fn ${mode}/${group}`)
          joined = true
          const report = JSON.parse(await fs.readFile(reportFile, 'utf8'))
          const rows = report.next.events
            .filter((e) => e.type === 'output')
            .flatMap((e) =>
              e.text
                .split('\n')
                .filter((s) => s.startsWith('DECLARATION_FN:'))
                .map((s) => ({
                  stream: e.stream,
                  prefix: 'DECLARATION_FN',
                  value: JSON.parse(s.slice(15)),
                }))
            )
          const cases = report.testResults
            .flatMap((f) => f.assertionResults)
            .map((c) => ({
              name: c.fullName,
              status: c.status,
              failureMessages: c.failureMessages,
            }))
          const counts = Object.fromEntries(
            [
              'numTotalTests',
              'numPassedTests',
              'numFailedTests',
              'numPendingTests',
              'numTodoTests',
              'success',
            ].map((k) => [k, report[k]])
          )
          // Independent file delivery order is not an authoring contract. Retain
          // every authored row and complete case outcome from both file realms.
          if (group === 'retention') {
            rows.sort((a, b) => a.value.kind.localeCompare(b.value.kind))
            cases.sort((a, b) => a.name.localeCompare(b.name))
          }
          const actual = { rows, cases, counts, exit: owner.status }
          assert.deepEqual(
            actual,
            JSON.parse(
              await fs.readFile(
                path.join(inputs, `pristine-${group}.json`),
                'utf8'
              )
            )
          )
          for (let index = 0; index < names.length; index++)
            assert.deepEqual(
              await fs.readFile(path.join(fixture, names[index])),
              sources[index]
            )
          results.push({
            mode,
            group,
            cases: cases.length,
            rows: rows.length,
            sourceSHA256: sources.map((source) =>
              createHash('sha256').update(source).digest('hex')
            ),
          })
        } finally {
          if (joined) await fs.rm(fixture, { recursive: true, force: true })
        }
      }
    }
    success = true
    process.stdout.write(JSON.stringify({ profiles: results }) + '\n')
  } finally {
    if (success) await fs.rm(evidence, { recursive: true, force: true })
    else console.error(`Retained declaration fn evidence: ${evidence}`)
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
