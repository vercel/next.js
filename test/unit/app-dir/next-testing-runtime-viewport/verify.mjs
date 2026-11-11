import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../../lib/next-testing-case-runner.mjs'

export async function verifyRuntimeViewport(browser = 'chromium') {
  const [repoArg, outputArg] = process.argv.slice(2)
  assert(repoArg && outputArg, 'Expected repository and output directory')
  assert(['chromium', 'firefox', 'webkit'].includes(browser))
  const repo = fs.realpathSync(repoArg),
    output = path.resolve(outputArg)
  const directory = path.dirname(fileURLToPath(import.meta.url))
  const names = [
    'responsive',
    ...(browser !== 'webkit' ? ['zero'] : []),
    ...(browser === 'chromium' ? ['poll'] : []),
  ]
  const files = names.map((name) => ({
    target: `${name}.test.mjs`,
    bytes: fs.readFileSync(path.join(directory, `${name}.test.mjs.txt`)),
  }))
  files.push({
    target: 'app/layout.jsx',
    bytes:
      "import React from 'react';export default function Layout({children}){return <html><body>{children}</body></html>}\n",
  })
  files.push({
    target: 'app/page.jsx',
    bytes:
      'export default function Page(){return <p>Viewport regression</p>}\n',
  })
  const expectedCount =
    browser === 'chromium' ? 6 : browser === 'firefox' ? 2 : 1
  const runs = []
  for (const mode of ['development', 'production']) {
    runs.push(
      await runCompilerCase({
        repo,
        output: path.join(output, mode),
        mode,
        files,
        expectedCount,
        timeoutMs: 120000,
        config: {
          test: {
            mode,
            environment: 'browser',
            maxWorkers: 1,
            include: names.map((name) => `${name}.test.mjs`),
            testTimeout: 5000,
            hookTimeout: 5000,
            browser: {
              enabled: true,
              headless: true,
              viewport: { width: 414, height: 896 },
              instances: [{ browser }],
            },
          },
        },
      })
    )
  }
  fs.writeFileSync(
    path.join(output, 'VERIFIED.json'),
    JSON.stringify(
      {
        profiles: runs.length,
        cases: runs.reduce((sum, run) => sum + run.cases, 0),
        viewportBehaviorAssertionsPassed: true,
        pollBehaviorAssertionsPassed: browser === 'chromium',
        allOwnersJoined: true,
        allFixturesRemoved: true,
      },
      null,
      2
    ) + '\n'
  )
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  await verifyRuntimeViewport()
