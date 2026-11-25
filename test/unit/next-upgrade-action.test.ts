import { execFileSync } from 'node:child_process'
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
      needs?: string
      permissions?: Record<string, string>
      steps?: { env?: Record<string, string>; run?: string }[]
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
  it('pins the reusable workflow and isolates the preparation credential', () => {
    const template = readYaml(join(actionRoot, 'workflow.template.yml'))
    const workflow = readYaml(
      join(sourceRoot, '.github/workflows/next-upgrade.yml')
    )
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
    const installNext = expect.objectContaining({
      run: 'node install-next.mjs',
      env: expect.objectContaining({
        WORKFLOW_SHA: workflowExpression('job.workflow_sha'),
        PREVIEW_PACKAGE: workflowExpression('inputs.preview-package'),
      }),
    })
    const approvedApp = {
      NEXT_UPGRADE_APP_PATH: workflowExpression('inputs.app-path'),
      NEXT_UPGRADE_POLICY: workflowExpression('inputs.policy'),
    }
    expect(template).toMatchObject({
      jobs: {
        upgrade: {
          uses: 'vercel/next.js/.github/workflows/next-upgrade.yml@__NEXT_UPGRADE_WORKFLOW_SHA__',
          with: {
            'app-path': '__NEXT_UPGRADE_APP_PATH__',
            policy: '__NEXT_UPGRADE_POLICY__',
            model: '__NEXT_UPGRADE_MODEL__',
            effort: '__NEXT_UPGRADE_EFFORT__',
          },
          secrets: {
            'agent-credential': workflowExpression(
              'secrets.NEXT_UPGRADE_AGENT_CREDENTIAL'
            ),
            'publish-token': workflowExpression(
              'secrets.NEXT_UPGRADE_PUBLISH_TOKEN'
            ),
          },
        },
      },
    })
    // Setup never writes the test-only input.
    expect(Object.keys(template.jobs.upgrade.with!).sort()).toEqual([
      'agent-auth',
      'app-path',
      'effort',
      'model',
      'policy',
      'telemetry-disabled',
    ])
    expect(workflow).toMatchObject({
      jobs: {
        prepare: {
          permissions: { contents: 'read' },
          steps: expect.arrayContaining([
            checkout,
            installNext,
            expect.objectContaining({
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
        },
        publish: {
          needs: 'prepare',
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
        },
      },
    })
    // The job with write access never installs the Next.js package.
    expect(JSON.stringify(workflow.jobs.publish)).not.toContain(
      'PREVIEW_PACKAGE'
    )
    const serialized = JSON.stringify(workflow)
    expect(serialized.match(/secrets\.agent-credential/g)).toHaveLength(1)
    expect(serialized.match(/secrets\.publish-token/g)).toHaveLength(2)
    // A run without the publication token stops before preparation.
    expect(workflow.on.workflow_call.secrets['publish-token']).toEqual({
      required: true,
    })
    expect(workflow.jobs.prepare.needs).toBe('preflight')
    const { preflight } = workflow.jobs
    expect(preflight.permissions).toEqual({})
    expect(preflight.steps).toHaveLength(1)
    expect(preflight.steps![0].env).toEqual({
      PUBLISH_TOKEN_PROVIDED: workflowExpression("secrets.publish-token != ''"),
    })
    expect(preflight.steps![0].run).toMatch(
      /if \[ "\$PUBLISH_TOKEN_PROVIDED" != true \]; then\n[^\n]+\n\s+exit 1\n/
    )
    // The job token only reads; the publication token opens the pull request.
    expect(template.jobs.upgrade.permissions).toEqual({ contents: 'read' })
    expect(JSON.stringify(workflow.jobs.prepare)).not.toContain('publish-token')
    // Consumer runs use the published package and never build the monorepo.
    expect(serialized).not.toMatch(/pnpm|corepack|turbo|taskr/)
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

// A consumer repository with the fixture app at `apps/site`.
function createConsumer(directory: string, { lockfile = true } = {}) {
  const root = join(directory, 'consumer')
  cpSync(fixtureRoot, join(root, appPath), { recursive: true })
  if (!lockfile) {
    rmSync(join(root, appPath, 'package-lock.json'))
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
  agentUser,
}: {
  directory: string
  handoff?: Handoff
  agent: Agent
  lockfile?: boolean
  agentUser?: string
}) {
  const root = createConsumer(directory, { lockfile })
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

  describe('a ready assessment', () => {
    const url = 'https://github.com/example/consumer/pull/2'
    let directory: string
    let prepared: ReturnType<typeof prepare>
    let remote: string
    let publication: {
      rejectedPath: { outcomes: unknown[] }
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
const { publishUpgradeCandidate } = await import(pathToFileURL(modulePath).href)
const pulls = []
const requests = []
const github = async (method, endpoint, body, options) => {
  requests.push({ method, endpoint: endpoint.split('?')[0], paginate: options?.paginate ?? false })
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
const attempts = []
for (let run = 0; run < 2; run++) {
  attempts.push(await publishUpgradeCandidate({ ...input, github }))
}
console.log(JSON.stringify({ rejectedPath, otherPolicy, attempts, pulls, requests }))
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

    it('opens one pull request and reuses it on the next run', () => {
      const [{ id }] = prepared.index.candidates
      const marker = `<!-- next-upgrade-candidate:${id} -->`
      expect(publication.attempts.map(({ outcomes }) => outcomes)).toEqual([
        [{ paths: [appPath], status: 'new_draft', url }],
        [{ paths: [appPath], status: 'existing_draft', url }],
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
      const lines = pull.body.split('\n')
      // The candidate marker, then the one a local `next upgrade --agent`
      // checks for duplicates.
      expect(lines.slice(0, 2)).toEqual([
        marker,
        `<!-- next-upgrade: latest; path=${JSON.stringify(appPath)} -->`,
      ])
      expect(lines).toContain(`    ${appPath} (latest)`)
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

const builtNext = require.resolve('next/dist/bin/next')

// A stand-in agent CLI that answers model discovery and records each run.
function writeFakeAgent(
  directory: string,
  name: 'codex' | 'claude',
  {
    models,
    exitEarly = false,
    unverified = false,
    hang = false,
  }: {
    models: unknown[]
    exitEarly?: boolean
    unverified?: boolean
    hang?: boolean
  }
) {
  const script = join(directory, `${name}-agent.cjs`)
  const report = join(directory, `${name}-runs.jsonl`)
  writeFileSync(
    script,
    `const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const args = process.argv.slice(2)
const { env } = process
const models = ${JSON.stringify(models)}
const discovery = args[0] === 'app-server' || args.includes('stream-json')
if (discovery) {
  if (${exitEarly}) process.exit(1)
  const lines = readline.createInterface({ input: process.stdin })
  lines.on('line', (line) => {
    const message = JSON.parse(line)
    if (message.method === 'initialize') {
      console.log(JSON.stringify({ id: message.id, result: {} }))
    } else if (message.method === 'model/list') {
      console.log(JSON.stringify({ id: message.id, result: { data: models, nextCursor: null } }))
    } else if (message.type === 'control_request') {
      console.log(JSON.stringify({ type: 'control_response', response: { request_id: message.request_id, subtype: 'success', response: { models } } }))
    }
  })
  return
}
// Like codex exec, wait for stdin to close before working.
process.stdin.resume()
process.stdin.on('end', async () => {
const config = env.CODEX_HOME
  ? fs.readFileSync(path.join(env.CODEX_HOME, 'config.toml'), 'utf8')
  : null
const keys = ['NEXT_UPGRADE_PROXY_TOKEN', 'AI_GATEWAY_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']
const token = env.NEXT_UPGRADE_PROXY_TOKEN || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || env.CLAUDE_CODE_OAUTH_TOKEN
// Claude Code with a subscription token talks to Anthropic itself.
const direct = !config && !env.ANTHROPIC_BASE_URL
const endpoint = config
  ? config.match(/base_url = "([^"]+)"/)[1] + '/responses'
  : direct
    ? null
    : env.ANTHROPIC_BASE_URL + '/v1/messages'
// Like the CLIs: Codex and a Claude token send a bearer, a Claude API key
// sends x-api-key, and Claude Code names its own beta features.
const headers = config
  ? { authorization: 'Bearer ' + token }
  : {
      ...(env.ANTHROPIC_API_KEY
        ? { 'x-api-key': token }
        : { authorization: 'Bearer ' + token }),
      'anthropic-beta': 'claude-code-20250219',
    }
// Call the API the way the agent CLI would, then without the token.
const reply = direct ? null : await fetch(endpoint, { method: 'POST', headers, body: '{}' }).then(
  (response) => response.text()
)
const unauthorized = direct ? null : await fetch(endpoint, { method: 'POST', body: '{}' }).then(
  (response) => response.status
)
// A path that leaves /v1 once its .. segment is resolved. fetch would resolve
// it before sending, so send the raw path.
const escaped = direct ? null : await new Promise((resolve, reject) => {
  const url = new URL(endpoint)
  require('node:http')
    .request(
      { host: url.hostname, port: url.port, method: 'POST', path: '/v1/../outside', headers },
      (response) => {
        response.resume()
        resolve(response.statusCode)
      }
    )
    .on('error', reject)
    .end('{}')
})
fs.appendFileSync(${JSON.stringify(report)}, JSON.stringify({
  args,
  keys: keys.filter((key) => env[key] === 'fixture-key'),
  conflictingKeys: keys.filter((key) => env[key] === 'stale-key'),
  emptyKeys: keys.filter((key) => env[key] === ''),
  telemetryDisabled: env.NEXT_TELEMETRY_DISABLED,
  config,
  endpoint,
  reply,
  unauthorized,
  escaped,
  anthropicBase: env.ANTHROPIC_BASE_URL ?? null,
  nonessentialTraffic: env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? null,
  oauthToken: env.CLAUDE_CODE_OAUTH_TOKEN ?? null,
  subprocessScrub: env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB ?? null,
  leakedHeader: env.ANTHROPIC_CUSTOM_HEADERS ?? null,
  environment: JSON.stringify(env),
}) + '\\n')
if (${hang}) {
  // Print part of the key, then stall past the time limit.
  process.stdout.write('Using key ' + token.slice(0, 9))
  setTimeout(() => {}, 60_000)
} else if (${unverified}) {
  console.log('The build failed while using ' + token)
} else if (args.includes('--output-last-message')) {
  fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], 'NEXT_UPGRADE_VERIFIED')
} else {
  console.log(JSON.stringify({ is_error: false, result: 'NEXT_UPGRADE_VERIFIED' }))
}
})`
  )
  const wrapper = process.platform === 'win32' ? `${name}.cmd` : name
  writeFileSync(
    join(directory, wrapper),
    process.platform === 'win32'
      ? `@"${process.execPath}" "${script}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,
    { mode: 0o700 }
  )
  return () =>
    readFileSync(report, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
}

type UpstreamRequest = {
  method: string
  url: string
  authorization: string | null
  apiKey: string | null
  beta: string | null
}

function runHostedAgent(
  directory: string,
  authMode: string,
  model?: string,
  timeout?: number,
  agentUser?: string,
  runs = 1,
  effort?: string,
  credential = 'fixture-key'
): { model: string | null; upstream: UpstreamRequest[] } {
  const guides = join(directory, 'guides')
  mkdirSync(guides, { recursive: true })
  const script = `
import { createServer } from 'node:http'
import { delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'
const { modulePath, root, guides, authMode, cliPath, model, effort, timeout, agentUser, runs, credential } = JSON.parse(process.argv[1])
const { createHostedAgent } = await import(pathToFileURL(modulePath).href)
// A stand-in provider API that records what reached it.
const upstream = []
const server = createServer((request, response) => {
  upstream.push({
    method: request.method,
    url: request.url,
    authorization: request.headers.authorization ?? null,
    apiKey: request.headers['x-api-key'] ?? null,
    beta: request.headers['anthropic-beta'] ?? null,
  })
  request.resume()
  const key = request.headers.authorization ?? request.headers['x-api-key'] ?? ''
  if (key.includes('rejected-key')) {
    response.writeHead(401).end()
    return
  }
  response.end(request.url === '/v1/models' ? '{"data":[]}' : 'upstream reply')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
Object.assign(process.env, {
  PATH: root + delimiter + process.env.PATH,
  NEXT_UPGRADE_SYSTEM_PATH: root + delimiter + '/usr/bin:/bin',
  OPENAI_API_KEY: 'stale-key',
  AI_GATEWAY_API_KEY: 'stale-key',
  ANTHROPIC_API_KEY: 'stale-key',
  ANTHROPIC_AUTH_TOKEN: 'stale-key',
  ANTHROPIC_BASE_URL: 'https://example.invalid',
  ANTHROPIC_CUSTOM_HEADERS: 'X-Example: stale-header',
  NEXT_TELEMETRY_DISABLED: '1',
})
let agent
try {
  agent = await createHostedAgent({
    authMode,
    credential,
    cliPath,
    model,
    effort,
    agentUser,
    origin: 'http://127.0.0.1:' + server.address().port,
  })
  for (let run = 0; run < runs; run++) {
    await agent.run({ root, guides, cwd: root, prompt: 'Verify the fixture', timeout })
  }
} finally {
  await agent?.dispose()
  server.close()
}
console.log(JSON.stringify({ model: agent.model, upstream }))
`
  return runScript(
    script,
    {
      modulePath: join(actionRoot, 'prepare-upgrade.mjs'),
      root: directory,
      guides,
      authMode,
      cliPath: builtNext,
      model,
      effort,
      timeout,
      agentUser,
      runs,
      credential,
    },
    directory
  )
}

// The workflow only runs on Linux runners.
// @force-gate !windows
describe('scheduled upgrade agent authentication', () => {
  let directory: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'next-upgrade-auth-'))
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it.each([
    {
      authMode: 'codex-openai-api-key',
      name: 'codex',
      keyName: 'NEXT_UPGRADE_PROXY_TOKEN',
      emptyKeys: [],
      path: '/v1/responses',
      // OpenAI takes the key as a bearer.
      upstream: {
        authorization: 'Bearer fixture-key',
        apiKey: null,
        beta: null,
      },
    },
    {
      authMode: 'claude-anthropic-api-key',
      name: 'claude',
      keyName: 'ANTHROPIC_API_KEY',
      emptyKeys: [],
      path: '/v1/messages',
      // Anthropic takes an API key as x-api-key.
      upstream: {
        authorization: null,
        apiKey: 'fixture-key',
        beta: 'claude-code-20250219',
      },
    },
  ] as const)(
    'routes $authMode to the provider API without giving the agent the credential',
    ({ authMode, name, keyName, emptyKeys, path, upstream }) => {
      const runs = writeFakeAgent(directory, name, { models: [] })
      const result = runHostedAgent(directory, authMode, 'fixture/model')
      expect(result.model).toBe('fixture/model')
      // The key is checked by listing models, then only the authorized
      // request inside /v1 reaches the provider, with the key in place of the
      // placeholder.
      expect(result.upstream).toEqual([
        { method: 'GET', url: '/v1/models', ...upstream, beta: null },
        { method: 'POST', url: path, ...upstream },
      ])
      expect(JSON.stringify(result.upstream)).not.toContain('next-upgrade-')
      const [report] = runs()
      expect(report).toMatchObject({
        keys: [],
        conflictingKeys: [],
        emptyKeys,
        leakedHeader: null,
        telemetryDisabled: '1',
        reply: 'upstream reply',
        unauthorized: 403,
        // A path that resolves outside /v1 is refused.
        escaped: 403,
      })
      expect(report.environment).not.toContain('fixture-key')
      expect(report.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
      expect(report.endpoint.replace(/^http:\/\/[^/]+/, '')).toBe(path)
      expect(report.args).toEqual(
        expect.arrayContaining(['--model', 'fixture/model'])
      )
      if (name === 'codex') {
        expect(report.config).toContain('name = "OpenAI"')
        expect(report.config).toMatch(
          /base_url = "http:\/\/127\.0\.0\.1:\d+\/v1"/
        )
        expect(report.config).toContain('env_key = "NEXT_UPGRADE_PROXY_TOKEN"')
        expect(report.config).toContain('wire_api = "responses"')
        expect(report.config).not.toContain('fixture-key')
        expect(report.anthropicBase).toBeNull()
      } else {
        // Claude Code adds /v1 itself.
        expect(report.anthropicBase).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
        expect(report.nonessentialTraffic).toBe('1')
      }
      expect(report.environment).toContain(`"${keyName}":"next-upgrade-`)
    }
  )

  it('passes a subscription token to Claude Code itself without a proxy', () => {
    const runs = writeFakeAgent(directory, 'claude', { models: [] })
    const result = runHostedAgent(
      directory,
      'claude-subscription',
      'fixture/model'
    )
    // Like Anthropic's GitHub Action: Claude Code reads the token itself, and
    // nothing reaches a proxy or checks the token first.
    expect(result.upstream).toEqual([])
    const [report] = runs()
    expect(report).toMatchObject({
      oauthToken: 'fixture-key',
      subprocessScrub: '1',
      nonessentialTraffic: '1',
      anthropicBase: null,
      keys: [],
      conflictingKeys: [],
      leakedHeader: null,
    })
    expect(report.args).toEqual(
      expect.arrayContaining(['--model', 'fixture/model'])
    )
    // The scrub makes Claude Code ignore the permission mode, so the tools are
    // allowed by name, and the guides are readable next to the checkout.
    const args: string[] = report.args
    expect(args[args.indexOf('--allowedTools') + 1]).toBe(
      'Bash,Read,Edit,Write,Glob,Grep'
    )
    expect(
      args.flatMap((arg, index) =>
        args[index - 1] === '--add-dir' ? [arg] : []
      )
    ).toEqual([directory, join(directory, 'guides')])
  })

  it.each([
    ['codex', 'codex-openai-api-key', 'OpenAI'],
    ['claude', 'claude-anthropic-api-key', 'Anthropic'],
  ] as const)(
    'stops before running %s when the provider rejects the key',
    (name, authMode, provider) => {
      writeFakeAgent(directory, name, { models: [] })
      let stderr = ''
      try {
        runHostedAgent(
          directory,
          authMode,
          'fixture/model',
          undefined,
          undefined,
          1,
          undefined,
          'rejected-key'
        )
      } catch (error) {
        stderr = String((error as { stderr?: unknown }).stderr)
      }
      expect(stderr).toContain(
        `${provider} rejected the API key in NEXT_UPGRADE_AGENT_CREDENTIAL (HTTP 401).`
      )
      expect(stderr).not.toContain('rejected-key')
      expect(existsSync(join(directory, `${name}-runs.jsonl`))).toBe(false)
    }
  )

  it.each([
    ['codex', 'codex-openai-api-key', ['-c', 'model_reasoning_effort=high']],
    ['claude', 'claude-anthropic-api-key', ['--effort', 'high']],
  ] as const)(
    'passes the chosen reasoning effort to %s like next upgrade --agent',
    (name, authMode, effortArgs) => {
      const runs = writeFakeAgent(directory, name, { models: [] })
      runHostedAgent(
        directory,
        authMode,
        'fixture/model',
        undefined,
        undefined,
        1,
        'high'
      )
      const [report] = runs()
      expect(report.args).toEqual(
        expect.arrayContaining(['--model', 'fixture/model', ...effortArgs])
      )
    }
  )

  it.each(['codex', 'claude'] as const)(
    'leaves %s at the model default effort without an effort',
    (name) => {
      const runs = writeFakeAgent(directory, name, { models: [] })
      runHostedAgent(
        directory,
        name === 'codex' ? 'codex-openai-api-key' : 'claude-anthropic-api-key',
        'fixture/model'
      )
      const [{ args }] = runs()
      expect(args).not.toContain('--effort')
      expect(args.join(' ')).not.toContain('model_reasoning_effort')
    }
  )

  it.each([
    ['codex', 'codex-openai-api-key'],
    ['claude', 'claude-anthropic-api-key'],
    ['claude', 'claude-subscription'],
  ] as const)(
    'runs %s (%s) as the agent user and takes the checkout back',
    (name, authMode) => {
      const runs = writeFakeAgent(directory, name, { models: [] })
      const calls = writeFakeSudo(directory)
      const result = runHostedAgent(
        directory,
        authMode,
        'fixture/model',
        undefined,
        'next-upgrade-agent'
      )
      const subscription = authMode === 'claude-subscription'
      expect(result.upstream).toHaveLength(subscription ? 0 : 2)
      const [report] = runs()
      const log = calls()
      const agent = log.findIndex((call) =>
        new RegExp(`^-n -u next-upgrade-agent -- env -i .* ${name} `).test(call)
      )
      expect(agent).toBeGreaterThan(-1)
      // Only Claude Code itself receives a subscription token.
      if (subscription) {
        expect(report.oauthToken).toBe('fixture-key')
      } else {
        expect(report.environment).not.toContain('fixture-key')
        expect(log[agent]).not.toContain('fixture-key')
      }
      // The probe ran first and found no access.
      expect(log.slice(0, agent).join('\n')).toContain(
        '-n -u next-upgrade-agent -- env -i'
      )
      // The checkout and the guides go to the agent user.
      for (const path of [directory, join(directory, 'guides')]) {
        expect(log).toContain(
          `-n chown -R next-upgrade-agent:${process.getgid()} ${path}`
        )
      }
      const after = log.slice(agent + 1)
      expect(after[0]).toBe('-n pkill -KILL -u next-upgrade-agent')
      // The checkout returns to the runner once the agent is disposed.
      expect(
        after.some(
          (call) =>
            /^-n chown -R \d+:\d+ /.test(call) && call.endsWith(` ${directory}`)
        )
      ).toBe(true)
    }
  )

  it('gives each Codex run its own reply file in the agent home', () => {
    // The agent user owns the home after the first run, so the runner cannot
    // remove or reuse a previous reply there.
    const runs = writeFakeAgent(directory, 'codex', { models: [] })
    writeFakeSudo(directory)
    runHostedAgent(
      directory,
      'codex-openai-api-key',
      'fixture/model',
      undefined,
      'next-upgrade-agent',
      2
    )
    const replies = runs().map(
      ({ args }: { args: string[] }) =>
        args[args.indexOf('--output-last-message') + 1]
    )
    expect(replies).toHaveLength(2)
    expect(new Set(replies).size).toBe(2)
  })

  it('stops when the agent user can use sudo', () => {
    writeFakeAgent(directory, 'codex', { models: [] })
    writeFakeSudo(directory, { allowAgentSudo: true })
    let stderr = ''
    try {
      runHostedAgent(
        directory,
        'codex-openai-api-key',
        'fixture/model',
        undefined,
        'next-upgrade-agent'
      )
    } catch (error) {
      stderr = String((error as { stderr?: unknown }).stderr)
    }
    expect(stderr).toContain(
      'The agent user can read the preparation process or use sudo.'
    )
  })

  it.each([
    [
      'codex',
      'codex-openai-api-key',
      [
        { model: 'gpt-fast', displayName: 'Fast' },
        { model: 'gpt-default', displayName: 'Default', isDefault: true },
      ],
      'gpt-default',
    ],
    [
      'claude',
      'claude-anthropic-api-key',
      [{ value: 'opus' }, { value: 'default' }],
      'default',
    ],
    ['codex', 'codex-openai-api-key', [], null],
  ] as const)(
    'chooses the %s default model like next upgrade --agent',
    (name, authMode, models, expected) => {
      const runs = writeFakeAgent(directory, name, { models: [...models] })
      expect(runHostedAgent(directory, authMode).model).toBe(expected)
      const [{ args }] = runs()
      if (expected === null) {
        expect(args).not.toContain('--model')
      } else {
        expect(args).toEqual(expect.arrayContaining(['--model', expected]))
      }
      expect(args.join(' ')).not.toMatch(/effort/)
    }
  )

  it.each([
    ['codex', 'codex-openai-api-key'],
    ['claude', 'claude-anthropic-api-key'],
  ] as const)(
    'fails preflight when %s model discovery fails instead of guessing',
    (name, authMode) => {
      const runs = writeFakeAgent(directory, name, {
        models: [],
        exitEarly: true,
      })
      expect(() => runHostedAgent(directory, authMode)).toThrow()
      expect(() => runs()).toThrow()
    }
  )

  it.each([
    ['codex', 'codex-openai-api-key'],
    ['claude', 'claude-anthropic-api-key'],
    ['claude', 'claude-subscription'],
  ] as const)(
    'shows an unverified %s (%s) result without the key',
    (name, authMode) => {
      writeFakeAgent(directory, name, { models: [], unverified: true })
      let stderr = ''
      try {
        runHostedAgent(directory, authMode, 'fixture/model')
      } catch (error) {
        stderr = String((error as { stderr?: unknown }).stderr)
      }
      expect(stderr).toContain(
        authMode === 'claude-subscription'
          ? 'The build failed while using [redacted]'
          : 'The build failed while using next-upgrade-'
      )
      expect(stderr).not.toContain('fixture-key')
    }
  )

  it('reports a timeout without the key', () => {
    writeFakeAgent(directory, 'codex', { models: [], hang: true })
    let failure = { message: '', stderr: '' }
    try {
      runHostedAgent(directory, 'codex-openai-api-key', 'fixture/model', 1000)
    } catch (error) {
      failure = error as typeof failure
    }
    expect(String(failure.stderr)).toContain('Using key next-upgr')
    expect(String(failure.stderr)).not.toContain('fixture-k')
    expect(String(failure.stderr)).toContain(
      'Codex upgrade and verification timed out.'
    )
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
