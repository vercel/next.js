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

it('matches the pinned exhaustion cases, complete diagnostics and assertion counts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-when-exhausted-'))
  const previous = process.env.NEXT_TESTING_WHEN_EXHAUSTED_EVIDENCE
  const evidence = join(directory, 'observations.jsonl')
  process.env.NEXT_TESTING_WHEN_EXHAUSTED_EVIDENCE = evidence
  const file = initializeTestFile({
    fileId: 'entry',
    filePath: join(directory, 'when-exhausted.case.mjs'),
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
      join(__dirname, 'when-exhausted.case.mjs'),
      join(directory, 'when-exhausted.case.mjs')
    )
    await file.collect(() => import(join(directory, 'when-exhausted.case.mjs')))
    const result = await file.run({
      runId: 'when-exhausted',
      signal: new AbortController().signal,
    })
    const rows = (await readFile(evidence, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const pristine = JSON.parse(
      await readFile(join(__dirname, 'when-exhausted-pristine.json'), 'utf8')
    )
    console.log(
      JSON.stringify({
        actualExhaustionResult: result,
        actualRows: rows,
        pristine,
      })
    )
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      Array(6).fill('passed')
    )
    assert.deepEqual(
      result.cases.map((entry) => entry.name),
      pristine.names
    )
    assert.deepEqual(result.errors, [])
    assert.deepEqual(rows, pristine.rows)
  } finally {
    if (previous === undefined)
      delete process.env.NEXT_TESTING_WHEN_EXHAUSTED_EVIDENCE
    else process.env.NEXT_TESTING_WHEN_EXHAUSTED_EVIDENCE = previous
    try {
      await file.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})

it('exposes the matcher with original sync, negated and async types', async () => {
  const { checkWhenTypes } = require('./check-when-types.cjs')
  const directory = await mkdtemp(join(tmpdir(), 'next-when-exhausted-types-'))
  try {
    const rows = []
    for (const name of ['vitest', 'client/vitest']) {
      rows.push(
        ...(await checkWhenTypes({
          facadeDts: require.resolve(
            `next/dist/experimental/testing/${name}.d.ts`
          ),
          inputFile: join(__dirname, '../types/when-exhausted.txt'),
          evidenceDir: join(directory, name.replace('/', '-')),
        }))
      )
    }
    console.log(JSON.stringify({ actualExhaustionTypeRows: rows }))
    assert.equal(rows.length, 4)
    assert(rows.every((row) => row.diagnostics.length === 0))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
