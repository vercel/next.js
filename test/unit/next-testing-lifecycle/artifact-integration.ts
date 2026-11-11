import assert from 'node:assert/strict'
import { it } from 'node:test'
import {
  mkdtemp,
  mkdir,
  writeFile,
  copyFile,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { initializeTestFile } from 'next/dist/experimental/testing/runner'

it('matches the genuine completion-only artifact corpus and task counts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-artifact-contract-'))
  const filePath = join(directory, 'artifacts.test.mjs')
  const previous = process.env.ARTIFACT_PROBE_EVIDENCE
  const evidence = join(directory, 'observations')
  await mkdir(evidence)
  process.env.ARTIFACT_PROBE_EVIDENCE = evidence
  const file = initializeTestFile({ fileId: 'artifact', filePath })
  const events: any[] = []
  const envelope = { version: 1, runId: 'artifact', timestamp: 0 }
  const entry = {
    id: 'artifact',
    file: filePath,
    profile: {
      id: 'node',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    },
  }
  events.push(
    { ...envelope, type: 'run-start' },
    { ...envelope, type: 'file-start', entry }
  )
  try {
    await mkdir(join(directory, 'node_modules/vitest'), { recursive: true })
    await writeFile(
      join(directory, 'node_modules/vitest/package.json'),
      JSON.stringify({ name: 'vitest', main: 'index.cjs' })
    )
    await writeFile(
      join(directory, 'node_modules/vitest/index.cjs'),
      `module.exports = require(${JSON.stringify(require.resolve('next/dist/experimental/testing/vitest'))})\n`
    )
    await copyFile(join(__dirname, 'artifact-contract.mjs.txt'), filePath)
    await writeFile(join(directory, 'artifact.txt'), 'local artifact bytes\n')
    await file.collect(() => import(filePath))
    const result = await file.run({
      runId: 'artifact',
      signal: new AbortController().signal,
      projectDir: directory,
      getAnnotationLocation(error) {
        const match = error.stack?.match(/artifacts\.test\.mjs:(\d+):(\d+)/)
        return match
          ? { file: filePath, line: Number(match[1]), column: Number(match[2]) }
          : undefined
      },
      onCaseStart(context) {
        events.push({
          ...envelope,
          type: 'case-start',
          entryId: 'artifact',
          caseId: context.testId,
          attempt: {
            id: context.id,
            retry: context.retry,
            repeat: context.repeat,
          },
          name: context.name,
        })
      },
      onArtifact(context, artifact) {
        events.push({
          ...envelope,
          type: 'test-artifact',
          entryId: 'artifact',
          caseId: context.testId,
          attempt: {
            id: context.id,
            retry: context.retry,
            repeat: context.repeat,
          },
          artifact,
        })
      },
      onCaseEnd(result) {
        events.push({ ...envelope, type: 'case-end', ...result })
      },
    })
    events.push(
      {
        ...envelope,
        type: 'file-end',
        entryId: 'artifact',
        status: 'passed',
        durationMs: 1,
      },
      { ...envelope, type: 'run-end', status: 'passed', durationMs: 1 }
    )
    const actual = Object.fromEntries(
      await Promise.all(
        (await readdir(evidence))
          .sort()
          .map(async (name) => [
            name.replace(/\.json$/, ''),
            JSON.parse(await readFile(join(evidence, name), 'utf8')),
          ])
      )
    )
    const pristine = JSON.parse(
      await readFile(join(__dirname, 'artifact-pristine.json'), 'utf8')
    )
    console.log(
      JSON.stringify({
        actualArtifactResult: result,
        dictionaries: actual,
        events,
        pristine,
      })
    )
    actual.structured.firstLocation.file = basename(
      actual.structured.firstLocation.file
    )
    assert.deepEqual(actual, pristine)
    assert.deepEqual(
      result.cases.map((test) => test.status),
      Array(4).fill('passed')
    )
    assert.deepEqual(result.errors, [])
    const {
      createTestReporter,
    } = require('next/dist/experimental/testing/reporting/reporter')
    const {
      createCustomReporterModules,
    } = require('next/dist/experimental/testing/reporting/custom-reporter-tasks')
    const reporter = createTestReporter({ projectDir: directory, write() {} })
    try {
      events.forEach((event) => reporter.onEvent(event))
      const modules = createCustomReporterModules(directory, {
        ...reporter.getResults(),
        events,
        status: 'passed',
      })
      assert.deepEqual(
        [...modules[0].children.allTests()].map(
          (test: any) => test.artifacts().length
        ),
        [3, 0, 0, 1]
      )
    } finally {
      reporter.dispose()
    }
  } finally {
    if (previous === undefined) delete process.env.ARTIFACT_PROBE_EVIDENCE
    else process.env.ARTIFACT_PROBE_EVIDENCE = previous
    try {
      await file.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})

it('checks all public artifact types and genuine registry augmentation', async () => {
  const {
    checkWhenTypes,
  } = require('../app-dir/next-testing-mocked/fixtures/check-when-types.cjs')
  const directory = await mkdtemp(join(tmpdir(), 'next-artifact-types-'))
  try {
    const rows = await checkWhenTypes({
      facadeDts: require.resolve('next/dist/experimental/testing/vitest.d.ts'),
      inputFile: join(__dirname, 'artifact-types.ts.txt'),
      evidenceDir: directory,
    })
    console.log(JSON.stringify({ actualArtifactTypeRows: rows }))
    assert.equal(rows.length, 2)
    assert(rows.every((row: any) => row.diagnostics.length === 0))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
