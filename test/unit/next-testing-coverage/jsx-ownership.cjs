const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const repo = path.resolve(__dirname, '../../..')
const { createCoverageSourcePlan } = require(
  repo +
    '/packages/next/dist/experimental/testing/coverage/source-analysis-plan'
)
const { createRuntimeConfigurationPlan } = require(
  repo +
    '/packages/next/dist/experimental/testing/coverage/runtime-configuration'
)
const { assertStandardCoverageFacts } = require(
  repo + '/packages/next/dist/experimental/testing/coverage/report-standard'
)
const { coverageHash } = require(
  repo + '/packages/next/dist/experimental/testing/coverage/artifact'
)
;(async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'next-jsx-report-ownership-'))
  )
  try {
    const fixture =
      repo + '/test/unit/next-testing-coverage/fixtures/jsx-standard/basic'
    const file = path.join(root, 'subject.jsx'),
      entryFile = path.join(root, 'contract.test.mjs')
    const source = await fs.readFile(fixture + '/subject.jsx.txt', 'utf8')
    await fs.writeFile(file, source)
    await fs.writeFile(
      entryFile,
      await fs.readFile(fixture + '/contract.test.mjs.txt')
    )
    await fs.writeFile(
      path.join(root, 'next.config.mjs'),
      'export default {}\n'
    )
    const profile = {
      id: 'node',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
      mode: 'development',
    }
    const projects = [
      {
        profile,
        entries: [{ id: 'node:contract.test.mjs', file: entryFile, profile }],
        include: ['contract.test.mjs'],
        exclude: [],
        setupFiles: [],
      },
    ]
    const signal = new AbortController().signal
    const config = {
      reporter: ['json'],
      include: ['subject.jsx'],
      exclude: [],
      reportsDirectory: 'coverage',
      reportOnFailure: false,
      thresholds: {},
    }
    const sourcePlan = await createCoverageSourcePlan({
      projectDir: root,
      projects,
      config,
      signal,
    })
    const runtimeConfigurationPlan = await createRuntimeConfigurationPlan({
      projectDir: root,
      projects,
      signal,
    })
    const data = JSON.parse(
      await fs.readFile(fixture + '/pristine-coverage.json'),
      (key, value) => (key === 'column' && value === null ? Infinity : value)
    )['subject.jsx']
    data.path = file
    const entry = runtimeConfigurationPlan.requests[0].entries[0]
    const facts = [
      {
        version: 1,
        entryId: entry.id,
        revision: entry.revision,
        complete: true,
        errors: [],
        files: [{ file, sha256: coverageHash(source), data }],
      },
    ]
    const expected = new Set([entry.id]),
      revisions = new Map([[entry.id, entry.revision]]),
      plans = { sourcePlan, runtimeConfigurationPlan }
    assert.deepEqual(
      await assertStandardCoverageFacts(
        facts,
        root,
        expected,
        revisions,
        plans,
        signal
      ),
      facts
    )
    let controls = 1
    await assert.rejects(
      assertStandardCoverageFacts(facts, root, expected, revisions)
    )
    controls++
    for (const edit of [
      (p) => {
        p.runtimeConfigurationPlan.requests[0].entries[0].id =
          'node:foreign.test.mjs'
      },
      (p) => {
        p.sourcePlan.requests[0].profile = {
          ...p.sourcePlan.requests[0].profile,
          id: 'foreign-profile',
        }
      },
      (p) => {
        p.runtimeConfigurationPlan.requests[0].entries[0].revision =
          'foreign-revision'
      },
      (p) => {
        p.sourcePlan.requests[0].source.sha256 = '0'.repeat(64)
      },
      (p) => {
        p.sourcePlan.requests[0].profile = {
          ...p.sourcePlan.requests[0].profile,
          mode: 'production',
        }
      },
    ]) {
      const candidate = structuredClone(plans)
      edit(candidate)
      await assert.rejects(
        assertStandardCoverageFacts(
          facts,
          root,
          expected,
          revisions,
          candidate,
          signal
        )
      )
      controls++
    }
    process.stdout.write(JSON.stringify({ controls, passed: controls }) + '\n')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error.stack)
  process.exitCode = 1
})
