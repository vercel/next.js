import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fixtureFiles,
  resolveFixturePath,
} from '../../lib/next-testing-fixtures.cjs'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

export async function runResetFixture(family, variants) {
  const [repo, output, mode, variant, kind] = process.argv.slice(2)
  assert(repo && output)
  assert(['development', 'production'].includes(mode))
  assert(['source', 'installed'].includes(kind))
  assert(Object.hasOwn(variants, variant), 'Unknown reset fixture')
  const source = path.join(here, `module-reset-${family}-fixtures`, variant)
  const files = fixtureFiles(source).map((name) => {
    assert(name.endsWith('.txt'))
    return {
      target: name.slice(0, -4),
      bytes: fs.readFileSync(resolveFixturePath(path.join(source, name))),
    }
  })
  let joined = false
  try {
    const result = await runCompilerCase({
      repo,
      output,
      mode,
      files,
      expectedNames: variants[variant],
      env: { RESET_EXPECTED_MODE: mode },
      config: {
        projects: [
          {
            name: 'reset-utility-' + variant,
            mode,
            environment: 'node',
            include: ['suite.test.mjs'],
            testTimeout: 5000,
            hookTimeout: 5000,
            includeTaskLocation: false,
          },
        ],
        fileParallelism: false,
        maxWorkers: 1,
      },
    })
    joined = true
    fs.writeFileSync(
      path.join(output, 'CHECKS.json'),
      JSON.stringify({ ...result, variant }) + '\n'
    )
  } finally {
    if (fs.existsSync(output))
      fs.writeFileSync(
        path.join(output, 'CLOSED.json'),
        JSON.stringify({
          allActualProcessesJoined: joined,
          fixtureRetired: joined,
        }) + '\n'
      )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runResetFixture('utility', {
    v1: [
      'resetModules retains its method identity, descriptors and invocation behavior',
      'direct reset invalidates the actual imported module cache',
      'an alias retained from a completed case resets the current real cache',
      'the collection alias resolves the real active runtime when later invoked',
    ],
    'literal-forms': [
      'literal method metadata can be observed during collection without a case',
      'literal replacement uses the real assigned method and retained original cache owner',
      'literal deletion is visible while the retained method still resets the real cache',
      'literal postfix update keeps its actual numeric result and retained reset method',
      'literal logical updates preserve the actual retained and assigned method values',
      'retained aliases evaluate unused arguments and ignore foreign receivers',
    ],
  })
}
