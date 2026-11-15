import { join } from 'node:path'
import { build } from 'esbuild'
import { readBrowserJsMeasurement } from './browser-js.js'
import type { BaselineCheck, BrowserJsEvalResult } from './browser-js.js'
import type {
  EvalRunData,
  RunCompleteHook,
  RunCompleteContext,
  Sandbox,
  SetupFunction,
  SetupResult,
} from '@vercel/agent-eval'
import { parseTranscript } from '@vercel/agent-eval'

export function createBrowserJsHooks(
  fixtures: Record<string, string>,
  skills: string[]
): { setup: SetupFunction; onRunComplete: RunCompleteHook } {
  return {
    setup: async (sandbox) => {
      const pkg = JSON.parse(await sandbox.readFile('package.json'))
      const fixture = Object.keys(fixtures).find(
        (name) => fixtures[name] === pkg.name
      )
      if (fixture) return prepareBrowserJs(sandbox, fixture)
    },
    onRunComplete: (context) => {
      if (!Object.hasOwn(fixtures, context.fixture.name)) return context.runData
      const runData = skills.includes('next-bundle-optimizer')
        ? assertBundleOptimizerSkillInvoked(context)
        : context.runData
      return analyzeBrowserJs({ ...context, runData })
    },
  }
}

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

async function prepareBrowserJs(
  sandbox: Sandbox,
  fixture: string
): Promise<SetupResult> {
  const bundled = await build({
    entryPoints: [join(process.cwd(), 'evals', fixture, 'EVAL.ts')],
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    write: false,
  })
  const validationFiles = { 'EVAL.ts': bundled.outputFiles[0].text }
  const configPath = '__agent_eval__/browser-js-baseline.config.mjs'
  const reportPath = '__agent_eval__/browser-js-baseline-results.json'
  let baselineChecks: BaselineCheck[] = []
  let before: BrowserJsEvalResult['before']
  try {
    await sandbox.writeFiles({
      ...validationFiles,
      [configPath]: `export default { test: { include: ['EVAL.ts'], reporters: ['default', 'json'], outputFile: '${reportPath}', bail: 0 } }`,
    })
    const checks = await sandbox.runCommand(
      'npx',
      ['vitest', 'run', '--config', configPath],
      {
        env: {
          NEXT_EVAL_BROWSER_JS_PHASE: 'before',
        },
      }
    )
    if (checks.exitCode !== 0 && checks.exitCode !== 1) {
      throw new Error(`Baseline assertions could not run:\n${checks.stderr}`)
    }
    const match = checks.stdout.match(
      /NEXT_EVAL_BROWSER_JS_RESULT:(\{[^\r\n]+\})/
    )
    if (!match)
      throw new Error(
        `Browser JavaScript baseline failed:\n${checks.stdout}\n${checks.stderr}`
      )
    const measurement: BrowserJsEvalResult = JSON.parse(match[1])
    before = readBrowserJsMeasurement(
      'NEXT_EVAL_BROWSER_JS:' + JSON.stringify(measurement.before)
    )
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
      `import { rm } from 'node:fs/promises'; await Promise.all(${JSON.stringify(['EVAL.ts', configPath, reportPath])}.map(path => rm(path, { force: true })))`,
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
  return {
    validationFiles,
    validationEnv: {
      NEXT_EVAL_BROWSER_JS_BEFORE: JSON.stringify(before),
    },
  }
}

function assertBundleOptimizerSkillInvoked({
  config,
  runData,
}: RunCompleteContext): EvalRunData {
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

function analyzeBrowserJs({ runData }: RunCompleteContext): EvalRunData {
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
