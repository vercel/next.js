#!/usr/bin/env node
// @ts-check
/**
 * Pack the locally-built `next` package and run agent evals against it.
 *
 *   pnpm eval <eval-name>             run one eval and its configured variants
 *   pnpm eval --suite regression      run a named eval suite
 *   pnpm eval <eval-name> --dry       preview without executing
 *   pnpm eval --all                   run every eval (slow — normally only CI does this)
 *   NEXT_SKIP_PACK=1 pnpm eval ...    reuse tarball from last run
 *
 * Mirrors run-tests.js: pack once, hand paths to child via env, forward args.
 *
 * We only pack `next`, not the whole workspace. The sandbox is remote Linux:
 *   - @next/swc: local darwin binary wouldn't run there; the sandbox downloads
 *     the right one at runtime (packages/next/src/build/swc/index.ts).
 *   - @next/env etc: resolved from npm at the pinned canary version.
 *
 * The experiments/ dir is generated fresh on every run and gitignored. This
 * keeps the variants in one place instead of maintaining N committed
 * experiment files that only differ by setup.
 */
const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')
const { packPackage } = require('./evals/lib/pack')
const { linkEnvironment } = require('./evals/lib/environment')
const { evaluateEffortGate } = require('./evals/lib/effort-gate')

const ROOT = __dirname

const EVALS_DIR = path.join(ROOT, 'evals')
const FIXTURES_DIR = path.join(EVALS_DIR, 'evals')
const EVAL_CONFIG_PATH = path.join(EVALS_DIR, 'eval.config.json')
const EVAL_SUITES_PATH = path.join(EVALS_DIR, 'eval.suites.json')
const EXPERIMENTS_DIR = path.join(EVALS_DIR, 'experiments')
const TARBALL_DIR = path.join(EVALS_DIR, '.tarballs')
const TARBALL = path.join(TARBALL_DIR, 'next.tgz')

/** @typedef {{ skills?: string[], timeout?: number, agentFeedback?: boolean, publish?: boolean, browserJs?: boolean, metrics?: string }} EvalConfig */
/** @type {Record<string, EvalConfig>} */
const EVAL_CONFIG = JSON.parse(fs.readFileSync(EVAL_CONFIG_PATH, 'utf-8'))

// The two variants we always compare. Order matters for output readability:
// baseline first so a contributor sees "does the agent fail without docs?"
// before "does it pass with docs?".
const BASE_VARIANTS = [
  {
    suffix: 'baseline',
    imports: `import { installNextJs, installPlaywright, prepareFixture } from '../lib/setup.js'`,
    setup: `await installNextJs(sandbox)\n    await installPlaywright(sandbox)\n    await prepareFixture(sandbox)`,
  },
  {
    suffix: 'agents-md',
    imports: `import { installNextJs, installPlaywright, prepareFixture, writeAgentsMd } from '../lib/setup.js'`,
    setup: `await installNextJs(sandbox)\n    await installPlaywright(sandbox)\n    await prepareFixture(sandbox)\n    await writeAgentsMd(sandbox)`,
  },
]

function pack() {
  packPackage(path.join(ROOT, 'packages/next'), TARBALL)
}

/** @param {string[] | null} selectedEvals  null means all evals */
function writeExperiments(
  selectedEvals,
  variants,
  timeout,
  runs,
  options = {}
) {
  fs.rmSync(EXPERIMENTS_DIR, { recursive: true, force: true })
  fs.mkdirSync(EXPERIMENTS_DIR, { recursive: true })

  for (const v of variants) {
    const variantEvals = v.evals ?? selectedEvals
    const evalsField = variantEvals
      ? `\n  evals: ${JSON.stringify(variantEvals.length === 1 ? variantEvals[0] : variantEvals)},`
      : ''
    const browserJsFixtures = Object.fromEntries(
      (variantEvals ?? listEvals())
        .filter((name) => readFixtureConfig(name).browserJs)
        .map((name) => {
          const pkg = JSON.parse(
            fs.readFileSync(
              path.join(FIXTURES_DIR, name, 'package.json'),
              'utf8'
            )
          )
          return [name, pkg.name]
        })
    )
    const measuresBrowserJs = Object.keys(browserJsFixtures).length > 0
    let onRunComplete = v.onRunComplete
    if (measuresBrowserJs) {
      const runData = onRunComplete
        ? `${onRunComplete}(context)`
        : 'context.runData'
      onRunComplete = `(context) => browserJs.onRunComplete({ ...context, runData: ${runData} })`
    }
    const body = `import type { ExperimentConfig } from '@vercel/agent-eval'
${v.imports}
${options.metrics ? `import { recordAgentTime } from '../lib/metrics.js'` : ''}
${measuresBrowserJs ? `import { createBrowserJsHooks } from '../lib/bundle-optimizer/hooks.js'\n\nconst browserJs = createBrowserJsHooks(${JSON.stringify(browserJsFixtures)}, ${JSON.stringify(v.skills ?? [])})\n` : ''}

const config: ExperimentConfig = {
  // Via the Vercel AI Gateway, so the OIDC token from \`vc env pull\` is the only
  // credential needed (it auths the sandbox, the codegen model, and the judge).
  agent: ${JSON.stringify(options.agent ?? 'vercel-ai-gateway/claude-code')},
  model: ${JSON.stringify(options.model ?? 'claude-opus-4-8')},${evalsField}
  // Cheap fixed grader for the agentic judge clauses in EVAL.ts files — every
  // run is graded by the same model regardless of the model under test.
  judge: { model: 'claude-haiku-4-5' },
  scripts: ['build'],
  runs: ${runs},
  earlyExit: ${runs === 1},
  timeout: ${timeout},
  sandbox: 'auto',
  ${options.metrics ? `copyFiles: 'all',` : ''}
  ${onRunComplete ? `onRunComplete: ${onRunComplete},` : ''}
  setup: async (sandbox) => {
    ${v.setup}
    ${options.metrics ? 'recordAgentTime(sandbox)' : ''}
    ${measuresBrowserJs ? 'return browserJs.setup(sandbox)' : ''}
  },
}

export default config
`
    fs.writeFileSync(path.join(EXPERIMENTS_DIR, `${v.suffix}.ts`), body)
  }
}

function listEvals() {
  return fs
    .readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

function readEvalSuites() {
  /** @type {unknown} */
  const parsed = JSON.parse(fs.readFileSync(EVAL_SUITES_PATH, 'utf-8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${EVAL_SUITES_PATH} must contain an object of eval suites`)
  }

  const fixtureNames = new Set(listEvals())
  const seen = new Map()
  /** @type {Record<string, string[]>} */
  const suites = {}

  for (const [suite, evalNames] of Object.entries(parsed)) {
    if (!Array.isArray(evalNames) || evalNames.length === 0) {
      throw new Error(`${EVAL_SUITES_PATH}: ${suite} must be a non-empty array`)
    }
    for (const evalName of evalNames) {
      if (typeof evalName !== 'string' || !fixtureNames.has(evalName)) {
        throw new Error(`${EVAL_SUITES_PATH}: unknown eval ${String(evalName)}`)
      }
      const previousSuite = seen.get(evalName)
      if (previousSuite) {
        throw new Error(
          `${EVAL_SUITES_PATH}: ${evalName} is in both ${previousSuite} and ${suite}`
        )
      }
      seen.set(evalName, suite)
    }
    suites[suite] = evalNames
  }

  const unclassified = [...fixtureNames].filter(
    (evalName) =>
      EVAL_CONFIG[evalName]?.publish !== false && !seen.has(evalName)
  )
  if (unclassified.length > 0) {
    throw new Error(
      `${EVAL_SUITES_PATH}: public evals must belong to a suite: ${unclassified.join(', ')}`
    )
  }

  return suites
}

function readFixtureConfig(evalName) {
  const config = EVAL_CONFIG[evalName] ?? {}
  const skillNames = config.skills ?? []
  if (
    !Array.isArray(skillNames) ||
    skillNames.some((name) => typeof name !== 'string')
  ) {
    throw new Error(
      `${EVAL_CONFIG_PATH}: ${evalName}.skills must be an array of skill names`
    )
  }
  if (
    config.timeout !== undefined &&
    (typeof config.timeout !== 'number' || config.timeout <= 0)
  ) {
    throw new Error(
      `${EVAL_CONFIG_PATH}: ${evalName}.timeout must be a positive number`
    )
  }
  if (
    config.agentFeedback !== undefined &&
    typeof config.agentFeedback !== 'boolean'
  ) {
    throw new Error(
      `${EVAL_CONFIG_PATH}: ${evalName}.agentFeedback must be a boolean`
    )
  }
  if (config.browserJs !== undefined && typeof config.browserJs !== 'boolean') {
    throw new Error(
      `${EVAL_CONFIG_PATH}: ${evalName}.browserJs must be a boolean`
    )
  }
  return {
    skills: skillNames,
    timeout: config.timeout ?? 720,
    agentFeedback: config.agentFeedback ?? false,
    browserJs: config.browserJs ?? false,
  }
}

function getExperimentSettings(selectedEvals) {
  const skillEvals = (selectedEvals ?? listEvals()).map((name) => ({
    name,
    ...readFixtureConfig(name),
  }))
  const timeout = Math.max(...skillEvals.map((config) => config.timeout))
  const configuredSkillEvals = skillEvals.filter(
    ({ skills }) => skills.length > 0
  )

  /** @type {Map<string, { skills: string[], evals: string[] }>} */
  const skillGroups = new Map()
  for (const { name, skills } of configuredSkillEvals) {
    const skillNames = [...new Set(skills)].sort()
    const key = skillNames.join(',')
    const group = skillGroups.get(key) ?? { skills: skillNames, evals: [] }
    group.evals.push(name)
    skillGroups.set(key, group)
  }

  const multipleSkillGroups = skillGroups.size > 1
  const skillVariants = [...skillGroups.values()].map(({ skills, evals }) => ({
    suffix: multipleSkillGroups ? `skills-${skills.join('-')}` : 'skills',
    imports: `import { installLocalSkills, installNextJs, installPlaywright, prepareFixture } from '../lib/setup.js'`,
    setup: `await installNextJs(sandbox)\n    await installPlaywright(sandbox)\n    await prepareFixture(sandbox)\n    await installLocalSkills(sandbox, ${JSON.stringify(skills)})`,
    skills,
    evals,
  }))

  /** @type {Map<string, { skills: string[], evals: string[] }>} */
  const feedbackGroups = new Map()
  for (const { name, skills, agentFeedback } of skillEvals) {
    if (!agentFeedback) continue
    const skillNames = [...new Set(skills)].sort()
    const key = skillNames.join(',')
    const group = feedbackGroups.get(key) ?? { skills: skillNames, evals: [] }
    group.evals.push(name)
    feedbackGroups.set(key, group)
  }

  const multipleFeedbackGroups = feedbackGroups.size > 1
  const feedbackVariants = [...feedbackGroups.values()].map(
    ({ skills, evals }) => ({
      suffix: multipleFeedbackGroups
        ? `agent-feedback-${skills.join('-') || 'no-skills'}`
        : 'agent-feedback',
      imports: `import { analyzeAgentFeedbackRun, installLocalSkills, installNextJs, prepareFixture, writeAgentFeedbackInstructions } from '../lib/setup.js'`,
      setup: `await installNextJs(sandbox)\n    await prepareFixture(sandbox)${
        skills.length > 0
          ? `\n    await installLocalSkills(sandbox, ${JSON.stringify(skills)})`
          : ''
      }\n    await writeAgentFeedbackInstructions(sandbox)`,
      onRunComplete: 'analyzeAgentFeedbackRun',
      evals,
    })
  )

  return {
    timeout,
    variants: [...BASE_VARIANTS, ...skillVariants, ...feedbackVariants],
  }
}

function main() {
  const evalSuites = readEvalSuites()
  const argv = require('yargs/yargs')(process.argv.slice(2))
    .command(
      '$0 [eval-name]',
      'Run an eval (baseline + agents-md variants)',
      (y) =>
        y.positional('eval-name', {
          type: 'string',
          describe: 'Fixture directory name',
        })
    )
    .boolean('all')
    .describe('all', 'Run every eval (slow — normally only CI does this)')
    .string('suite')
    .choices('suite', Object.keys(evalSuites))
    .describe('suite', 'Run every eval in a named suite')
    .boolean('dry')
    .describe('dry', 'Preview without executing')
    .boolean('metrics')
    .describe(
      'metrics',
      'Save the app and collect configured page and effort metrics'
    )
    .boolean('effort-gate')
    .describe(
      'effort-gate',
      'Compare five sequential baseline, agents-md, and skill effort samples'
    )
    .number('effort-samples')
    .default('effort-samples', 5)
    .describe(
      'effort-samples',
      'Samples per variant for --effort-gate (default: 5)'
    )
    .string('effort-pre-stack-tarball')
    .describe(
      'effort-pre-stack-tarball',
      'Pre-stack Next.js tarball to prepend to the effort comparison'
    )
    .string('agent')
    .describe('agent', 'Override the coding agent for every selected variant')
    .string('model')
    .describe('model', 'Override the coding model for every selected variant')
    .string('pricing')
    .describe('pricing', 'Gateway model pricing JSON for estimated model cost')
    .implies('pricing', 'metrics')
    .number('runs')
    .default('runs', 1)
    .describe('runs', 'Run each selected eval this many times')
    .array('variant')
    .string('variant')
    .describe('variant', 'Run only the named generated variant (repeatable)')
    .conflicts('all', 'eval-name')
    .conflicts('suite', ['all', 'eval-name'])
    .conflicts('effort-gate', ['all', 'suite', 'dry', 'metrics', 'variant'])
    .implies('effort-pre-stack-tarball', 'effort-gate')
    .check((argv) => {
      if (!argv.all && !argv.evalName && !argv.suite) {
        throw new Error(
          `Missing <eval-name>.\n\nAvailable evals:\n${listEvals()
            .map((n) => `  ${n}`)
            .join('\n')}`
        )
      }
      if (
        argv.evalName &&
        !fs.existsSync(path.join(FIXTURES_DIR, argv.evalName))
      ) {
        throw new Error(
          `Unknown eval: ${argv.evalName}\n(looked in ${FIXTURES_DIR})`
        )
      }
      if (!Number.isInteger(argv.runs) || argv.runs < 1) {
        throw new Error('--runs must be a positive integer')
      }
      if (!Number.isInteger(argv.effortSamples) || argv.effortSamples < 1) {
        throw new Error('--effort-samples must be a positive integer')
      }
      if (
        argv.effortPreStackTarball &&
        !fs.existsSync(path.resolve(argv.effortPreStackTarball))
      ) {
        throw new Error('--effort-pre-stack-tarball must point to a file')
      }
      const effortSamplesSpecified = process.argv
        .slice(2)
        .some(
          (arg) =>
            arg === '--effort-samples' || arg.startsWith('--effort-samples=')
        )
      if (effortSamplesSpecified && !argv.effortGate) {
        throw new Error('--effort-samples requires --effort-gate')
      }
      if (
        argv.effortGate &&
        process.argv
          .slice(2)
          .some((arg) => arg === '--runs' || arg.startsWith('--runs='))
      ) {
        throw new Error('--effort-gate sets its own sample count')
      }
      return true
    })
    .strict()
    .help().argv

  /** @type {string | undefined} */
  const evalName = argv.evalName
  /** @type {string[] | null} */
  const selectedEvals = argv.suite
    ? evalSuites[argv.suite]
    : argv.all
      ? null
      : [/** @type {string} */ (evalName)]
  const configuredCollector = evalName
    ? EVAL_CONFIG[evalName]?.metrics
    : undefined
  if (
    argv.effortGate &&
    (!/^[a-z0-9-]+$/.test(configuredCollector ?? '') ||
      !fs.existsSync(
        path.join(EVALS_DIR, 'metrics', `${configuredCollector}.mjs`)
      ))
  ) {
    throw new Error(
      '--effort-gate requires one eval with a configured metrics collector'
    )
  }
  if (
    argv.metrics &&
    (!selectedEvals ||
      selectedEvals.length !== 1 ||
      !/^[a-z0-9-]+$/.test(EVAL_CONFIG[selectedEvals[0]]?.metrics ?? '') ||
      !fs.existsSync(
        path.join(
          EVALS_DIR,
          'metrics',
          `${EVAL_CONFIG[selectedEvals[0]].metrics}.mjs`
        )
      ))
  ) {
    throw new Error(
      '--metrics requires one eval with a configured metrics collector'
    )
  }
  const { variants: availableVariants, timeout } =
    getExperimentSettings(selectedEvals)
  if (argv.pricing) {
    const pricing = JSON.parse(fs.readFileSync(argv.pricing, 'utf8'))
    if (!pricing.pricing || typeof pricing.pricing !== 'object') {
      throw new Error(
        "--pricing must contain the model's Gateway pricing object"
      )
    }
  }
  const requestedVariants = argv.variant ?? []
  const unknownVariants = requestedVariants.filter(
    (name) => !availableVariants.some((variant) => variant.suffix === name)
  )
  if (unknownVariants.length > 0) {
    throw new Error(
      `Unknown variant: ${unknownVariants.join(', ')}\nAvailable variants: ${availableVariants
        .map((variant) => variant.suffix)
        .join(', ')}`
    )
  }
  let variants =
    requestedVariants.length > 0
      ? availableVariants.filter((variant) =>
          requestedVariants.includes(variant.suffix)
        )
      : availableVariants
  if (argv.effortGate) {
    variants = variants.filter(({ suffix }) =>
      ['baseline', 'agents-md', 'skills'].includes(suffix)
    )
    if (variants.length !== 3) {
      throw new Error(
        '--effort-gate requires baseline, agents-md, and skills variants'
      )
    }
    if (argv.effortPreStackTarball) {
      variants.unshift({
        suffix: 'pre-stack',
        imports: `import { installNextJs, installPlaywright, prepareFixture } from '../lib/setup.js'`,
        setup: `await installNextJs(sandbox, ${JSON.stringify(path.resolve(argv.effortPreStackTarball))}, { requireNextApp: true })\n    await installPlaywright(sandbox)\n    await prepareFixture(sandbox)`,
      })
    }
  }
  // agent-eval 1.3 dropped run-all/--dry: `run` takes explicit experiment names,
  // and `status` is the read-only preview.
  const agentEvalArgs = argv.dry
    ? ['status']
    : ['run', ...variants.map((v) => v.suffix), '--force']

  // Fixtures that install their own pinned app (such as Pokédex) do not use
  // the local package. Match installNextJs's root-package check before packing.
  const needsLocalNext = (selectedEvals ?? listEvals()).some((name) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, name, 'package.json'), 'utf8')
    )
    return Boolean(pkg.dependencies?.next ?? pkg.devDependencies?.next)
  })
  if (needsLocalNext) {
    if (!fs.existsSync(path.join(ROOT, 'packages/next/dist'))) {
      console.error(
        'packages/next/dist not found. Run `pnpm --filter=next build` first.'
      )
      process.exit(1)
    }

    if (process.env.NEXT_SKIP_PACK && fs.existsSync(TARBALL)) {
      console.log('> Reusing existing tarball (NEXT_SKIP_PACK=1)')
    } else {
      console.log('> Packing next...')
      pack()
      const mb = (fs.statSync(TARBALL).size / 1024 / 1024).toFixed(1)
      console.log(`  ${TARBALL} (${mb} MB)`)
    }
  }

  // agent-eval loads .env / .env.local from its own cwd (evals/). `vc env pull`
  // writes to the repo root, so symlink them into evals/ for agent-eval to find.
  linkEnvironment(ROOT, EVALS_DIR)

  writeExperiments(
    selectedEvals,
    variants,
    timeout,
    argv.effortGate ? 1 : argv.runs,
    {
      ...argv,
      metrics: argv.metrics || argv.effortGate,
    }
  )
  console.log(
    evalName
      ? `> Running ${evalName} (${variants.map((v) => v.suffix).join(' + ')})`
      : `> Running ${argv.suite ? `${argv.suite} suite` : 'all evals'} (${variants.map((v) => v.suffix).join(' + ')})`
  )

  // Same handoff pattern as run-tests.js with NEXT_TEST_PKG_PATHS. We invoke
  // the bin directly rather than via `pnpm exec` because pnpm resets cwd to
  // the workspace root, but agent-eval resolves experiments/ from process.cwd().
  const bin = path.join(ROOT, 'node_modules/.bin/agent-eval')
  const samples = Object.fromEntries(variants.map(({ suffix }) => [suffix, []]))
  let result
  let previousResults
  const iterations = argv.effortGate ? argv.effortSamples : 1
  for (let iteration = 1; iteration <= iterations; iteration++) {
    if (argv.effortGate)
      console.log(`> Effort sample ${iteration}/${iterations}`)
    previousResults = new Map(
      variants.map((variant) => {
        const directory = path.join(EVALS_DIR, 'results', variant.suffix)
        return [
          variant.suffix,
          new Set(fs.existsSync(directory) ? fs.readdirSync(directory) : []),
        ]
      })
    )
    result = spawnSync(bin, agentEvalArgs, {
      cwd: EVALS_DIR,
      stdio: 'inherit',
      env: { ...process.env, NEXT_EVAL_TARBALL: TARBALL },
    })
    if (result.error || (!argv.effortGate && result.status !== 0)) break

    if (argv.effortGate) {
      let collectionFailed = false
      for (const variant of variants) {
        const directory = path.join(EVALS_DIR, 'results', variant.suffix)
        const existingResults = previousResults.get(variant.suffix)
        const timestamps = []
        for (const timestamp of fs.readdirSync(directory)) {
          if (!existingResults.has(timestamp)) timestamps.push(timestamp)
        }
        if (timestamps.length !== 1) {
          throw new Error(
            `Expected one new ${variant.suffix} result, found ${timestamps.length}`
          )
        }
        const run = path.join(
          directory,
          timestamps[0],
          selectedEvals[0],
          'run-1'
        )
        const measured = spawnSync(
          process.execPath,
          [
            '--import=tsx',
            path.join(EVALS_DIR, 'metrics/report.mjs'),
            'collect',
            run,
            configuredCollector,
          ],
          { cwd: ROOT, stdio: 'inherit', env: process.env }
        )
        const metricsPath = path.join(run, 'metrics.json')
        // report.mjs still writes tokens and status when only the collector fails.
        if (
          measured.error ||
          (measured.status !== 0 && !fs.existsSync(metricsPath))
        ) {
          result = measured
          collectionFailed = true
          break
        }
        const sample = JSON.parse(fs.readFileSync(metricsPath, 'utf8'))
        if (measured.status !== 0) {
          console.error(
            `Collector failed for ${variant.suffix}; keeping its token count. See ${path.join(run, 'metrics-error.json')}.`
          )
          sample.collectorFailed = true
        }
        samples[variant.suffix].push(sample)
      }
      if (collectionFailed) break
      result = { ...result, status: 0 }
    }
  }
  if (result.error) {
    // ENOENT (missing bin), EACCES, etc. — spawnSync returns status: null
    // without printing anything, so surface it.
    console.error(`Failed to run ${bin}: ${result.error.message}`)
    if (/** @type {NodeJS.ErrnoException} */ (result.error).code === 'ENOENT') {
      console.error('Did you run `pnpm install`?')
    }
    process.exit(1)
  }
  let metricsFailed = false
  if (argv.metrics && !argv.dry) {
    for (const variant of variants) {
      const directory = path.join(EVALS_DIR, 'results', variant.suffix)
      if (!fs.existsSync(directory)) continue
      for (const timestamp of fs.readdirSync(directory)) {
        if (previousResults.get(variant.suffix).has(timestamp)) continue
        const evalDirectory = path.join(directory, timestamp, selectedEvals[0])
        if (!fs.existsSync(evalDirectory)) continue
        for (const run of fs
          .readdirSync(evalDirectory)
          .filter((name) => /^run-\d+$/.test(name))) {
          const measured = spawnSync(
            process.execPath,
            [
              '--import=tsx',
              path.join(EVALS_DIR, 'metrics/report.mjs'),
              'collect',
              path.join(evalDirectory, run),
              EVAL_CONFIG[selectedEvals[0]].metrics,
              ...(argv.pricing ? [path.resolve(argv.pricing)] : []),
            ],
            { cwd: ROOT, stdio: 'inherit', env: process.env }
          )
          if (measured.error || measured.status !== 0) metricsFailed = true
        }
      }
    }
  }
  if (metricsFailed)
    console.error(
      'Page measurement failed. Eval scores are unchanged; retry the collector on the saved run.'
    )
  let effortGateFailed = false
  const percent = (value) =>
    value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`
  if (argv.effortGate && !result.error && result.status === 0) {
    const gate = evaluateEffortGate(
      samples.baseline,
      samples['agents-md'],
      samples.skills
    )
    for (const variant of variants.map(({ suffix }) => suffix)) {
      console.log(
        `${variant} samples: ${samples[variant]
          .map(({ status, inputTokens }) => `${inputTokens} (${status})`)
          .join(', ')}`
      )
      // Only collectors that inspect the transcript report these fields.
      if (
        samples[variant].some(
          (sample) =>
            sample.collector &&
            'requestInsightsBeforeProjectInspection' in sample.collector
        )
      ) {
        const diagnosticFirst = samples[variant].filter(
          (sample) => sample.collector?.requestInsightsBeforeProjectInspection
        ).length
        const searchedDocs = samples[variant].filter(
          (sample) => sample.collector?.bundledDocsSearches?.length
        ).length
        const readDocs = samples[variant].filter(
          (sample) => sample.collector?.bundledDocsReads?.length
        ).length
        console.log(
          `${variant} Request Insights before project inspection: ${diagnosticFirst}/${gate.sampleCount}`
        )
        console.log(
          `${variant} bundled docs searched/read: ${searchedDocs}/${gate.sampleCount}, ${readDocs}/${gate.sampleCount}`
        )
      }
    }
    console.log(
      `Effort gate: baseline median ${gate.baselineMedian}, agents-md median ${gate.agentsMdMedian}, skills median ${gate.skillsMedian}; reduction vs baseline ${percent(gate.agentsMdReduction)} agents-md, ${percent(gate.skillsReduction)} skills; pass rate ${gate.baselinePasses}/${gate.sampleCount} baseline, ${gate.agentsMdPasses}/${gate.sampleCount} agents-md, ${gate.skillsPasses}/${gate.sampleCount} skills`
    )
    const reportDirectory = path.join(EVALS_DIR, 'results', 'effort-gate')
    fs.mkdirSync(reportDirectory, { recursive: true })
    const reportPath = path.join(
      reportDirectory,
      `${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${evalName}.json`
    )
    fs.writeFileSync(
      reportPath,
      JSON.stringify({ eval: evalName, ...gate, samples }, null, 2) + '\n'
    )
    console.log(`Effort report: ${reportPath}`)
    effortGateFailed = !gate.passed
  }
  process.exit(
    (result.status ?? 1) || (metricsFailed || effortGateFailed ? 1 : 0)
  )
}

main()
