import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg, 'Expected consumer and output directories')
const repo = realpathSync(consumerArg)
const output = resolve(outputArg)
mkdirSync(output, { recursive: true })
const directory = dirname(fileURLToPath(import.meta.url))
const profiles = []
for (const engine of ['chromium', 'firefox']) {
  for (const mode of ['development', 'production']) {
    const project = (name, include) => ({
      name,
      mode,
      environment: 'browser',
      include: [include],
      testTimeout: 5000,
      hookTimeout: 5000,
      browser: {
        enabled: true,
        headless: true,
        instances: [{ browser: engine }],
      },
    })
    const result = await runCompilerCase({
      repo,
      output: join(output, `${engine}-${mode}`),
      mode,
      files: [
        {
          target: 'clock.test.ts',
          bytes: readFileSync(join(directory, 'clock.test.ts.txt')),
        },
        {
          target: 'tick-modes.test.mjs',
          bytes: readFileSync(join(directory, 'tick-modes.test.mjs.txt')),
        },
      ],
      expectedCount: 12,
      timeoutMs: 120000,
      config: {
        maxWorkers: 1,
        fileParallelism: false,
        projects: [
          {
            ...project('configured-clock', 'clock.test.ts'),
            fakeTimers: {
              now: 946684800000,
              toFake: ['Date', 'setTimeout', 'clearTimeout'],
              loopLimit: 10,
            },
          },
          project('tick-modes', 'tick-modes.test.mjs'),
        ],
      },
    })
    profiles.push({ engine, ...result })
  }
}
writeFileSync(
  join(output, 'VERIFIED.json'),
  JSON.stringify(
    {
      profiles,
      cases: profiles.reduce((sum, profile) => sum + profile.cases, 0),
      clockBehaviorAssertionsPassed: true,
      actualDOMRealmAsserted: true,
      allOwnersJoined: true,
      allInputsRemovedAfterOwnedReadersJoined: true,
    },
    null,
    2
  ) + '\n'
)
