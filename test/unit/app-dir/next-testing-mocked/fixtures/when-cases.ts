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

it('matches all six unchanged pinned conditional-mock bodies and complete dictionaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-when-contract-'))
  const previous = process.env.NEXT_TESTING_WHEN_EVIDENCE
  const evidence = join(directory, 'observations.jsonl')
  process.env.NEXT_TESTING_WHEN_EVIDENCE = evidence
  const file = initializeTestFile({
    fileId: 'entry',
    filePath: join(directory, 'when.case.mjs'),
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
      join(__dirname, 'when.case.mjs'),
      join(directory, 'when.case.mjs')
    )
    await file.collect(() => import(join(directory, 'when.case.mjs')))
    const result = await file.run({
      runId: 'when',
      signal: new AbortController().signal,
    })
    const rows = (await readFile(evidence, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const pristine = JSON.parse(
      await readFile(join(__dirname, 'when-pristine.json'), 'utf8')
    )
    console.log(
      JSON.stringify({ actualWhenResult: result, actualRows: rows, pristine })
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
    if (previous === undefined) delete process.env.NEXT_TESTING_WHEN_EVIDENCE
    else process.env.NEXT_TESTING_WHEN_EVIDENCE = previous
    try {
      await file.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})

it('checks conditional-mock types through actual common and client declarations', async () => {
  const { checkWhenTypes } = require('./check-when-types.cjs')
  const directory = await mkdtemp(join(tmpdir(), 'next-when-types-'))
  try {
    const rows = []
    for (const name of ['vitest', 'client/vitest']) {
      rows.push(
        ...(await checkWhenTypes({
          facadeDts: require.resolve(
            `next/dist/experimental/testing/${name}.d.ts`
          ),
          inputFile: join(__dirname, '../types/when.txt'),
          evidenceDir: join(directory, name.replace('/', '-')),
        }))
      )
    }
    const lowerLibRows = await checkWhenTypes({
      facadeDts: require.resolve('next/dist/experimental/testing/vitest.d.ts'),
      inputFile: join(__dirname, '../types/when-lower-lib.txt'),
      evidenceDir: join(directory, 'lower-lib'),
      lowerLib: true,
    })
    console.log(JSON.stringify({ actualWhenTypeRows: rows, lowerLibRows }))
    assert.equal(rows.length, 4)
    assert(rows.every((row) => row.diagnostics.length === 0))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
