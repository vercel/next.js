import assert from 'node:assert/strict'
import { it } from 'node:test'
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  writeFile,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeTestFile } from 'next/dist/experimental/testing/runner'
import {
  createExpect,
  expect,
  test,
} from 'next/dist/experimental/testing/vitest'

const runOptions = () => ({
  runId: 'unreachable',
  signal: new AbortController().signal,
})

it('matches all actual pristine unreachable diagnostics and assertion counts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-unreachable-'))
  const previous = process.env.NEXT_TESTING_UNREACHABLE_EVIDENCE
  const evidence = join(directory, 'observations.jsonl')
  process.env.NEXT_TESTING_UNREACHABLE_EVIDENCE = evidence
  const file = initializeTestFile({
    fileId: 'entry',
    filePath: join(directory, 'unreachable.case.mjs'),
  })
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
    await copyFile(
      join(__dirname, 'unreachable.case.mjs'),
      join(directory, 'unreachable.case.mjs')
    )
    await file.collect(() => import(join(directory, 'unreachable.case.mjs')))
    const result = await file.run(runOptions())
    const rows = (await readFile(evidence, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const pristine = JSON.parse(
      await readFile(join(__dirname, 'unreachable-pristine.json'), 'utf8')
    )
    console.log(
      JSON.stringify({
        actualUnreachableResult: result,
        actualRows: rows,
        pristine,
      })
    )
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      Array(3).fill('passed')
    )
    assert.deepEqual(
      result.cases.map((entry) => entry.name),
      pristine.names
    )
    assert.deepEqual(result.errors, [])
    assert.deepEqual(rows, pristine.rows)
  } finally {
    if (previous === undefined)
      delete process.env.NEXT_TESTING_UNREACHABLE_EVIDENCE
    else process.env.NEXT_TESTING_UNREACHABLE_EVIDENCE = previous
    try {
      await file.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})

it('retains the existing scoped and file-local expectation lifetime rules', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-unreachable-lifetime-'))
  const file = initializeTestFile({
    fileId: 'lifetime',
    filePath: join(directory, 'entry.mjs'),
  })
  let scoped!: (message?: string) => never
  let local!: (message?: string) => never
  try {
    await file.collect(async () => {
      test('creator', (context) => {
        scoped = context.expect.unreachable
        local = createExpect().unreachable
        assert.throws(() => scoped('creator'), {
          name: 'AssertionError',
          message: 'expected "creator" not to be reached',
        })
        assert.equal(context.expect.getState().assertionCalls, 0)
      })
      test('next attempt', () => {
        assert.throws(() => scoped('old attempt'), {
          message: 'Expectation belongs to a different Next test.',
        })
        assert.throws(() => local('file-local'), {
          name: 'AssertionError',
          message: 'expected "file-local" not to be reached',
        })
        assert.equal(expect.getState().assertionCalls, 0)
      })
    })
    const result = await file.run(runOptions())
    console.log(JSON.stringify({ actualUnreachableLifetime: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
  } finally {
    try {
      await file.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
  assert.throws(() => scoped('closed'), {
    message: 'Cannot access a disposed assertion scope',
  })
  assert.throws(() => local('closed'), {
    message: 'Cannot access a disposed assertion scope',
  })
})

it('records an uncaught unreachable as the original assertion failure without adding a count', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-unreachable-failure-'))
  const file = initializeTestFile({
    fileId: 'failure',
    filePath: join(directory, 'entry.mjs'),
  })
  let assertionCalls: number | undefined
  try {
    await file.collect(async () => {
      test('intentional unreachable', () => {
        try {
          expect.unreachable('missing branch')
        } finally {
          assertionCalls = expect.getState().assertionCalls
        }
      })
    })
    const result = await file.run(runOptions())
    console.log(
      JSON.stringify({ actualUncaughtUnreachable: result, assertionCalls })
    )
    assert.equal(result.cases.length, 1)
    assert.equal(result.cases[0].status, 'failed')
    assert.equal(result.cases[0].errors.length, 1)
    const failure = result.cases[0].errors[0]
    assert.equal(failure.phase, 'test')
    assert(failure.error instanceof Error)
    assert.equal(failure.error.name, 'AssertionError')
    assert.equal(
      failure.error.message,
      'expected "missing branch" not to be reached'
    )
    assert.equal(assertionCalls, 0)
  } finally {
    try {
      await file.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})

it('exposes optional string and never types on common, client, local and context expectations', async () => {
  // The existing facade consumer helper accepts any authored input body.
  const {
    checkWhenTypes,
  } = require('../app-dir/next-testing-mocked/fixtures/check-when-types.cjs')
  const directory = await mkdtemp(join(tmpdir(), 'next-unreachable-types-'))
  try {
    const rows = []
    for (const name of ['vitest', 'client/vitest']) {
      rows.push(
        ...(await checkWhenTypes({
          facadeDts: require.resolve(
            `next/dist/experimental/testing/${name}.d.ts`
          ),
          inputFile: join(__dirname, 'unreachable-types.txt'),
          evidenceDir: join(directory, name.replace('/', '-')),
        }))
      )
    }
    console.log(JSON.stringify({ actualUnreachableTypeRows: rows }))
    assert.equal(rows.length, 4)
    assert(rows.every((row) => row.diagnostics.length === 0))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
