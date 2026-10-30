import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { readBrowserJsMeasurement } from './browser-js.js'
import type { BaselineCheck, BrowserJsEvalResult } from './browser-js.js'
import type {
  EvalRunData,
  RunCompleteContext,
  Sandbox,
} from '@vercel/agent-eval'
import { parseTranscript } from '@vercel/agent-eval'

const FIXTURES = new Set(['agent-059-bundle-optimizer-next-dynamic'])

type VitestReport = {
  numTotalTests: number
  testResults: {
    assertionResults: {
      fullName: string
      status: string
      failureMessages: string[]
    }[]
  }[]
}

function readMeasurementSource(path: string): string {
  return transpileModule(readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  }).outputText.replaceAll(
    '../../lib/bundle-optimizer/browser-js.js',
    './browser-js.mjs'
  )
}

export async function prepareBrowserJs(
  sandbox: Sandbox
): Promise<{ env: Record<string, string> } | void> {
  const pkg = JSON.parse(await sandbox.readFile('package.json'))
  if (!FIXTURES.has(pkg.name)) return
  const fixture = pkg.name
  const source = readMeasurementSource(
    join(process.cwd(), 'evals', fixture, 'measure-browser-js.ts')
  )
  const utilsSource = readMeasurementSource(
    join(process.cwd(), 'lib', 'bundle-optimizer', 'browser-js.ts')
  )
  const utilsPath = '__agent_eval__/browser-js.mjs'
  const measurementPath = '__agent_eval__/measure-browser-js.mjs'
  // Fixture copies must not expose assertion helpers to the app or coding agent.
  const removeHelpers = await sandbox.runCommand('node', [
    '--input-type=module',
    '--eval',
    `import { rm } from 'node:fs/promises'; await Promise.all(['measure-browser-js.ts'].map(path => rm(path, { force: true })))`,
  ])
  if (removeHelpers.exitCode !== 0)
    throw new Error('Could not remove fixture assertion helpers')
  await sandbox.writeFiles({
    [utilsPath]: utilsSource,
    [measurementPath]: source,
  })
  const result = await sandbox.runCommand('node', [measurementPath])
  if (result.exitCode !== 0) {
    throw new Error(`Browser JavaScript baseline failed:\n${result.stderr}`)
  }
  const before = readBrowserJsMeasurement(result.stdout)
  const configPath = '__agent_eval__/browser-js-baseline.config.mjs'
  const reportPath = '__agent_eval__/browser-js-baseline-results.json'
  let baselineChecks: BaselineCheck[] = []
  try {
    await sandbox.writeFiles({
      'EVAL.ts': readFileSync(
        join(process.cwd(), 'evals', fixture, 'EVAL.ts'),
        'utf8'
      ),
      [configPath]: `export default { test: { include: ['EVAL.ts'], reporters: ['json'], outputFile: '${reportPath}', bail: 0 } }`,
    })
    const checks = await sandbox.runCommand(
      'npx',
      ['vitest', 'run', '--config', configPath],
      {
        env: {
          NEXT_EVAL_BROWSER_JS_SOURCE: source,
          NEXT_EVAL_BROWSER_JS_UTILS_SOURCE: utilsSource,
          NEXT_EVAL_BROWSER_JS_BEFORE: JSON.stringify(before),
          NEXT_EVAL_BROWSER_JS_PHASE: 'before',
        },
      }
    )
    if (checks.exitCode !== 0 && checks.exitCode !== 1) {
      throw new Error(`Baseline assertions could not run:\n${checks.stderr}`)
    }
    const report: VitestReport = JSON.parse(await sandbox.readFile(reportPath))
    baselineChecks = report.testResults.flatMap((suite) =>
      suite.assertionResults.map((check): BaselineCheck => {
        if (check.status !== 'passed' && check.status !== 'failed') {
          throw new Error('Baseline assertions did not complete')
        }
        return {
          name: check.fullName,
          status: check.status,
          failures: check.failureMessages.map(
            (message) => message.split('\n')[0]
          ),
        }
      })
    )
    before.checks = baselineChecks
    if (
      !baselineChecks.length ||
      baselineChecks.length !== report.numTotalTests
    ) {
      throw new Error('Baseline assertions did not complete')
    }
  } finally {
    // EVAL.ts must be hidden again before the coding agent starts.
    const cleanup = await sandbox.runCommand('node', [
      '--input-type=module',
      '--eval',
      `import { rm } from 'node:fs/promises'; await Promise.all(${JSON.stringify(['EVAL.ts', configPath, reportPath, utilsPath, measurementPath])}.map(path => rm(path, { force: true })))`,
    ])
    if (cleanup.exitCode !== 0)
      throw new Error('Could not remove baseline assertion files')
  }
  console.log(
    `  Initial browser JavaScript: ${before.initial.encodedBytes} bytes`
  )
  console.log(
    `  Baseline assertions: ${baselineChecks.filter((check) => check.status === 'passed').length} passed, ${baselineChecks.filter((check) => check.status === 'failed').length} failed`
  )
  // Validation receives the originals even if the agent edits files in the app.
  return {
    env: {
      NEXT_EVAL_BROWSER_JS_SOURCE: source,
      NEXT_EVAL_BROWSER_JS_UTILS_SOURCE: utilsSource,
      NEXT_EVAL_BROWSER_JS_BEFORE: JSON.stringify(before),
    },
  }
}

export function assertBundleOptimizerSkillInvoked({
  fixture,
  config,
  runData,
}: RunCompleteContext): EvalRunData {
  if (!FIXTURES.has(fixture.name)) return runData
  const invoked = runData.transcript
    ? parseTranscript(runData.transcript, config.agent).events.some(
        (event) =>
          event.type === 'tool_call' &&
          event.tool?.originalName === 'Skill' &&
          event.tool.args?.skill === 'next-bundle-optimizer'
      )
    : false
  if (invoked) return runData
  return {
    ...runData,
    result: {
      ...runData.result,
      status: 'failed',
      error: [
        runData.result.error,
        'next-bundle-optimizer skill was not invoked',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  }
}

export function analyzeBrowserJs({
  fixture,
  runData,
}: RunCompleteContext): EvalRunData {
  if (!FIXTURES.has(fixture.name)) return runData
  const output = runData.outputContent?.eval ?? ''
  const match = output.match(/NEXT_EVAL_BROWSER_JS_RESULT:(\{[^\r\n]+\})/)
  if (!match) {
    if (runData.result.status === 'failed') return runData
    throw new Error('Missing browser JavaScript eval result')
  }
  const measurement: BrowserJsEvalResult = JSON.parse(match[1])
  readBrowserJsMeasurement(
    'NEXT_EVAL_BROWSER_JS:' + JSON.stringify(measurement.before)
  )
  readBrowserJsMeasurement(
    'NEXT_EVAL_BROWSER_JS:' + JSON.stringify(measurement.after)
  )
  return {
    ...runData,
    result: {
      ...runData.result,
      analysis: {
        ...runData.result.analysis,
        browserJs: measurement,
      },
    },
  }
}
