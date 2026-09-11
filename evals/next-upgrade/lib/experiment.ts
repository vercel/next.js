import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  getAgent,
  registerAgent,
  type ExperimentConfig,
  type AgentRunOptions,
  type Agent,
} from '@vercel/agent-eval'
import { setupUpgrade } from './setup'
import { withUpgradeSandbox } from './sandbox'

const GATEWAY_MODELS = {
  codex: 'openai/gpt-5.6-luna',
  claude: 'anthropic/claude-haiku-4.5',
} as const

// agent-eval 2.2.1 exposes the registry publicly. Its pinned orchestrator is used
// here to retain sandbox/auth/validation behavior while replacing only the runner.
export function upgradeExperiment(
  harness: 'codex' | 'claude',
  model?: string
): ExperimentConfig {
  const native = getAgent(
    `vercel-ai-gateway/${harness === 'claude' ? 'claude-code' : 'codex'}`
  )
  // The parser recognizes native harness names inside custom adapter names.
  // Keep a distinct registry entry so repeated config loads still find the
  // original native runner, rather than wrapping this adapter recursively.
  const name = `next-upgrade/${harness === 'claude' ? 'claude-code' : 'codex'}`
  const require = createRequire(import.meta.url)
  const packageRoot = dirname(
    require.resolve('@vercel/agent-eval/package.json')
  )
  const orchestrator = pathToFileURL(
    join(packageRoot, 'dist/lib/agents/plugin/orchestrator.js')
  ).href
  const definition: Agent['definition'] = {
    ...native.definition,
    name,
    runnerPath: join(__dirname, 'run-agent.mjs'),
    // These inputs live outside the fixture, so agent-eval's default fingerprint
    // would otherwise deduplicate attempts against different Next.js builds.
    fingerprintExtra: (config) => {
      const inputs = [
        process.env.NEXT_UPGRADE_EVAL_NEXT_TARBALL,
        process.env.NEXT_UPGRADE_EVAL_CODEMOD_TARBALL,
        ...readdirSync(__dirname)
          .filter((file) => /\.(?:ts|mjs|cjs|py)$/.test(file))
          .sort()
          .map((file) => join(__dirname, file)),
      ]
      if (inputs.some((file) => !file))
        throw new Error(
          'Run through pnpm eval:upgrade to fingerprint the packed tools.'
        )
      const hash = createHash('sha256')
      for (const file of inputs) hash.update(readFileSync(file!))
      return {
        ...native.definition.fingerprintExtra?.(config),
        upgradeInputs: hash.digest('hex'),
      }
    },
    // setupUpgrade installed the OLD app with pnpm. Do not replace its lockfile
    // with the default adapter's npm install after establishing the baseline.
    install: (options: AgentRunOptions) =>
      native.definition
        .install(options)
        .filter(
          (step) =>
            !(
              step.kind === 'command' &&
              step.cmd === 'npm' &&
              step.args?.length === 1 &&
              step.args[0] === 'install'
            )
        ),
  }
  registerAgent({
    ...native,
    name,
    definition,
    run: async (fixture, options) => {
      const result = await withUpgradeSandbox(async () =>
        (await import(orchestrator)).runWithDefinition(
          definition,
          fixture,
          options
        )
      )
      // The framework's failed-run summary omits terminal output. Retain the
      // adapter result so setup failures can be diagnosed after sandbox cleanup.
      const directory = join(__dirname, '..', 'results', 'diagnostics')
      mkdirSync(directory, { recursive: true })
      writeFileSync(
        join(directory, `${harness}-${basename(fixture)}-${Date.now()}.json`),
        JSON.stringify(result, null, 2)
      )
      return result
    },
  })
  return {
    agent: name,
    model:
      model ||
      process.env[
        harness === 'codex'
          ? 'NEXT_UPGRADE_CODEX_MODEL'
          : 'NEXT_UPGRADE_CLAUDE_MODEL'
      ] ||
      GATEWAY_MODELS[harness],
    evals: process.env.NEXT_UPGRADE_EVAL_CASE || [
      'same-major',
      'major-migration',
      'existing-pr',
      'lookup-blocked',
    ],
    runs: 1,
    earlyExit: false,
    timeout: 1200,
    scripts: [],
    sandbox: 'vercel',
    setup: (sandbox) =>
      setupUpgrade(sandbox, harness, native.definition.runnerPath),
  }
}
