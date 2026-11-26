import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { load } from 'js-yaml'

const sourceRoot = resolve(__dirname, '../..')
const actionRoot = join(sourceRoot, '.github/actions/next-upgrade')
const fixtureRoot = join(
  __dirname,
  '../e2e/agent-upgrade-ci/fixtures/single-app-npm'
)
const sourceVersion = '16.1.6'
const targetVersion = '16.2.0'
const appPath = 'apps/site'
const credential = 'dummy-test-key'
// Each preparation runs a real `npm ci` for the fixture app.
const prepareTimeout = 600_000

type Workflow = {
  on: { workflow_call: { secrets: Record<string, unknown> } }
  jobs: Record<
    string,
    {
      with?: Record<string, unknown>
      needs?: string | string[]
      if?: string
      outputs?: Record<string, string>
      permissions?: Record<string, string>
      steps?: { name?: string; env?: Record<string, string>; run?: string }[]
    }
  >
}

function readYaml(path: string) {
  return load(readFileSync(path, 'utf8')) as Workflow
}

function workflowExpression(expression: string) {
  return ['${', '{ ', expression, ' }}'].join('')
}

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function runScript<T>(script: string, input: unknown, cwd: string): T {
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script, JSON.stringify(input)],
    { cwd, encoding: 'utf8', timeout: prepareTimeout }
  )
  return JSON.parse(output.trimEnd().split('\n').pop()!) as T
}

describe('scheduled Next.js upgrade workflow', () => {
  const workflow = () =>
    readYaml(join(sourceRoot, '.github/workflows/next-upgrade.yml'))
  const checkout = expect.objectContaining({
    with: expect.objectContaining({
      repository: workflowExpression('job.workflow_repository'),
      ref: workflowExpression('job.workflow_sha'),
      'persist-credentials': false,
      'sparse-checkout': expect.stringContaining(
        '.github/actions/next-upgrade/'
      ),
    }),
  })
  const approvedApp = {
    NEXT_UPGRADE_APP_PATH: workflowExpression('inputs.app-path'),
    NEXT_UPGRADE_POLICY: workflowExpression('inputs.policy'),
  }

  const pinnedNext = expect.objectContaining({
    run: 'node install-next.mjs',
    env: expect.objectContaining({
      WORKFLOW_SHA: workflowExpression('job.workflow_sha'),
      PREVIEW_PACKAGE: workflowExpression('inputs.preview-package'),
    }),
  })

  it('decides whether to upgrade before the agent or its credential are set up', () => {
    const { jobs } = workflow()
    expect(jobs.prepare).toMatchObject({
      permissions: { contents: 'read' },
      outputs: {
        status: workflowExpression('steps.assess.outputs.status'),
        'base-sha': workflowExpression('steps.assess.outputs.base-sha'),
      },
      steps: expect.arrayContaining([
        checkout,
        pinnedNext,
        expect.objectContaining({
          name: 'Check whether an upgrade is needed',
          env: expect.objectContaining({
            ...approvedApp,
            NEXT_UPGRADE_STAGE: 'assess',
          }),
        }),
      ]),
    })
    const prepare = JSON.stringify(jobs.prepare)
    expect(prepare).not.toContain('agent-credential')
    expect(prepare).not.toContain('Install the selected agent')
    expect(prepare).not.toContain('useradd')
  })

  it('runs the agent only for a ready upgrade and isolates its credential', () => {
    const { jobs } = workflow()
    expect(jobs.upgrade).toMatchObject({
      needs: 'prepare',
      if: workflowExpression("needs.prepare.outputs.status == 'ready'"),
      permissions: { contents: 'read' },
      steps: expect.arrayContaining([
        // The agent works on the commit the prepare job assessed.
        expect.objectContaining({
          with: expect.objectContaining({
            path: 'consumer',
            ref: workflowExpression('needs.prepare.outputs.base-sha'),
          }),
        }),
        checkout,
        pinnedNext,
        expect.objectContaining({
          name: 'Upgrade Next.js with the agent',
          env: expect.objectContaining({
            ...approvedApp,
            NEXT_UPGRADE_AGENT_CREDENTIAL: workflowExpression(
              'secrets.agent-credential'
            ),
            NEXT_UPGRADE_MODEL: workflowExpression('inputs.model'),
            NEXT_UPGRADE_EFFORT: workflowExpression('inputs.effort'),
            NEXT_UPGRADE_AGENT_USER: 'next-upgrade-agent',
          }),
        }),
        // The agent runs as a user without sudo or access to the runner.
        expect.objectContaining({
          run: expect.stringMatching(
            /^sudo useradd .*--no-create-home .*next-upgrade-agent$/
          ),
        }),
      ]),
    })
    const upgradeStep = jobs.upgrade.steps!.find(
      ({ name }) => name === 'Upgrade Next.js with the agent'
    )!
    expect(upgradeStep.env).not.toHaveProperty('NEXT_UPGRADE_STAGE')
    const serialized = JSON.stringify(jobs)
    expect(serialized.match(/secrets\.agent-credential/g)).toHaveLength(1)
    // Consumer runs use the published package and never build the monorepo.
    expect(serialized).not.toMatch(/pnpm|corepack|turbo|taskr/)
  })

  it('publishes with its own token in a job that never installs Next.js', () => {
    const { on, jobs } = workflow()
    expect(jobs.publish).toMatchObject({
      needs: ['prepare', 'upgrade'],
      permissions: { contents: 'read' },
      steps: expect.arrayContaining([
        checkout,
        expect.objectContaining({
          run: 'node install-next.mjs',
          env: expect.objectContaining({ NEXT_UPGRADE_DEPS_ONLY: 'true' }),
        }),
        // Publication checks the index against the same approved inputs.
        expect.objectContaining({
          env: expect.objectContaining({
            ...approvedApp,
            GH_TOKEN: workflowExpression('secrets.publish-token'),
          }),
        }),
      ]),
    })
    expect(JSON.stringify(jobs.publish)).not.toContain('PREVIEW_PACKAGE')
    // The token check, the early pull request check and publication.
    expect(JSON.stringify(jobs).match(/secrets\.publish-token/g)).toHaveLength(
      3
    )
    expect(JSON.stringify(jobs.prepare)).not.toContain('publish-token')
    expect(JSON.stringify(jobs.upgrade)).not.toContain('publish-token')
    expect(on.workflow_call.secrets['publish-token']).toEqual({
      required: true,
    })
  })

  it('stops in preflight without the token or with an open upgrade pull request', () => {
    const { jobs } = workflow()
    const { preflight } = jobs
    expect(preflight.permissions).toEqual({ contents: 'read' })
    expect(preflight.outputs).toEqual({
      'pull-request': workflowExpression('steps.existing.outputs.pull-request'),
    })
    // The token check comes first and runs nothing else.
    expect(preflight.steps![0].env).toEqual({
      PUBLISH_TOKEN_PROVIDED: workflowExpression("secrets.publish-token != ''"),
    })
    expect(preflight.steps![0].run).toMatch(
      /if \[ "\$PUBLISH_TOKEN_PROVIDED" != true \]; then\n[^\n]+\n\s+exit 1\n/
    )
    expect(preflight.steps).toContainEqual(
      expect.objectContaining({
        name: 'Check for an open upgrade pull request',
        env: expect.objectContaining({
          ...approvedApp,
          NEXT_UPGRADE_STAGE: 'check',
          GH_TOKEN: workflowExpression('secrets.publish-token'),
        }),
      })
    )
    // Preflight never installs Next.js or touches the consumer.
    expect(JSON.stringify(preflight)).not.toContain('PREVIEW_PACKAGE')
    expect(JSON.stringify(preflight)).not.toContain('path":"consumer')
    expect(jobs.prepare).toMatchObject({
      needs: 'preflight',
      if: workflowExpression("needs.preflight.outputs.pull-request == ''"),
    })
  })
})

// A stand-in sudo that records each call, runs commands as the agent user
// without switching users, and refuses the agent user's own sudo.
function writeFakeSudo(directory: string, { allowAgentSudo = false } = {}) {
  const log = join(directory, 'sudo.log')
  writeFileSync(
    join(directory, 'sudo'),
    `#!/bin/sh
{ printf '%s' "$*" | tr '\\n' ' '; echo; } >> "${log}"
[ "$1" = -n ] && shift
case "$1" in
  -u)
    shift 3
    # The same user can read its own /proc entries, so answer the
    # isolation probe the way a separate user without sudo would.
    case "$*" in
      *environ*) echo '{"environ":false,"sudo":${allowAgentSudo}}'; exit 0 ;;
    esac
    exec "$@" ;;
  chown|chgrp|pkill) exit 0 ;;
esac
exit 2
`,
    { mode: 0o700 }
  )
  return () => readFileSync(log, 'utf8').split('\n').filter(Boolean)
}

type Handoff =
  | { status: 'ready' }
  | { status: 'unaffected' | 'blocked' | 'unknown'; reason: string }

// A stand-in for the pinned CLI: it reports its version and writes the
// configured handoff, so assessment needs no registry.
function writeFakeCli(directory: string, handoff: Handoff) {
  const cliPath = join(directory, 'next.cjs')
  const log = join(directory, 'cli-runs.jsonl')
  writeFileSync(join(directory, 'handoff-config.json'), JSON.stringify(handoff))
  writeFileSync(
    cliPath,
    `const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
if (args[0] === '--version') {
  console.log('Next.js v${targetVersion}')
  return
}
const { env } = process
const handoff = env.__NEXT_AGENT_UPGRADE_CI_HANDOFF
const guides = env.__NEXT_AGENT_UPGRADE_CI_GUIDES
let installed = null
try {
  installed = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'node_modules/next/package.json'), 'utf8')).version
} catch {}
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({
  args,
  cwd: process.cwd(),
  expectedVersion: env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION ?? null,
  handoff,
  guides,
  installed,
  credential: JSON.stringify(env).includes(${JSON.stringify(credential)}),
}) + '\\n')
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'handoff-config.json'), 'utf8'))
fs.mkdirSync(guides, { recursive: true })
const guide = path.join(guides, 'upgrade.md')
fs.writeFileSync(guide, 'Upgrade guide')
const result = config.status === 'ready'
  ? {
      status: 'ready',
      installedVersion: installed,
      targetVersion: '${targetVersion}',
      prompt: 'Upgrade from Next.js ' + installed + ' to ${targetVersion}. Read ' + JSON.stringify(guide) + '.',
    }
  : config
fs.writeFileSync(handoff, JSON.stringify(result), { flag: 'wx' })
`
  )
  return {
    cliPath,
    runs: () =>
      readFileSync(log, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(
          (line) =>
            JSON.parse(line) as {
              args: string[]
              cwd: string
              expectedVersion: string | null
              handoff: string
              guides: string
              installed: string | null
              credential: boolean
            }
        ),
  }
}

type Agent =
  | 'none'
  | 'upgrade'
  | 'unchanged'
  | 'github'
  | 'credential'
  | 'setuid'

type Index = {
  baseSha: string
  candidates: {
    id: string
    path: string
    policy: string
    fromVersion: string
    targetVersion: string
  }[]
  outcomes: { paths: string[]; status: string; failureStage?: string }[]
}

type Preparation = {
  index: Index
  written: Index
  messages: string[]
  agentCalls: {
    root: string
    cwd: string
    guides: string
    prompt: string
    guide: string
    privateMode: number
    scratchMode: number
  }[]
  cliRuns: ReturnType<ReturnType<typeof writeFakeCli>['runs']>
  sudoCalls: string[]
}

// The fixture's lockfile, resolved once per run instead of committed.
let fixtureLock: string | undefined
function resolveFixtureLock() {
  if (fixtureLock === undefined) {
    const directory = mkdtempSync(join(tmpdir(), 'next-upgrade-lock-'))
    try {
      cpSync(fixtureRoot, directory, { recursive: true })
      execFileSync(
        'npm',
        [
          'install',
          '--package-lock-only',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
        ],
        { cwd: directory, stdio: 'ignore' }
      )
      fixtureLock = readFileSync(join(directory, 'package-lock.json'), 'utf8')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
  return fixtureLock
}

// A consumer repository with the fixture app at `apps/site`.
function createConsumer(
  directory: string,
  {
    lockfile = true,
    files = {},
  }: { lockfile?: boolean; files?: Record<string, string> } = {}
) {
  const root = join(directory, 'consumer')
  cpSync(fixtureRoot, join(root, appPath), { recursive: true })
  if (lockfile) {
    writeFileSync(
      join(root, appPath, 'package-lock.json'),
      resolveFixtureLock()
    )
  }
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(root, appPath, name), contents)
  }
  writeFileSync(join(root, 'README.md'), '# Consumer\n')
  git(root, 'init', '--initial-branch=main')
  git(root, 'config', 'user.name', 'Upgrade test')
  git(root, 'config', 'user.email', 'upgrade-fixture@example.com')
  git(root, 'config', 'commit.gpgsign', 'false')
  git(root, 'add', '.')
  git(root, 'commit', '-m', 'Add the upgrade fixture')
  return root
}

function prepare({
  directory,
  handoff = { status: 'ready' },
  agent,
  lockfile = true,
  files,
  agentUser,
  shallow = false,
}: {
  directory: string
  handoff?: Handoff
  agent: Agent
  lockfile?: boolean
  files?: Record<string, string>
  agentUser?: string
  // Like actions/checkout, which fetches one commit by default.
  shallow?: boolean
}) {
  const consumer = createConsumer(directory, { lockfile, files })
  const root = shallow ? join(directory, 'shallow') : consumer
  if (shallow) {
    git(
      directory,
      'clone',
      '--quiet',
      '--depth',
      '1',
      pathToFileURL(consumer).href,
      root
    )
  }
  const artifactDirectory = join(directory, 'candidates')
  const { cliPath, runs } = writeFakeCli(directory, handoff)
  const sudoCalls = agentUser ? writeFakeSudo(directory) : () => []
  const script = `
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { modulePath, agent, fakeSudo, targetVersion, ...input } = JSON.parse(process.argv[1])
if (fakeSudo) {
  process.env.PATH = fakeSudo + ':' + process.env.PATH
  process.env.NEXT_UPGRADE_SYSTEM_PATH = fakeSudo + ':/usr/bin:/bin'
}
const { prepareUpgradeCandidate } = await import(pathToFileURL(modulePath).href)
// Keep the explanations preparation writes to the consumer's log.
const messages = []
const logError = console.error
console.error = (...args) => {
  messages.push(args.join(' '))
  logError(...args)
}
const editJson = (file, edit) => {
  const value = JSON.parse(readFileSync(file, 'utf8'))
  edit(value)
  writeFileSync(file, JSON.stringify(value, null, 2) + '\\n')
}
const agentCalls = []
const index = await prepareUpgradeCandidate({
  ...input,
  runAgent: async (task) => {
    const scratch = join(task.root, '..')
    agentCalls.push({
      ...task,
      guide: readFileSync(join(task.guides, 'upgrade.md'), 'utf8'),
      privateMode: statSync(join(scratch, 'private')).mode & 0o777,
      scratchMode: statSync(scratch).mode & 0o777,
    })
    if (agent === 'none') {
      throw new Error('An unexpected candidate invoked the agent')
    }
    if (agent === 'unchanged') {
      return
    }
    editJson(join(task.cwd, 'package.json'), (manifest) => {
      manifest.dependencies.next = targetVersion
    })
    editJson(join(task.cwd, 'package-lock.json'), (lock) => {
      lock.packages[''].dependencies.next = targetVersion
      lock.packages['node_modules/next'].version = targetVersion
    })
    const page = join(task.cwd, 'pages/index.js')
    writeFileSync(page, readFileSync(page, 'utf8') + '// Upgraded\\n')
    if (agent === 'github') {
      mkdirSync(join(task.root, '.github/workflows'), { recursive: true })
      writeFileSync(join(task.root, '.github/workflows/agent.yml'), 'name: agent\\n')
    } else if (agent === 'credential') {
      writeFileSync(join(task.cwd, 'notes.txt'), 'Used ' + input.credential + '\\n')
    } else if (agent === 'setuid') {
      // Git keeps the file mode, so only the snapshot check sees the bit.
      chmodSync(page, 0o4644)
      if ((statSync(page).mode & 0o4000) === 0) {
        throw new Error('Could not set the setuid bit')
      }
    }
  },
})
const indexPath = join(input.artifactDirectory, 'index.json')
const written = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : null
console.log(JSON.stringify({ index, written, messages, agentCalls }))
`
  const result = runScript<Omit<Preparation, 'cliRuns' | 'sudoCalls'>>(
    script,
    {
      modulePath: join(actionRoot, 'prepare-upgrade.mjs'),
      root,
      artifactDirectory,
      appPath,
      policy: 'latest',
      cliPath,
      authMode: 'codex-openai-api-key',
      credential,
      agentUser,
      agent,
      targetVersion,
      fakeSudo: agentUser ? directory : undefined,
    },
    root
  )
  let cliRuns: Preparation['cliRuns'] = []
  try {
    cliRuns = runs()
  } catch {}
  return {
    root,
    artifactDirectory,
    ...result,
    cliRuns,
    sudoCalls: sudoCalls(),
  }
}

type Assessment = {
  baseSha: string
  outcome: {
    paths: string[]
    status: string
    failureStage?: string
    targetVersion?: string
  }
}

// Runs only the assessment, as the workflow's prepare job does.
function assess({
  directory,
  handoff = { status: 'ready' },
  lockfile = true,
}: {
  directory: string
  handoff?: Handoff
  lockfile?: boolean
}) {
  const root = createConsumer(directory, { lockfile })
  const { cliPath, runs } = writeFakeCli(directory, handoff)
  const script = `
import { pathToFileURL } from 'node:url'
const { modulePath, ...input } = JSON.parse(process.argv[1])
const { assessUpgrade } = await import(pathToFileURL(modulePath).href)
const messages = []
const logError = console.error
console.error = (...args) => {
  messages.push(args.join(' '))
  logError(...args)
}
const assessment = await assessUpgrade(input)
console.log(JSON.stringify({ assessment, messages }))
`
  const result = runScript<{ assessment: Assessment; messages: string[] }>(
    script,
    {
      modulePath: join(actionRoot, 'prepare-upgrade.mjs'),
      root,
      appPath,
      policy: 'latest',
      cliPath,
    },
    root
  )
  let cliRuns: ReturnType<typeof runs> = []
  try {
    cliRuns = runs()
  } catch {}
  return { root, cliPath, ...result, cliRuns }
}

// Runs the preparation CLI the way a workflow step does.
function runPreparationCli(
  directory: string,
  env: Record<string, string | undefined>
) {
  const output = join(directory, 'github-output')
  writeFileSync(output, '')
  const result = spawnSync(
    process.execPath,
    [join(actionRoot, 'prepare-upgrade.mjs')],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: prepareTimeout,
      env: {
        NODE_ENV: 'production',
        PATH: process.env.PATH,
        GITHUB_OUTPUT: output,
        NEXT_UPGRADE_APP_PATH: appPath,
        NEXT_UPGRADE_POLICY: 'latest',
        ...env,
      },
    }
  )
  return {
    status: result.status,
    stderr: result.stderr,
    outputs: Object.fromEntries(
      readFileSync(output, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('='))
    ),
  }
}

// @force-gate !windows
describe('scheduled upgrade assessment', () => {
  const directories: string[] = []
  function scratchDirectory() {
    const directory = mkdtempSync(join(tmpdir(), 'next-upgrade-assess-'))
    directories.push(directory)
    return directory
  }

  afterAll(() => {
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it.each([
    ['ready', { status: 'ready' }, { status: 'ready', targetVersion }],
    [
      'unaffected',
      { status: 'unaffected', reason: 'Already on the latest release.' },
      { status: 'no_upgrade' },
    ],
    [
      'blocked',
      { status: 'blocked', reason: 'The policy forbids a major upgrade.' },
      { status: 'blocked' },
    ],
    [
      'unknown',
      { status: 'unknown', reason: 'The registry is unavailable.' },
      { status: 'failed', failureStage: 'assessment' },
    ],
  ] as const)(
    'reports a %s assessment with the installed app',
    (_, handoff, outcome) => {
      const result = assess({ directory: scratchDirectory(), handoff })
      expect(result.assessment).toEqual({
        baseSha: git(result.root, 'rev-parse', 'HEAD'),
        outcome: { paths: [appPath], ...outcome },
      })
      expect(result.cliRuns).toHaveLength(1)
      expect(result.cliRuns[0]).toMatchObject({
        args: ['upgrade', '.', '--agent=latest'],
        installed: sourceVersion,
        credential: false,
      })
      if ('reason' in handoff) {
        expect(result.messages.join('\n')).toContain(handoff.reason)
      }
      // Assessment never touches the consumer checkout.
      expect(git(result.root, 'status', '--porcelain')).toBe('')
    },
    prepareTimeout
  )

  it(
    'fails an app without a package-lock.json before installing',
    () => {
      const result = assess({ directory: scratchDirectory(), lockfile: false })
      expect(result.assessment.outcome).toEqual({
        paths: [appPath],
        status: 'failed',
        failureStage: 'preflight',
      })
      expect(result.cliRuns).toEqual([])
    },
    prepareTimeout
  )

  it(
    'sets the step outputs and fails the step when assessment fails',
    () => {
      const ready = scratchDirectory()
      const root = createConsumer(ready)
      const { cliPath } = writeFakeCli(ready, { status: 'ready' })
      const passed = runPreparationCli(ready, {
        NEXT_UPGRADE_STAGE: 'assess',
        NEXT_UPGRADE_ROOT: root,
        NEXT_UPGRADE_CLI_PATH: cliPath,
      })
      expect(passed.status).toBe(0)
      expect(passed.outputs).toEqual({
        status: 'ready',
        'base-sha': git(root, 'rev-parse', 'HEAD'),
      })

      const unknown = scratchDirectory()
      const unknownRoot = createConsumer(unknown)
      const unknownCli = writeFakeCli(unknown, {
        status: 'unknown',
        reason: 'The registry is unavailable.',
      })
      const failed = runPreparationCli(unknown, {
        NEXT_UPGRADE_STAGE: 'assess',
        NEXT_UPGRADE_ROOT: unknownRoot,
        NEXT_UPGRADE_CLI_PATH: unknownCli.cliPath,
      })
      expect(failed.status).toBe(1)
      expect(failed.outputs.status).toBe('failed')
      expect(failed.stderr).toContain(
        `${appPath}: Failed during assessment. The registry is unavailable.`
      )
    },
    prepareTimeout
  )

  it(
    'fails the agent step when preparation fails',
    () => {
      const directory = scratchDirectory()
      const root = createConsumer(directory, { lockfile: false })
      const { cliPath } = writeFakeCli(directory, { status: 'ready' })
      writeFakeSudo(directory)
      const artifactDirectory = join(directory, 'candidates')
      const result = runPreparationCli(directory, {
        PATH: `${directory}:${process.env.PATH}`,
        NEXT_UPGRADE_SYSTEM_PATH: `${directory}:/usr/bin:/bin`,
        NEXT_UPGRADE_ROOT: root,
        NEXT_UPGRADE_CLI_PATH: cliPath,
        NEXT_UPGRADE_ARTIFACT_DIR: artifactDirectory,
        NEXT_UPGRADE_AUTH_MODE: 'codex-openai-api-key',
        NEXT_UPGRADE_AGENT_CREDENTIAL: credential,
        NEXT_UPGRADE_AGENT_USER: 'next-upgrade-agent',
      })
      expect(result.status).toBe(1)
      expect(result.outputs).toEqual({ status: 'failed' })
      expect(
        JSON.parse(readFileSync(join(artifactDirectory, 'index.json'), 'utf8'))
          .outcomes
      ).toEqual([
        { paths: [appPath], status: 'failed', failureStage: 'preflight' },
      ])
    },
    prepareTimeout
  )
})

// The workflow only runs on Linux runners.
// @force-gate !windows
describe('scheduled upgrade candidates', () => {
  const directories: string[] = []
  function scratchDirectory() {
    const directory = mkdtempSync(join(tmpdir(), 'next-upgrade-action-'))
    directories.push(directory)
    return directory
  }

  afterAll(() => {
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('stops the preparation CLI without an agent user before it runs anything', () => {
    const directory = scratchDirectory()
    const artifactDirectory = join(directory, 'artifacts')
    const result = spawnSync(
      process.execPath,
      [join(actionRoot, 'prepare-upgrade.mjs')],
      {
        cwd: directory,
        encoding: 'utf8',
        env: {
          NODE_ENV: 'production',
          PATH: process.env.PATH,
          NEXT_UPGRADE_ROOT: directory,
          NEXT_UPGRADE_ARTIFACT_DIR: artifactDirectory,
          NEXT_UPGRADE_APP_PATH: '.',
          NEXT_UPGRADE_POLICY: 'latest',
          NEXT_UPGRADE_AUTH_MODE: 'claude-anthropic-api-key',
          NEXT_UPGRADE_AGENT_CREDENTIAL: 'sk-ant-test',
        },
      }
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Next.js upgrade preparation failed. An agent user is required.'
    )
    expect(existsSync(artifactDirectory)).toBe(false)
  })

  it(
    'prepares a candidate from a shallow checkout',
    () => {
      const result = prepare({
        directory: scratchDirectory(),
        agent: 'upgrade',
        shallow: true,
      })
      expect(result.index.outcomes).toEqual([
        { paths: [appPath], status: 'prepared' },
      ])
    },
    prepareTimeout
  )

  describe('a ready assessment', () => {
    const url = 'https://github.com/example/consumer/pull/2'
    const runUrl = 'https://github.com/example/consumer/actions/runs/123'
    let directory: string
    let prepared: ReturnType<typeof prepare>
    let remote: string
    let publication: {
      rejectedPath: { outcomes: unknown[] }
      checks: { paths: string[]; status: string; url?: string }[]
      otherPolicy: { outcomes: { status: string; failureStage?: string }[] }
      attempts: {
        outcomes: {
          paths: string[]
          status: string
          url?: string
          failureStage?: string
        }[]
      }[]
      pulls: {
        title: string
        body: string
        base: { ref: string }
        head: { ref: string; sha: string }
        draft?: boolean
      }[]
      requests: { method: string; endpoint: string; paginate: boolean }[]
    }

    beforeAll(() => {
      directory = scratchDirectory()
      prepared = prepare({
        directory,
        agent: 'upgrade',
        agentUser: 'next-upgrade-agent',
      })
      remote = join(directory, 'remote.git')
      git(directory, 'init', '--bare', '--initial-branch=main', remote)
      git(prepared.root, 'push', remote, 'HEAD:refs/heads/main')
      const publisher = `
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
const { modulePath, url, ...input } = JSON.parse(process.argv[1])
const { checkExistingUpgrade, publishUpgradeCandidate } = await import(pathToFileURL(modulePath).href)
const pulls = []
const requests = []
const github = async (method, endpoint, body, options) => {
  requests.push({ method, endpoint: endpoint.split('?')[0], paginate: options?.paginate ?? false })
  if (method === 'GET' && endpoint === '/repos/example/consumer') {
    return { default_branch: 'main' }
  }
  if (method === 'GET' && endpoint.startsWith('/repos/example/consumer/pulls?')) {
    return pulls
  }
  if (method === 'POST' && endpoint === '/repos/example/consumer/pulls') {
    const sha = execFileSync('git', ['rev-parse', 'refs/heads/' + body.head], { cwd: input.gitRemote, encoding: 'utf8' }).trim()
    const pull = { ...body, html_url: url, head: { ref: body.head, sha, repo: { full_name: 'example/consumer' } }, base: { ref: body.base } }
    pulls.push(pull)
    return pull
  }
  throw new Error('Unexpected GitHub request ' + method + ' ' + endpoint)
}
// The index must match the inputs the workflow approved.
const rejectedPath = await publishUpgradeCandidate({ ...input, appPath: 'apps/other', github })
const otherPolicy = await publishUpgradeCandidate({ ...input, policy: 'security', github })
const check = () => checkExistingUpgrade({ appPath: input.appPath, policy: input.policy, repository: input.repository, github })
const checks = [await check()]
const attempts = []
for (let run = 0; run < 2; run++) {
  attempts.push(await publishUpgradeCandidate({ ...input, github }))
}
// The next run's preflight finds the open pull request before preparation.
checks.push(await check())
checks.push(await checkExistingUpgrade({ appPath: 'apps/other', policy: input.policy, repository: input.repository, github }))
console.log(JSON.stringify({ rejectedPath, otherPolicy, attempts, checks, pulls, requests }))
`
      publication = runScript(
        publisher,
        {
          modulePath: join(actionRoot, 'publish-upgrade.mjs'),
          root: prepared.root,
          artifactDirectory: prepared.artifactDirectory,
          appPath,
          policy: 'latest',
          repository: 'example/consumer',
          baseBranch: 'main',
          gitRemote: remote,
          url,
          runUrl,
        },
        prepared.root
      )
    }, prepareTimeout)

    it('assesses the installed app with the pinned CLI', () => {
      expect(prepared.cliRuns).toHaveLength(1)
      const [run] = prepared.cliRuns
      expect(run).toMatchObject({
        args: ['upgrade', '.', '--agent=latest'],
        expectedVersion: targetVersion,
        // npm ci installed the locked version before the assessment.
        installed: sourceVersion,
        credential: false,
      })
      expect(run.cwd.endsWith(`/${appPath}`)).toBe(true)
      // The handoff stays private; the guides sit where the agent can read them.
      const scratch = join(run.cwd, '../../..')
      expect(run.handoff).toBe(join(scratch, 'private/handoff.json'))
      expect(run.guides.startsWith(`${scratch}/`)).toBe(true)
      expect(run.guides.startsWith(join(scratch, 'private'))).toBe(false)
    })

    it('hands the agent the checkout, guides and prompt', () => {
      expect(prepared.agentCalls).toHaveLength(1)
      const [call] = prepared.agentCalls
      expect(call.cwd).toBe(join(call.root, appPath))
      expect(call.prompt).toBe(
        `Upgrade from Next.js ${sourceVersion} to ${targetVersion}. Read ${JSON.stringify(join(call.guides, 'upgrade.md'))}.`
      )
      expect(call.guide).toBe('Upgrade guide')
      // The base clone and handoff stay private to the preparation process.
      expect(call.privateMode).toBe(0o700)
      // With an agent user, only that user's group can pass through.
      expect(call.scratchMode).toBe(0o710)
      expect(prepared.sudoCalls).toContainEqual(
        expect.stringMatching(/^-n chgrp next-upgrade-agent \//)
      )
    })

    it('writes one prepared candidate and its patch', () => {
      const baseSha = git(prepared.root, 'rev-parse', 'HEAD')
      expect(prepared.index).toEqual({
        baseSha,
        candidates: [
          {
            id: expect.stringMatching(/^[0-9a-f]{24}$/),
            path: appPath,
            policy: 'latest',
            fromVersion: sourceVersion,
            targetVersion,
          },
        ],
        outcomes: [{ paths: [appPath], status: 'prepared' }],
      })
      expect(prepared.written).toEqual(prepared.index)
      const [{ id }] = prepared.index.candidates
      expect(readdirSync(prepared.artifactDirectory).sort()).toEqual([
        `${id}.patch`,
        'index.json',
      ])
      const patch = join(prepared.artifactDirectory, `${id}.patch`)
      expect(
        git(prepared.root, 'apply', '--numstat', patch).split('\n')
      ).toEqual([
        expect.stringMatching(/\tapps\/site\/package-lock\.json$/),
        expect.stringMatching(/\tapps\/site\/package\.json$/),
        expect.stringMatching(/\tapps\/site\/pages\/index\.js$/),
      ])
      for (const file of readdirSync(prepared.artifactDirectory)) {
        expect(
          readFileSync(join(prepared.artifactDirectory, file), 'utf8')
        ).not.toContain(credential)
      }
      // Preparation never touches the consumer checkout.
      expect(git(prepared.root, 'status', '--porcelain')).toBe('')
    })

    it('rejects an index for another app or policy', () => {
      // The outcome names the approved app, which has no matching candidate.
      expect(publication.rejectedPath.outcomes).toEqual([
        { paths: ['apps/other'], status: 'failed', failureStage: 'publishing' },
      ])
      expect(publication.otherPolicy.outcomes).toEqual([
        { paths: [appPath], status: 'failed', failureStage: 'publishing' },
      ])
    })

    it('finds the open pull request before the next run prepares anything', () => {
      expect(publication.checks).toEqual([
        { paths: [appPath], status: 'no_pull_request' },
        { paths: [appPath], status: 'existing_pull_request', url },
        // Another app has its own upgrade pull request.
        { paths: ['apps/other'], status: 'no_pull_request' },
      ])
    })

    it('opens one pull request and reuses it on the next run', () => {
      const [{ id }] = prepared.index.candidates
      const marker = `<!-- next-upgrade-candidate:${id} -->`
      expect(publication.attempts.map(({ outcomes }) => outcomes)).toEqual([
        [{ paths: [appPath], status: 'new_pull_request', url }],
        [{ paths: [appPath], status: 'existing_pull_request', url }],
      ])
      expect(publication.pulls).toHaveLength(1)
      const [pull] = publication.pulls
      expect(pull).toMatchObject({
        title: `Upgrade Next.js to ${targetVersion}`,
        base: { ref: 'main' },
        head: {
          ref: expect.stringMatching(
            new RegExp(`^next-upgrade/${id}-[0-9a-f]{12}$`)
          ),
        },
      })
      // The upgrade opens as a regular pull request, not a draft.
      expect(pull).not.toHaveProperty('draft')
      // The candidate marker, then the one a local `next upgrade --agent`
      // checks for duplicates, then a description from checked values only.
      expect(pull.body).toBe(
        [
          marker,
          `<!-- next-upgrade: latest; path=${JSON.stringify(appPath)} -->`,
          '',
          `### Next.js ${sourceVersion} → ${targetVersion}`,
          '',
          `A scheduled upgrade of \`${appPath}\` with the \`latest\` policy.`,
          '',
          `- Release notes: https://github.com/vercel/next.js/releases/tag/v${targetVersion}`,
          '',
          '### Changed files',
          '',
          '- `apps/site/package-lock.json`',
          '- `apps/site/package.json`',
          '- `apps/site/pages/index.js`',
          '',
          '### Verification',
          '',
          `The hosted agent followed the Next.js upgrade guides, installed the dependencies with the app's package manager, and confirmed that the installed Next.js version is ${targetVersion}. The workflow then checked that the change touches no workflow files, submodules, symlinks, or file modes and contains no agent credential.`,
          '',
          'Review the changes and run your own checks before merging.',
          '',
          `Prepared by [this workflow run](${runUrl}).`,
        ].join('\n')
      )
      // Pull requests are listed across every page.
      expect(publication.requests).toContainEqual({
        method: 'GET',
        endpoint: '/repos/example/consumer/pulls',
        paginate: true,
      })
      expect(
        publication.requests.filter(({ method }) => method === 'POST')
      ).toHaveLength(1)

      // The branch holds one commit on the base with the app's changes.
      const branch = pull.head.ref
      expect(
        git(remote, 'for-each-ref', '--format=%(refname)', 'refs/heads/')
          .split('\n')
          .sort()
      ).toEqual(['refs/heads/main', `refs/heads/${branch}`])
      expect(git(remote, 'rev-parse', branch)).toBe(pull.head.sha)
      expect(git(remote, 'rev-list', '--count', `main..${branch}`)).toBe('1')
      expect(git(remote, 'log', '-1', '--format=%an%n%B', branch)).toBe(
        `github-actions[bot]\nUpgrade Next.js to ${targetVersion}\n\n${marker}`
      )
      expect(
        git(remote, 'diff', '--name-only', 'main', branch).split('\n')
      ).toEqual([
        'apps/site/package-lock.json',
        'apps/site/package.json',
        'apps/site/pages/index.js',
      ])
    })
  })

  it.each([
    [
      'unaffected',
      { status: 'unaffected', reason: 'Already on the latest release.' },
      { status: 'no_upgrade' },
    ],
    [
      'blocked',
      { status: 'blocked', reason: 'The policy forbids a major upgrade.' },
      { status: 'blocked' },
    ],
    [
      'unknown',
      { status: 'unknown', reason: 'The registry is unavailable.' },
      { status: 'failed', failureStage: 'assessment' },
    ],
  ] as const)(
    'reports a %s assessment without starting the agent',
    (_, handoff, outcome) => {
      const result = prepare({
        directory: scratchDirectory(),
        handoff,
        agent: 'none',
      })
      expect(result.agentCalls).toEqual([])
      expect(result.cliRuns).toHaveLength(1)
      expect(result.index).toEqual({
        baseSha: git(result.root, 'rev-parse', 'HEAD'),
        candidates: [],
        outcomes: [{ paths: [appPath], ...outcome }],
      })
      expect(result.written).toEqual(result.index)
      expect(readdirSync(result.artifactDirectory)).toEqual(['index.json'])
      expect(result.messages.join('\n')).toContain(handoff.reason)
    },
    prepareTimeout
  )

  it(
    'fails an app without a package-lock.json before installing',
    () => {
      const result = prepare({
        directory: scratchDirectory(),
        agent: 'none',
        lockfile: false,
      })
      expect(result.index.outcomes).toEqual([
        { paths: [appPath], status: 'failed', failureStage: 'preflight' },
      ])
      expect(result.index.candidates).toEqual([])
      expect(result.cliRuns).toEqual([])
      expect(result.agentCalls).toEqual([])
      expect(result.messages).toContain(
        `${appPath}: Failed during preflight. Scheduled upgrades need a committed package-lock.json next to the app package.json on the default branch.`
      )
    },
    prepareTimeout
  )

  it(
    'fails an app that also has a Yarn lockfile before running anything',
    () => {
      // Yarn runs repository code when probed, e.g. through `yarnPath`.
      const result = prepare({
        directory: scratchDirectory(),
        agent: 'none',
        files: { 'yarn.lock': '# yarn lockfile v1\n' },
      })
      expect(result.index.outcomes).toEqual([
        { paths: [appPath], status: 'failed', failureStage: 'preflight' },
      ])
      expect(result.cliRuns).toEqual([])
      expect(result.agentCalls).toEqual([])
      expect(result.messages).toContain(
        `${appPath}: Failed during preflight. Scheduled upgrades support npm only, and the app also has yarn.lock.`
      )
    },
    prepareTimeout
  )

  it(
    'fetches Git dependencies with the system Git, not one the app picks',
    () => {
      const directory = scratchDirectory()
      // A Git dependency the lockfile pins, served from a local repository.
      const dependency = join(directory, 'local-dep')
      mkdirSync(dependency)
      writeFileSync(
        join(dependency, 'package.json'),
        JSON.stringify({ name: 'local-dep', version: '1.0.0' })
      )
      git(dependency, 'init', '--initial-branch=main')
      git(dependency, 'add', '.')
      git(
        dependency,
        '-c',
        'user.name=Upgrade test',
        '-c',
        'user.email=upgrade-fixture@example.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        'Add the dependency'
      )
      const lockDirectory = join(directory, 'lock')
      cpSync(fixtureRoot, lockDirectory, { recursive: true })
      const manifest = JSON.parse(
        readFileSync(join(fixtureRoot, 'package.json'), 'utf8')
      )
      manifest.dependencies['local-dep'] = `git+file://${dependency}`
      writeFileSync(
        join(lockDirectory, 'package.json'),
        JSON.stringify(manifest, null, 2)
      )
      writeFileSync(
        join(lockDirectory, 'package-lock.json'),
        resolveFixtureLock()
      )
      execFileSync(
        'npm',
        [
          'install',
          '--package-lock-only',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
        ],
        { cwd: lockDirectory, stdio: 'ignore' }
      )
      // The app's .npmrc points npm at its own Git, which leaves a marker.
      const marker = join(directory, 'app-git-ran')
      const appGit = join(directory, 'app-git')
      writeFileSync(
        appGit,
        `#!/bin/sh\ntouch ${JSON.stringify(marker)}\nexec git "$@"\n`,
        { mode: 0o755 }
      )
      const result = prepare({
        directory,
        agent: 'none',
        files: {
          'package.json': readFileSync(
            join(lockDirectory, 'package.json'),
            'utf8'
          ),
          'package-lock.json': readFileSync(
            join(lockDirectory, 'package-lock.json'),
            'utf8'
          ),
          '.npmrc': `git=${appGit}\n`,
        },
      })
      expect(existsSync(marker)).toBe(false)
      // npm ci still installed the Git dependency and the assessment ran.
      expect(result.cliRuns).toHaveLength(1)
    },
    prepareTimeout
  )

  it.each([
    [
      'changes a workflow',
      'github',
      'The candidate contains a protected path or unsupported file mode.',
    ],
    ['leaves no change', 'unchanged', 'The agent did not change any files.'],
    [
      'writes the credential to a file',
      'credential',
      'The candidate contains the agent credential.',
    ],
    [
      'leaves a setuid file',
      'setuid',
      'The candidate contains a file with special permissions.',
    ],
  ] as const)(
    'rejects a candidate when the agent %s',
    (_, agent, reason) => {
      const result = prepare({ directory: scratchDirectory(), agent })
      expect(result.agentCalls).toHaveLength(1)
      expect(result.index.outcomes).toEqual([
        { paths: [appPath], status: 'failed', failureStage: 'packaging' },
      ])
      expect(result.index.candidates).toEqual([])
      expect(readdirSync(result.artifactDirectory)).toEqual(['index.json'])
      expect(result.messages).toContain(
        `${appPath}: Failed during packaging. ${reason}`
      )
    },
    prepareTimeout
  )
})

// @force-gate !windows
describe('scheduled upgrade agent authentication modes', () => {
  let directory: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'next-upgrade-auth-'))
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('rejects unsupported authentication modes', () => {
    const script = `
import { pathToFileURL } from 'node:url'
const { modulePath, authMode } = JSON.parse(process.argv[1])
const { prepareUpgradeCandidate } = await import(pathToFileURL(modulePath).href)
const message = await prepareUpgradeCandidate({
  root: '.', artifactDirectory: '.', appPath: '.', policy: 'latest',
  cliPath: '.', authMode, credential: 'fixture-key',
}).then(() => null, (error) => error.message)
console.log(JSON.stringify(message))
`
    for (const authMode of [
      'codex-api-key',
      'claude-api-key',
      // The former Vercel AI Gateway modes.
      'codex-ai-gateway-api-key',
      'claude-ai-gateway-api-key',
      // Not one of the modes, though objects have it.
      'toString',
    ]) {
      expect(
        runScript(
          script,
          { modulePath: join(actionRoot, 'prepare-upgrade.mjs'), authMode },
          directory
        )
      ).toBe(
        'A supported agent authentication mode and its credential are required.'
      )
    }
  })
})

describe('scheduled upgrade pull request description', () => {
  const describePull = (input: unknown) =>
    runScript<string>(
      `
import { pathToFileURL } from 'node:url'
const { modulePath, ...input } = JSON.parse(process.argv[1])
const { pullRequestBody } = await import(pathToFileURL(modulePath).href)
console.log(JSON.stringify(pullRequestBody(input)))
`,
      {
        modulePath: join(actionRoot, 'publish-upgrade.mjs'),
        ...(input as object),
      },
      sourceRoot
    )

  it('links the upgrade guide only for a new major and caps the file list', () => {
    const body = describePull({
      marker: '<!-- next-upgrade-candidate:0 -->',
      targets: [
        {
          path: '.',
          policy: 'latest',
          fromVersion: '15.5.0',
          targetVersion: '16.4.6',
        },
      ],
      changes: [
        { path: 'a-old.js' },
        ...Array.from({ length: 52 }, (_, i) => ({
          path: `file-${String(i).padStart(2, '0')}.js`,
          entry: { mode: '100644' },
        })),
      ],
    })
    expect(body).toContain(
      '- Upgrade guide: https://nextjs.org/docs/app/guides/upgrading/version-16'
    )
    expect(body).toContain('- `a-old.js` (removed)')
    expect(body).toContain('- and 3 more files')
    // Without a run URL, the description leaves the link out.
    expect(body).not.toContain('Prepared by')
  })
})
