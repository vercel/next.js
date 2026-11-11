import assert from 'node:assert/strict'
import { it } from 'node:test'
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  writeFile,
  rm,
  readdir,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeTestFile } from 'next/dist/experimental/testing/runner'

it('matches all five literal pinned helper bodies and complete dictionaries', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'next-define-helper-contract-')
  )
  const previous = process.env.DEFINE_HELPER_EVIDENCE
  const evidence = join(directory, 'observations')
  await mkdir(evidence)
  process.env.DEFINE_HELPER_EVIDENCE = evidence
  const file = initializeTestFile({
    fileId: 'entry',
    filePath: join(directory, 'helpers.test.mjs'),
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
      join(__dirname, 'define-helper.case.mjs'),
      join(directory, 'helpers.test.mjs')
    )
    await copyFile(
      join(__dirname, 'observe.mjs'),
      join(directory, 'observe.mjs')
    )
    await file.collect(() => import(join(directory, 'helpers.test.mjs')))
    const result = await file.run({
      runId: 'define-helper',
      signal: new AbortController().signal,
    })
    const dictionaries = Object.fromEntries(
      await Promise.all(
        (await readdir(evidence))
          .sort()
          .map(async (name) => [
            name.replace(/\.json$/, ''),
            JSON.parse(await readFile(join(evidence, name), 'utf8')),
          ])
      )
    )
    const cases = result.cases
      .map((entry) => ({ name: entry.name, status: entry.status }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const pristine = JSON.parse(
      await readFile(join(__dirname, 'define-helper-pristine.json'), 'utf8')
    )
    console.log(
      JSON.stringify({
        actualHelperResult: result,
        dictionaries,
        cases,
        pristine,
      })
    )
    assert.deepEqual(cases, pristine.cases)
    assert.deepEqual(dictionaries, pristine.dictionaries)
    assert.deepEqual(result.errors, [])
  } finally {
    if (previous === undefined) delete process.env.DEFINE_HELPER_EVIDENCE
    else process.env.DEFINE_HELPER_EVIDENCE = previous
    try {
      await file.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})

it('preserves exact generic receiver overload and async helper types', async () => {
  const { checkWhenTypes } = require('./check-when-types.cjs')
  const directory = await mkdtemp(join(tmpdir(), 'next-define-helper-types-'))
  try {
    const rows = []
    for (const name of ['vitest', 'client/vitest']) {
      rows.push(
        ...(await checkWhenTypes({
          facadeDts: require.resolve(
            `next/dist/experimental/testing/${name}.d.ts`
          ),
          inputFile: join(__dirname, '../types/define-helper.txt'),
          evidenceDir: join(directory, name.replace('/', '-')),
        }))
      )
    }
    console.log(JSON.stringify({ actualHelperTypeRows: rows }))
    assert.equal(rows.length, 4)
    assert(rows.every((row) => row.diagnostics.length === 0))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
