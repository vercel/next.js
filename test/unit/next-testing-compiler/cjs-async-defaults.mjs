import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'
import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const load = createRequire(import.meta.url)

export async function runDefaultForm(selectedFamily) {
  const [repo, output, mode, form, , familyArg] = process.argv.slice(2)
  const family = selectedFamily ?? familyArg ?? 'async'
  let forms
  if (['renamed', 'array', 'whole-array'].includes(family)) {
    forms = load(`./cjs-${family}-defaults-forms.cjs`).forms
  } else {
    const sources = load('./cjs-async-defaults-forms.cjs')
    forms =
      family === 'arrow'
        ? sources.arrows
        : family === 'recursive'
          ? sources.recursive
          : family === 'binding-self' && form.startsWith('sync:')
            ? sources.syncBindingSelf
            : sources.forms
  }
  assert(Object.hasOwn(forms, form), `Unknown callable form: ${family}/${form}`)
  const read = (name) =>
    fs.readFileSync(resolveFixturePath(path.join(here, name)))
  const result = await runCompilerCase({
    repo,
    output,
    mode,
    files: [
      {
        target: 'contract.test.mjs',
        bytes: read('cjs-async-defaults-fixtures/contract.test.mjs.txt'),
      },
      { target: 'root.cjs', bytes: forms[form] },
      {
        target: 'dependency.cjs',
        bytes: read('cjs-async-defaults-fixtures/dependency.cjs.txt'),
      },
      {
        target: 'form.mjs',
        bytes: `export const form=${JSON.stringify(form)},family=${JSON.stringify(family)}\n`,
      },
    ],
    config: {
      maxWorkers: 1,
      projects: [
        { name: 'cjs223', mode, environment: 'node', include: ['*.test.mjs'] },
      ],
    },
    expectedCount: 3,
  })
  fs.writeFileSync(
    path.join(output, 'CHECKS.json'),
    JSON.stringify({ ...result, form }) + '\n'
  )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await runDefaultForm()
}
