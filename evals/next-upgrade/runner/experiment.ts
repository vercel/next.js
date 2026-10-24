import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ExperimentConfig,
  Sandbox,
  SandboxManager,
} from '@vercel/agent-eval'
import { captureArtifact, type Artifact } from './artifact'
import { loadCase, setupFixture, toolsDirectory } from './fixture'
import { verifyRun, type Verdict } from '../verifier/verify'

export function upgradeExperiment(
  harness: 'codex' | 'claude-code'
): ExperimentConfig {
  const name = process.env.NEXT_UPGRADE_EVAL_CASE
  const root = process.env.NEXT_UPGRADE_EVAL_RUN_ROOT
  if (!name || !root) {
    throw new Error('Use pnpm eval:upgrade')
  }
  const scrub = (text: string): string => {
    for (const name of [
      'VERCEL_OIDC_TOKEN',
      'AI_GATEWAY_API_KEY',
      'VERCEL_TOKEN',
    ]) {
      const secret = process.env[name]
      if (secret) {
        text = text.split(secret).join('[REDACTED]')
      }
    }
    return text
  }
  const scenario = loadCase(name)
  const label = harness === 'codex' ? 'codex' : 'claude'
  const directory = join(
    process.env.NEXT_UPGRADE_EVAL_RESULTS ?? root,
    'evidence',
    label
  )
  let artifact: Artifact | null = null
  mkdirSync(directory, { recursive: true })
  return {
    agent: `vercel-ai-gateway/${harness}`,
    model: harness === 'codex' ? 'openai/gpt-5.6-terra' : 'claude-sonnet-4-6',
    judge: {
      agent: 'vercel-ai-gateway/claude-code',
      model: 'claude-haiku-4-5',
    },
    evals: name,
    runs: 1,
    earlyExit: false,
    timeout: 1800,
    copyFiles: 'none',
    validation: scenario.kind === 'direct' ? 'none' : 'vitest',
    sandbox: 'vercel',
    setup: setupFixture,
    agentOptions: {
      // Suite-only hooks in the pinned patch leave ordinary eval lifecycle intact.
      disableFastRetry: true,
      afterAgent: async (sandbox: Sandbox) => {
        try {
          artifact = await captureArtifact(sandbox, directory)
        } catch (error) {
          if (!existsSync(join(directory, 'capture-failure.json'))) {
            writeFileSync(
              join(directory, 'capture-failure.json'),
              scrub(
                JSON.stringify({ kind: 'transport', reason: String(error) })
              )
            )
          }
          throw error
        }
      },
      afterValidation: async (sandbox: SandboxManager) => {
        // agent-eval installs the validation runner. Record the actual version
        // after validation instead of installing another copy in a suite hook.
        if (scenario.kind === 'nudge') {
          const toolchain = JSON.parse(
            await sandbox.readFile('node_modules/vitest/package.json')
          )
          writeFileSync(
            join(directory, 'grader-toolchain.json'),
            JSON.stringify(
              { vitest: toolchain.version, judge: 'claude-haiku-4-5' },
              null,
              2
            )
          )
        }
        if (
          scenario.kind === 'nudge' &&
          (await sandbox.fileExists(`${toolsDirectory}/nudge-verdict.json`))
        ) {
          writeFileSync(
            join(directory, 'nudge-verdict.json'),
            scrub(
              await sandbox.readFile(`${toolsDirectory}/nudge-verdict.json`)
            )
          )
        }
      },
    },
    onRunComplete: async ({ runData }) => {
      writeFileSync(
        join(directory, 'native-result.json'),
        scrub(JSON.stringify(runData.result, null, 2))
      )
      let verdict: Verdict
      try {
        verdict = await verifyRun(name, scenario, artifact, runData, directory)
      } catch (error) {
        verdict = {
          status: 'invalid',
          checks: {},
          reason: error instanceof Error ? error.message : String(error),
        }
      }
      verdict = JSON.parse(scrub(JSON.stringify(verdict)))
      writeFileSync(
        join(directory, 'verdict.json'),
        JSON.stringify(verdict, null, 2)
      )
      return {
        ...runData,
        result: {
          ...runData.result,
          status: verdict.status === 'passed' ? 'passed' : 'failed',
          error:
            verdict.status === 'passed'
              ? undefined
              : `${verdict.status}: ${verdict.reason}`,
          analysis: { ...runData.result.analysis, upgradeEval: verdict },
        },
      }
    },
  }
}
