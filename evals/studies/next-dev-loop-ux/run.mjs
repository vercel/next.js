import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { getAgent } from '@vercel/agent-eval'
import { prepare, study, task } from './prepare.mjs'

const [condition, directory, model = task.model] = process.argv.slice(2)
if (!['baseline', 'skills'].includes(condition) || !directory) {
  throw new Error(
    'Usage: run.mjs baseline|skills <new-result-directory> [model]'
  )
}
for (const name of ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN']) {
  if (!process.env[name]) throw new Error(`Missing ${name}`)
}
delete process.env.VERCEL_TOKEN
const output = resolve(directory)
if (existsSync(output)) throw new Error('Refusing to overwrite an attempt')
mkdirSync(output, { recursive: true })
cpSync(study, join(output, 'harness'), { recursive: true })
const { fixture } = await prepare(join(output, 'workspace'))
const prompt = readFileSync(join(study, 'task/PROMPT.md'), 'utf8')
const repo = resolve(study, '../../..')
// Shared setup helpers resolve checkout Skills relative to evals/.
process.chdir(join(repo, 'evals'))
const { installPlaywright, installLocalSkills } = await import(
  '../../lib/setup.ts'
)
writeFileSync(
  join(output, 'provenance.json'),
  JSON.stringify(
    {
      ...task,
      model,
      condition,
      prompt,
      cacheComponents: true,
      partialPrefetching: true,
      nextVersion: '16.4.2',
      nextRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim(),
    },
    null,
    2
  )
)

const agent = getAgent(task.agent)
const install = agent.definition.install
agent.definition.install = (options) =>
  install(options).map((step) =>
    step.kind === 'command' && step.args?.includes('@openai/codex')
      ? {
          ...step,
          args: step.args.map((arg) =>
            arg === '@openai/codex' ? `@openai/codex@${task.codexVersion}` : arg
          ),
        }
      : step
  )
let agentSeconds = null
let step = 0
const result = await agent.run(fixture, {
  prompt,
  model,
  modelPolicy: 'agent-default',
  apiKey: process.env.AI_GATEWAY_API_KEY,
  sandbox: 'vercel',
  validation: 'none',
  scripts: [],
  timeout: 3600000,
  disableBundledSkills: true,
  setup: async (sandbox) => {
    console.log('Preparing', condition, sandbox.sandboxId)
    async function run(cmd, args) {
      const r = await sandbox.runCommand(cmd, args)
      writeFileSync(
        join(output, `setup-${++step}.log`),
        r.stdout + '\n' + r.stderr
      )
      if (r.exitCode !== 0)
        throw new Error(`Setup failed; see setup-${step}.log`)
    }
    await sandbox.writeFiles({
      'package-lock.json': readFileSync(
        join(fixture, 'package-lock.json'),
        'utf8'
      ),
      '.gitignore':
        'node_modules/\n__agent_eval__/\ndata/\n.data-cache/\n.next*/\ntest-results/\nplaywright-report/\n*.log\n',
    })
    await run('npm', ['ci', '--no-audit', '--no-fund'])
    await installPlaywright(sandbox)
    await run('bash', ['scripts/setup-data.sh'])
    await run('npm', ['install', '--prefix', 'app', '--no-audit', '--no-fund'])
    await run('npm', [
      'install',
      '--global',
      `agent-browser@${task.agentBrowser}`,
    ])
    await run('agent-browser', ['install'])
    if (condition === 'skills')
      await installLocalSkills(sandbox, ['next-dev-loop'])
    const original = sandbox.runCommand.bind(sandbox)
    sandbox.runCommand = async (cmd, args, options) => {
      if (cmd !== 'node' || args?.[0] !== '__agent_eval__/run.mjs')
        return original(cmd, args, options)
      console.log('Agent started', condition)
      const started = Date.now()
      try {
        return await original(
          'timeout',
          [
            '--signal=TERM',
            '--kill-after=30',
            String(task.agentTimeoutSeconds),
            'node',
            ...args,
          ],
          options
        )
      } finally {
        agentSeconds = (Date.now() - started) / 1000
        writeFileSync(
          join(output, 'timing.json'),
          JSON.stringify({ agentSeconds })
        )
      }
    }
  },
  agentOptions: {
    afterAgent: async (sandbox) => {
      // The CLI runner may be interrupted before returning its buffered output.
      const trace = await sandbox.runCommand('python3', [
        '-c',
        "import glob,os; files=sorted(glob.glob(os.path.expanduser('~/.codex/sessions/**/*.jsonl'),recursive=True)); print(open(files[-1]).read() if files else '',end='')",
      ])
      if (trace.exitCode === 0 && trace.stdout.trim())
        writeFileSync(join(output, 'transcript-session.jsonl'), trace.stdout)
      const r = await sandbox.runCommand('tar', [
        '--exclude=node_modules',
        '--exclude=.next',
        '--exclude=.next-*',
        '--exclude=.git',
        '--exclude=.env*',
        '--exclude=*.log',
        '-czf',
        '/tmp/pokedex-app.tgz',
        'app',
      ])
      if (r.exitCode !== 0) throw new Error('Cannot preserve generated app')
      writeFileSync(
        join(output, 'app.tgz'),
        await sandbox.readFileBuffer('/tmp/pokedex-app.tgz')
      )
    },
  },
})
const transcript =
  result.transcript ||
  (existsSync(join(output, 'transcript-session.jsonl'))
    ? readFileSync(join(output, 'transcript-session.jsonl'), 'utf8')
    : '')
writeFileSync(join(output, 'transcript-raw.jsonl'), transcript)
writeFileSync(join(output, 'agent-output.txt'), result.output || '')
writeFileSync(
  join(output, 'result.json'),
  JSON.stringify(
    {
      model,
      observedModel: result.observedModel,
      status: result.success ? 'awaiting_verification' : 'agent_failed',
      error: result.error,
      agentSeconds,
      duration: result.duration / 1000,
      sandboxId: result.sandboxId,
    },
    null,
    2
  )
)
console.log(
  condition,
  result.success ? 'ready for verification' : 'agent failed'
)
if (!transcript || !existsSync(join(output, 'app.tgz'))) process.exitCode = 1
