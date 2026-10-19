import assert from 'node:assert/strict'
import { it } from 'node:test'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeTestFile } from 'next/dist/experimental/testing/runner'

it('matches genuine Chai legacy setting aliases, values, descriptors and warnings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-static-settings-'))
  const previous = process.env.NEXT_TESTING_CHAI_STATIC_EVIDENCE
  const observations = join(directory, 'observations.jsonl')
  process.env.NEXT_TESTING_CHAI_STATIC_EVIDENCE = observations
  const file = initializeTestFile({
    fileId: 'settings',
    filePath: join(directory, 'settings.test.mjs'),
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
      join(__dirname, 'chai-static-settings-contract.mjs.txt'),
      join(directory, 'settings.test.mjs')
    )
    await file.collect(() => import(join(directory, 'settings.test.mjs')))
    const result = await file.run({
      runId: 'static-settings',
      signal: new AbortController().signal,
    })
    const rows = (await readFile(observations, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const pristine = JSON.parse(
      await readFile(
        join(__dirname, 'chai-static-settings-pristine.json'),
        'utf8'
      )
    )
    console.log(
      JSON.stringify({
        actualResult: result,
        actualRows: rows,
        pristineRows: pristine,
      })
    )
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
    assert.deepEqual(rows, pristine)
  } finally {
    try {
      await file.dispose()
    } finally {
      if (previous === undefined)
        delete process.env.NEXT_TESTING_CHAI_STATIC_EVIDENCE
      else process.env.NEXT_TESTING_CHAI_STATIC_EVIDENCE = previous
      await rm(directory, { recursive: true, force: true })
    }
  }
})
