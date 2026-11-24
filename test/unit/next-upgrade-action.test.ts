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
  '../e2e/agent-upgrade-ci/fixtures/workspace'
)
const sourceVersion = '16.1.6'
const targetVersion = '16.2.0'
const selectedApps = ['apps/web', 'apps/admin']
const supportingPaths = ['packages/shared']

type Workflow = {
  jobs: Record<string, { with?: Record<string, unknown> }>
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
    { cwd, encoding: 'utf8', timeout: 180_000 }
  )
  return JSON.parse(output) as T
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
    expect(template).toMatchObject({
      jobs: {
        upgrade: {
          uses: 'vercel/next.js/.github/workflows/next-upgrade.yml@__NEXT_UPGRADE_WORKFLOW_SHA__',
          secrets: {
            'agent-credential': workflowExpression(
              'secrets.NEXT_UPGRADE_AGENT_API_KEY'
            ),
            'publish-token': workflowExpression(
              'secrets.NEXT_UPGRADE_PUBLISH_TOKEN'
            ),
          },
        },
      },
    })
    // Setup never writes the test-only inputs.
    expect(Object.keys(template.jobs.upgrade.with!).sort()).toEqual([
      'agent-auth',
      'supporting-paths',
      'targets',
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
                NEXT_UPGRADE_AGENT_CREDENTIAL: workflowExpression(
                  'secrets.agent-credential'
                ),
                NEXT_UPGRADE_MODEL: workflowExpression('inputs.model'),
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
          permissions: { contents: 'write', 'pull-requests': 'write' },
          steps: expect.arrayContaining([
            checkout,
            expect.objectContaining({
              run: 'node install-next.mjs',
              env: expect.objectContaining({ NEXT_UPGRADE_DEPS_ONLY: 'true' }),
            }),
            expect.objectContaining({
              env: expect.objectContaining({
                GH_TOKEN: workflowExpression(
                  'secrets.publish-token || github.token'
                ),
                NEXT_UPGRADE_PUBLISH_TOKEN_PROVIDED: workflowExpression(
                  "secrets.publish-token != ''"
                ),
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
    expect(JSON.stringify(workflow.jobs.prepare)).not.toContain('publish-token')
    // Consumer runs use the published package and never build the monorepo.
    expect(serialized).not.toMatch(/pnpm install|turbo|taskr/)
    // Preparation runs the consumer's pnpm through Corepack.
    expect(workflow.jobs.prepare).toMatchObject({
      steps: expect.arrayContaining([
        expect.objectContaining({
          run: expect.stringContaining('corepack enable'),
        }),
      ]),
    })
  })
})

// The workflow only runs on Linux runners.
// @force-gate !windows
describe('scheduled upgrade candidates', () => {
  let directory: string
  let root: string
  let artifactDirectory: string
  let cliPath: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'next-upgrade-action-'))
    root = join(directory, 'consumer')
    artifactDirectory = join(directory, 'candidates')
    cpSync(fixtureRoot, root, { recursive: true })
    cliPath = join(directory, 'next.cjs')
    writeFileSync(
      cliPath,
      `const { existsSync } = require('node:fs')
const { join } = require('node:path')
global.fetch = async (input) => {
  if (existsSync(join(__dirname, 'registry-unavailable'))) throw new Error('Registry unavailable')
  const url = String(input)
  if (url.endsWith('/advisories/bulk')) return Response.json({})
  if (url.endsWith('/next/latest')) return Response.json({ version: '${targetVersion}' })
  throw new Error('Unexpected registry request')
}
require(${JSON.stringify(require.resolve('next/dist/bin/next'))})`
    )
    git(root, 'init', '--initial-branch=main')
    git(root, 'config', 'user.name', 'Upgrade test')
    git(root, 'config', 'user.email', 'upgrade-fixture@example.com')
    git(root, 'config', 'commit.gpgsign', 'false')
    git(root, 'add', '.')
    git(root, 'commit', '-m', 'Add upgrade workspace')
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  function prepare({
    targets,
    approvedSupportingPaths,
    applyUpgrade,
    independent = false,
    budget,
    hookMarker,
    setuid = false,
    pnpmfile,
    agentUser,
  }: {
    targets: { path: string; policy: string }[]
    approvedSupportingPaths: string[]
    applyUpgrade: boolean
    independent?: boolean
    budget?: number
    hookMarker?: string
    setuid?: boolean
    pnpmfile?: string
    agentUser?: string
  }) {
    const script = `
import { chmodSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { modulePath, applyUpgrade, independent, targetVersion, crossSpawnPath, hookMarker, setuid, pnpmfile, fakeSudo, ...input } = JSON.parse(process.argv[1])
if (fakeSudo) {
  process.env.PATH = fakeSudo + ':' + process.env.PATH
}
const spawn = createRequire(pathToFileURL(modulePath))(crossSpawnPath)
const { prepareUpgradeCandidates } = await import(pathToFileURL(modulePath).href)
// Keep the explanations preparation writes to the consumer's log.
const messages = []
const logError = console.error
console.error = (...args) => {
  messages.push(args.join(' '))
  logError(...args)
}
const result = await prepareUpgradeCandidates({
  ...input,
  runAgent: async ({ root, cwd, prompt }) => {
    if (!applyUpgrade) {
      throw new Error('An unapproved candidate invoked the agent')
    }
    if (!prompt.includes('from Next.js ${sourceVersion} to ' + targetVersion)) {
      throw new Error('The built CLI did not return its pinned target handoff')
    }
    // The guides the handoff points to sit outside the private directory.
    const guide = prompt.match(/Read "([^"]+shared\\.md)"/)?.[1]
    const scratch = join(root, '..')
    if (
      !guide ||
      !guide.startsWith(scratch + '/') ||
      guide.slice(scratch.length + 1).startsWith('private/') ||
      !readFileSync(guide, 'utf8')
    ) {
      throw new Error('The agent cannot read the upgrade guides')
    }
    // The base clone and verification copies stay private to the preparation process.
    if ((statSync(join(root, '..', 'private')).mode & 0o777) !== 0o700) {
      throw new Error('The preparation scratch directory is not private')
    }
    // With an agent user, only that user's group can pass through the scratch directory.
    if (input.agentUser && (statSync(join(root, '..')).mode & 0o777) !== 0o710) {
      throw new Error('The preparation scratch directory is open to other users')
    }
    if (setuid) {
      writeFileSync(join(cwd, 'tool'), '#!/bin/sh\\n')
      chmodSync(join(cwd, 'tool'), 0o4755)
    }
    if (independent) {
      const path = join(cwd, 'package.json')
      const manifest = JSON.parse(readFileSync(path, 'utf8'))
      manifest.dependencies.next = targetVersion
      if (hookMarker) {
        // An agent-added lifecycle hook must not run outside the agent's sandbox.
        manifest.scripts.postinstall = 'node -e "require(\\'fs\\').writeFileSync(' + JSON.stringify(JSON.stringify(hookMarker)).slice(1, -1) + ', \\'\\')"'
      }
      writeFileSync(path, JSON.stringify(manifest, null, 2) + '\\n')
    } else {
      const path = join(root, 'pnpm-workspace.yaml')
      const original = readFileSync(path, 'utf8')
      writeFileSync(path, original.replace('next: ${sourceVersion}', 'next: ' + targetVersion))
    }
    const install = spawn.sync('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], {
      cwd: root,
    })
    if (install.status !== 0) {
      throw new Error('Could not update the workspace lockfile')
    }
    if (pnpmfile) {
      // pnpm runs project hooks, so verification must not run pnpm on this tree.
      writeFileSync(join(root, '.pnpmfile.cjs'), 'require("node:fs").writeFileSync(' + JSON.stringify(pnpmfile) + ', "")\\nmodule.exports = {}\\n')
    }
    if (hookMarker) {
      // Make the verification install link the app again so its hooks would run.
      rmSync(join(root, 'node_modules'), { recursive: true, force: true })
      rmSync(join(cwd, 'node_modules'), { recursive: true, force: true })
      // Git configuration the agent writes must not run during verification.
      const monitor = join(root, '..', 'fsmonitor.sh')
      writeFileSync(monitor, '#!/bin/sh\\ntouch ' + JSON.stringify(hookMarker + '-git') + '\\n', { mode: 0o755 })
      const config = join(root, '.git', 'config')
      writeFileSync(config, readFileSync(config, 'utf8') + '[core]\\n\\tfsmonitor = ' + monitor + '\\n')
    }
  },
})
console.log(JSON.stringify({ ...result, messages }))
`
    return runScript<{
      candidates: Array<{
        id: string
        targets: Array<{ path: string; targetVersion: string }>
        catalog: { name: string | null; dependency: string } | null
      }>
      outcomes: Array<{ paths: string[]; status: string }>
      messages: string[]
    }>(
      script,
      {
        modulePath: join(actionRoot, 'prepare-upgrade.mjs'),
        root,
        artifactDirectory,
        targets,
        supportingPaths: approvedSupportingPaths,
        cliPath,
        targetVersion,
        applyUpgrade,
        independent,
        crossSpawnPath: require.resolve('next/dist/compiled/cross-spawn'),
        budget,
        hookMarker,
        setuid,
        pnpmfile,
        agentUser,
        fakeSudo: agentUser ? directory : undefined,
        authMode: 'codex-ai-gateway-api-key',
        credential: 'dummy-test-key',
      },
      root
    )
  }

  it('blocks a shared catalog update before invoking the agent when an app is unselected', () => {
    const result = prepare({
      targets: [{ path: 'apps/web', policy: 'latest' }],
      approvedSupportingPaths: supportingPaths,
      applyUpgrade: false,
    })
    expect(result.candidates).toEqual([])
    expect(result.outcomes).toEqual([
      expect.objectContaining({ status: 'blocked' }),
    ])
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it('blocks a group when its selected policies have different outcomes', () => {
    const result = prepare({
      targets: [
        { path: 'apps/web', policy: 'latest' },
        { path: 'apps/admin', policy: 'security' },
      ],
      approvedSupportingPaths: supportingPaths,
      applyUpgrade: false,
    })
    expect(result.outcomes).toEqual([
      { paths: ['apps/admin', 'apps/web'], status: 'blocked' },
    ])
    expect(result.candidates).toEqual([])
  })

  it('distinguishes a current app from an unavailable assessment', () => {
    const options = {
      targets: [{ path: 'apps/docs', policy: 'security' }],
      approvedSupportingPaths: [],
      applyUpgrade: false,
    }
    const current = prepare(options)
    expect(current.outcomes).toEqual([
      { paths: ['apps/docs'], status: 'no_upgrade' },
    ])
    writeFileSync(join(directory, 'registry-unavailable'), '')
    const failure = prepare(options)
    expect(failure.outcomes).toEqual([
      {
        paths: ['apps/docs'],
        status: 'failed',
        failureStage: 'assessment',
      },
    ])
    expect(failure.candidates).toEqual([])
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it('stops starting agents once the time budget is spent', () => {
    const result = prepare({
      targets: [{ path: 'apps/docs', policy: 'latest' }],
      approvedSupportingPaths: [],
      // Without the budget, this candidate would be prepared.
      applyUpgrade: true,
      independent: true,
      budget: 0,
    })
    expect(result.outcomes).toEqual([
      { paths: ['apps/docs'], status: 'failed', failureStage: 'preflight' },
    ])
    expect(result.candidates).toEqual([])
  }, 180_000)

  it('keeps the scratch directory closed to other users with an agent user', () => {
    const calls = writeFakeSudo(directory)
    const result = prepare({
      targets: [{ path: 'apps/docs', policy: 'latest' }],
      approvedSupportingPaths: [],
      applyUpgrade: true,
      independent: true,
      agentUser: 'next-upgrade-agent',
    })
    expect(result.outcomes).toEqual([
      { paths: ['apps/docs'], status: 'prepared' },
    ])
    expect(calls()).toContainEqual(
      expect.stringMatching(/^-n chgrp next-upgrade-agent \//)
    )
  }, 180_000)

  it('never runs pnpm hooks the agent leaves in the workspace', () => {
    const pnpmfile = join(directory, 'pnpmfile-ran')
    const result = prepare({
      targets: [{ path: 'apps/docs', policy: 'latest' }],
      approvedSupportingPaths: [],
      applyUpgrade: true,
      independent: true,
      pnpmfile,
    })
    expect(existsSync(pnpmfile)).toBe(false)
    expect(result.outcomes).toEqual([
      {
        paths: ['apps/docs'],
        status: 'failed',
        failureStage: 'verification',
      },
    ])
  }, 180_000)

  it('stops before the agent for a lockfile older than pnpm 9', () => {
    const lockfile = join(root, 'pnpm-lock.yaml')
    writeFileSync(
      lockfile,
      readFileSync(lockfile, 'utf8').replaceAll(
        "lockfileVersion: '9.0'",
        "lockfileVersion: '6.0'"
      )
    )
    git(root, 'commit', '-am', 'Use an older lockfile format')
    const result = prepare({
      targets: [{ path: 'apps/docs', policy: 'latest' }],
      approvedSupportingPaths: [],
      applyUpgrade: false,
    })
    expect(result.outcomes).toEqual([
      { paths: ['apps/docs'], status: 'failed', failureStage: 'preflight' },
    ])
    expect(result.messages).toContain(
      'Scheduled upgrades support pnpm lockfile version 9.0 (pnpm 9 or later).'
    )
    expect(result.candidates).toEqual([])
  }, 180_000)

  it('rejects a candidate that leaves a setuid file', () => {
    const result = prepare({
      targets: [{ path: 'apps/docs', policy: 'latest' }],
      approvedSupportingPaths: [],
      applyUpgrade: true,
      independent: true,
      setuid: true,
    })
    expect(result.outcomes).toEqual([
      {
        paths: ['apps/docs'],
        status: 'failed',
        failureStage: 'verification',
      },
    ])
    expect(result.candidates).toEqual([])
  }, 180_000)

  it('updates only the selected independent app and its root lockfile', () => {
    const hookMarker = join(directory, 'hook-ran')
    const result = prepare({
      targets: [{ path: 'apps/docs', policy: 'latest' }],
      approvedSupportingPaths: [],
      applyUpgrade: true,
      independent: true,
      hookMarker,
    })
    expect(existsSync(hookMarker)).toBe(false)
    expect(existsSync(`${hookMarker}-git`)).toBe(false)
    expect(result.outcomes).toEqual([
      { paths: ['apps/docs'], status: 'prepared' },
    ])
    expect(result.candidates).toHaveLength(1)
    const [candidate] = result.candidates
    expect(candidate.catalog).toBeNull()
    expect(candidate.targets).toEqual([
      expect.objectContaining({ path: 'apps/docs', targetVersion }),
    ])
    const patch = join(artifactDirectory, `${candidate.id}.patch`)
    expect(git(root, 'apply', '--numstat', patch).split('\n')).toEqual([
      expect.stringMatching(/\tapps\/docs\/package\.json$/),
      expect.stringMatching(/\tpnpm-lock\.yaml$/),
    ])
    for (const file of readdirSync(artifactDirectory)) {
      expect(readFileSync(join(artifactDirectory, file), 'utf8')).not.toContain(
        'dummy-test-key'
      )
    }
  }, 180_000)

  it.each([
    ['peer and dev', { devDependencies: { next: 'catalog:' } }, true],
    ['peer-only', {}, true],
    // pnpm then leaves the peer-only library unlocked.
    ['peer-only without auto-installed peers', {}, false],
  ])(
    'upgrades a catalog group with a supporting library that declares Next.js as %s',
    (_, extra, autoInstallPeers) => {
      if (!autoInstallPeers) {
        const workspace = join(root, 'pnpm-workspace.yaml')
        writeFileSync(
          workspace,
          `${readFileSync(workspace, 'utf8')}autoInstallPeers: false\n`
        )
      }
      mkdirSync(join(root, 'packages/ui'))
      writeFileSync(
        join(root, 'packages/ui/package.json'),
        JSON.stringify({
          name: 'upgrade-ui',
          private: true,
          peerDependencies: { next: 'catalog:' },
          ...extra,
        })
      )
      execFileSync('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], {
        cwd: root,
      })
      git(root, 'add', '.')
      git(root, 'commit', '-m', 'Add a library package')
      const result = prepare({
        targets: selectedApps.map((path) => ({ path, policy: 'latest' })),
        approvedSupportingPaths: [...supportingPaths, 'packages/ui'],
        applyUpgrade: true,
      })
      expect(result.outcomes).toEqual([
        { paths: ['apps/admin', 'apps/web'], status: 'prepared' },
      ])
      const remote = join(directory, 'remote.git')
      git(directory, 'init', '--bare', remote)
      git(root, 'push', remote, 'HEAD:refs/heads/main')
      const publisher = `
import { pathToFileURL } from 'node:url'
const { modulePath, ...input } = JSON.parse(process.argv[1])
const { publishUpgradeCandidates } = await import(pathToFileURL(modulePath).href)
const github = async (method, endpoint, body) =>
  method === 'GET' ? [] : { title: body.title, draft: true, html_url: 'https://github.com/example/consumer/pull/4' }
console.log(JSON.stringify(await publishUpgradeCandidates({ ...input, github })))
`
      expect(
        runScript<{ outcomes: { status: string }[] }>(
          publisher,
          {
            modulePath: join(actionRoot, 'publish-upgrade.mjs'),
            root,
            artifactDirectory,
            targets: selectedApps.map((path) => ({ path, policy: 'latest' })),
            supportingPaths: [...supportingPaths, 'packages/ui'],
            repository: 'example/consumer',
            baseBranch: 'main',
            gitRemote: remote,
          },
          root
        ).outcomes
      ).toEqual([expect.objectContaining({ status: 'new_draft' })])
    },
    180_000
  )

  it('keeps preparing an independent app next to a library with peer and catalog declarations', () => {
    mkdirSync(join(root, 'packages/ui'))
    writeFileSync(
      join(root, 'packages/ui/package.json'),
      JSON.stringify({
        name: 'upgrade-ui',
        private: true,
        peerDependencies: { next: '>=16' },
        devDependencies: { next: 'catalog:' },
      })
    )
    execFileSync('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], {
      cwd: root,
    })
    git(root, 'add', '.')
    git(root, 'commit', '-m', 'Add a library package')
    const result = prepare({
      targets: [{ path: 'apps/docs', policy: 'latest' }],
      approvedSupportingPaths: [],
      applyUpgrade: true,
      independent: true,
    })
    expect(result.outcomes).toEqual([
      { paths: ['apps/docs'], status: 'prepared' },
    ])
  }, 180_000)

  it('prepares and publishes one group patch and recovers after a failed draft request', () => {
    const targets = selectedApps.map((path) => ({ path, policy: 'latest' }))
    const result = prepare({
      targets,
      approvedSupportingPaths: supportingPaths,
      applyUpgrade: true,
    })
    expect(result.candidates).toHaveLength(1)
    const [candidate] = result.candidates
    expect(candidate.catalog).toEqual({ name: null, dependency: 'next' })
    expect(candidate.targets).toHaveLength(2)
    expect(candidate.targets).toEqual(
      expect.arrayContaining(
        selectedApps.map((path) =>
          expect.objectContaining({ path, targetVersion })
        )
      )
    )
    const patch = join(artifactDirectory, `${candidate.id}.patch`)
    expect(git(root, 'apply', '--numstat', patch).split('\n')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\tpnpm-workspace\.yaml$/),
        expect.stringMatching(/\tpnpm-lock\.yaml$/),
      ])
    )
    expect(git(root, 'apply', '--numstat', patch)).not.toContain('apps/docs')

    const remote = join(directory, 'remote.git')
    git(directory, 'init', '--bare', remote)
    git(root, 'push', remote, 'HEAD:refs/heads/main')
    const url = 'https://github.com/example/consumer/pull/2'
    const branchPattern = new RegExp(
      `^next-upgrade/${candidate.id}-[0-9a-f]{12}$`
    )
    const publisher = `
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { modulePath, url, ...input } = JSON.parse(process.argv[1])
const { publishUpgradeCandidates } = await import(pathToFileURL(modulePath).href)
let pull
const drafts = []
const attempts = []
const github = async (method, endpoint, body) => {
  if (method === 'GET' && endpoint.startsWith('/repos/example/consumer/pulls?')) {
    return pull ? [pull] : []
  }
  if (method !== 'POST' || endpoint !== '/repos/example/consumer/pulls') {
    throw new Error('Unexpected GitHub request')
  }
  drafts.push(body)
  if (drafts.length === 1) {
    throw new Error('Simulated GitHub failure after pushing the branch')
  }
  const sha = execFileSync('git', ['rev-parse', body.head], { cwd: input.gitRemote, encoding: 'utf8' }).trim()
  pull = { ...body, head: { sha, ref: body.head, repo: { full_name: 'example/consumer' } }, base: { ref: body.base }, html_url: url }
  return pull
}
const artifact = JSON.parse(readFileSync(join(input.artifactDirectory, 'index.json'), 'utf8'))
const patchPath = join(input.artifactDirectory, artifact.candidates[0].id + '.patch')
const validPatch = readFileSync(patchPath)
writeFileSync(patchPath, Buffer.concat([validPatch, Buffer.from([
  // Inside an approved app, so only the protected .github rule rejects it.
  'diff --git a/apps/web/.github/workflows/unapproved.yml b/apps/web/.github/workflows/unapproved.yml',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/apps/web/.github/workflows/unapproved.yml',
  '@@ -0,0 +1 @@',
  '+name: unapproved',
  '',
].join('\\n'))]))
attempts.push(await publishUpgradeCandidates({ ...input, github }))
writeFileSync(patchPath, validPatch)
const git = (...args) => execFileSync('git', args, { cwd: input.gitRemote, encoding: 'utf8' }).trim()
const base = git('rev-parse', 'main')
const advanced = git(
  '-c', 'user.name=Upgrade test', '-c', 'user.email=upgrade-fixture@example.com',
  '-c', 'commit.gpgsign=false', 'commit-tree', base + '^{tree}',
  '-p', base, '-m', 'Advance the default branch',
)
git('update-ref', 'refs/heads/main', advanced, base)
attempts.push(await publishUpgradeCandidates({ ...input, github }))
git('update-ref', 'refs/heads/main', base, advanced)
// Leftover branches from earlier candidates must not block publication.
const id = artifact.candidates[0].id
git('update-ref', 'refs/heads/next-upgrade/' + id, advanced)
git('update-ref', 'refs/heads/next-upgrade/' + id + '-000000000000', advanced)
for (let run = 0; run < 3; run++) {
  // The first draft request falls back to GITHUB_TOKEN; the retry has a publication token.
  attempts.push(await publishUpgradeCandidates({ ...input, github, publishTokenProvided: run > 0 }))
}
console.log(JSON.stringify({ drafts, attempts }))
`
    const publication = runScript<{
      drafts: { body: string; head: string }[]
      attempts: { outcomes: { status: string; url?: string }[] }[]
    }>(
      publisher,
      {
        modulePath: join(actionRoot, 'publish-upgrade.mjs'),
        root,
        artifactDirectory,
        targets,
        supportingPaths,
        repository: 'example/consumer',
        baseBranch: 'main',
        gitRemote: remote,
        url,
      },
      root
    )
    expect(publication.drafts).toHaveLength(2)
    expect(publication.drafts[1]).toMatchObject({
      title: `Upgrade Next.js to ${targetVersion}`,
      body: expect.stringContaining(
        `<!-- next-upgrade-candidate:${candidate.id} -->`
      ),
      base: 'main',
      head: expect.stringMatching(branchPattern),
      draft: true,
    })
    const ciNote =
      'GitHub does not start pull request workflows for drafts opened with `GITHUB_TOKEN`'
    expect(publication.drafts[0]).toMatchObject({
      body: expect.stringContaining(ciNote),
    })
    expect(publication.drafts[1]).toMatchObject({
      body: expect.not.stringContaining(ciNote),
    })
    expect(publication.attempts.map(({ outcomes }) => outcomes[0])).toEqual([
      expect.objectContaining({
        status: 'failed',
        failureStage: 'verification',
      }),
      expect.objectContaining({
        status: 'failed',
        failureStage: 'publishing',
      }),
      expect.objectContaining({ status: 'failed', failureStage: 'publishing' }),
      expect.objectContaining({ status: 'new_draft', url }),
      expect.objectContaining({ status: 'existing_draft', url }),
    ])
    expect(
      git(
        remote,
        'diff',
        '--name-only',
        'main',
        (publication.drafts[1] as { head: string }).head
      ).split('\n')
    ).toEqual(['pnpm-lock.yaml', 'pnpm-workspace.yaml'])
  }, 180_000)

  it.each([
    ['opens a draft from a GitHub-signed commit', true],
    ['refuses a commit GitHub did not sign', false],
  ])(
    '%s through the GitHub API',
    (_, signed) => {
      const targets = [{ path: 'apps/docs', policy: 'latest' }]
      const [candidate] = prepare({
        targets,
        approvedSupportingPaths: [],
        applyUpgrade: true,
        independent: true,
      }).candidates
      git(
        root,
        'remote',
        'add',
        'origin',
        'https://github.com/example/consumer.git'
      )
      const publisher = `
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { modulePath, signed, ...input } = JSON.parse(process.argv[1])
const { publishUpgradeCandidates } = await import(pathToFileURL(modulePath).href)
const git = (args, options = {}) => execFileSync('git', args, { cwd: input.root, encoding: 'utf8', ...options }).trim()
const base = git(['rev-parse', 'HEAD'])
const refs = new Map([['refs/heads/main', base]])
const commits = new Map()
const requests = []
const drafts = []
const prefix = '/repos/example/consumer'
const github = async (method, endpoint, body) => {
  requests.push(method + ' ' + endpoint.split('?')[0])
  if (method === 'GET' && endpoint.startsWith(prefix + '/git/matching-refs/')) {
    const ref = 'refs/' + endpoint.slice((prefix + '/git/matching-refs/').length)
    return refs.has(ref) ? [{ ref, object: { sha: refs.get(ref) } }] : []
  }
  if (method === 'POST' && endpoint === prefix + '/git/refs') {
    refs.set(body.ref, body.sha)
    return { ref: body.ref, object: { sha: body.sha } }
  }
  if (method === 'POST' && endpoint === '/graphql') {
    const { branch, expectedHeadOid, message, fileChanges } = body.variables.input
    const ref = 'refs/heads/' + branch.branchName
    if (refs.get(ref) !== expectedHeadOid || branch.repositoryNameWithOwner !== 'example/consumer') {
      return { errors: [{ message: 'Unexpected head' }] }
    }
    // Build the tree GitHub would commit from the base and the file changes.
    const index = join(input.root, '.git', 'mock-index')
    const env = { ...process.env, GIT_INDEX_FILE: index }
    git(['read-tree', expectedHeadOid], { env })
    for (const { path, contents } of fileChanges.additions) {
      const blob = git(['hash-object', '-w', '--stdin'], { input: Buffer.from(contents, 'base64') })
      git(['update-index', '--add', '--cacheinfo', '100644,' + blob + ',' + path], { env })
    }
    for (const { path } of fileChanges.deletions) {
      git(['update-index', '--force-remove', path], { env })
    }
    const tree = git(['write-tree'], { env })
    rmSync(index)
    const text = message.headline + '\\n\\n' + message.body
    const oid = git(['-c', 'user.name=GitHub', '-c', 'user.email=noreply@github.com', '-c', 'commit.gpgsign=false', 'commit-tree', tree, '-p', expectedHeadOid, '-m', text])
    commits.set(oid, { tree, parent: expectedHeadOid, text })
    refs.set(ref, oid)
    return { data: { createCommitOnBranch: { commit: {
      oid,
      tree: { oid: tree },
      signature: signed ? { isValid: true, state: 'VALID' } : { isValid: false, state: 'UNSIGNED' },
    } } } }
  }
  if (method === 'GET' && endpoint.startsWith(prefix + '/pulls?')) {
    return drafts
  }
  if (method === 'POST' && endpoint === prefix + '/pulls') {
    const draft = { ...body, draft: true, html_url: 'https://github.com/example/consumer/pull/3', head: { ref: body.head, sha: refs.get('refs/heads/' + body.head), repo: { full_name: 'example/consumer' } }, base: { ref: body.base } }
    drafts.push(draft)
    return draft
  }
  throw new Error('Unexpected GitHub request ' + method + ' ' + endpoint)
}
const result = await publishUpgradeCandidates({ ...input, github })
console.log(JSON.stringify({ result, requests, drafts }))
`
      const publication = runScript<{
        result: { outcomes: { status: string; failureStage?: string }[] }
        requests: string[]
        drafts: { head: { ref: string } }[]
      }>(
        publisher,
        {
          modulePath: join(actionRoot, 'publish-upgrade.mjs'),
          root,
          artifactDirectory,
          targets,
          supportingPaths: [],
          repository: 'example/consumer',
          baseBranch: 'main',
          signed,
        },
        root
      )
      if (signed) {
        expect(publication.result.outcomes).toEqual([
          expect.objectContaining({ status: 'new_draft' }),
        ])
        expect(publication.drafts).toEqual([
          expect.objectContaining({
            draft: true,
            head: expect.objectContaining({
              ref: expect.stringMatching(
                new RegExp(`^next-upgrade/${candidate.id}-[0-9a-f]{12}$`)
              ),
            }),
          }),
        ])
        expect(publication.requests).toEqual(
          expect.arrayContaining([
            'POST /repos/example/consumer/git/refs',
            'POST /graphql',
            'POST /repos/example/consumer/pulls',
          ])
        )
      } else {
        expect(publication.result.outcomes).toEqual([
          {
            paths: ['apps/docs'],
            status: 'failed',
            failureStage: 'publishing',
          },
        ])
        expect(publication.drafts).toEqual([])
      }
    },
    180_000
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
const keys = ['AI_GATEWAY_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']
const token = env.AI_GATEWAY_API_KEY || env.ANTHROPIC_AUTH_TOKEN
const endpoint = config
  ? config.match(/base_url = "([^"]+)"/)[1] + '/responses'
  : env.ANTHROPIC_BASE_URL + '/v1/messages'
// Call the Gateway the way the agent CLI would, then without the token.
const gateway = await fetch(endpoint, {
  method: 'POST',
  headers: { authorization: 'Bearer ' + token },
  body: '{}',
}).then((response) => response.text())
const unauthorized = await fetch(endpoint, { method: 'POST', body: '{}' }).then(
  (response) => response.status
)
fs.appendFileSync(${JSON.stringify(report)}, JSON.stringify({
  args,
  keys: keys.filter((key) => env[key] === 'fixture-key'),
  conflictingKeys: keys.filter((key) => env[key] === 'stale-key'),
  emptyKeys: keys.filter((key) => env[key] === ''),
  telemetryDisabled: env.NEXT_TELEMETRY_DISABLED,
  config,
  endpoint,
  gateway,
  unauthorized,
  anthropicBase: env.ANTHROPIC_BASE_URL ?? null,
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

function runHostedAgent(
  directory: string,
  authMode: string,
  model?: string,
  timeout?: number,
  agentUser?: string,
  runs = 1
): { model: string | null; upstream: string[] } {
  const script = `
import { createServer } from 'node:http'
import { delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'
const { modulePath, root, authMode, cliPath, model, timeout, agentUser, runs } = JSON.parse(process.argv[1])
const { createHostedAgent } = await import(pathToFileURL(modulePath).href)
// A stand-in Gateway that records what reached it.
const upstream = []
const server = createServer((request, response) => {
  upstream.push(request.method + ' ' + request.url + ' ' + request.headers.authorization)
  request.resume()
  response.end('gateway reply')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
Object.assign(process.env, {
  PATH: root + delimiter + process.env.PATH,
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
    credential: 'fixture-key',
    cliPath,
    model,
    agentUser,
    origin: 'http://127.0.0.1:' + server.address().port,
  })
  for (let run = 0; run < runs; run++) {
    await agent.run({ root, cwd: root, prompt: 'Verify the fixture', timeout })
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
      authMode,
      cliPath: builtNext,
      model,
      timeout,
      agentUser,
      runs,
    },
    directory
  )
}

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
    [
      'codex-ai-gateway-api-key',
      'codex',
      'AI_GATEWAY_API_KEY',
      '/codex/v1/responses',
    ],
    [
      'claude-ai-gateway-api-key',
      'claude',
      'ANTHROPIC_AUTH_TOKEN',
      '/claude-code/v1/messages',
    ],
  ] as const)(
    'routes %s through Vercel AI Gateway without giving the agent the key',
    (authMode, name, keyName, path) => {
      const runs = writeFakeAgent(directory, name, { models: [] })
      const result = runHostedAgent(directory, authMode, 'fixture/model')
      expect(result.model).toBe('fixture/model')
      // The proxy adds the key on the fixed Gateway path.
      expect(result.upstream).toEqual([`POST ${path} Bearer fixture-key`])
      const [report] = runs()
      expect(report).toMatchObject({
        keys: [],
        conflictingKeys: [],
        emptyKeys: name === 'claude' ? ['ANTHROPIC_API_KEY'] : [],
        leakedHeader: null,
        telemetryDisabled: '1',
        gateway: 'gateway reply',
        unauthorized: 403,
      })
      expect(report.environment).not.toContain('fixture-key')
      expect(report.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
      expect(report.endpoint.replace(/^http:\/\/[^/]+/, '')).toBe(path)
      expect(report.args).toEqual(
        expect.arrayContaining(['--model', 'fixture/model'])
      )
      if (name === 'codex') {
        expect(report.config).toContain('env_key = "AI_GATEWAY_API_KEY"')
        expect(report.config).toContain('wire_api = "responses"')
        expect(report.config).not.toContain('fixture-key')
      } else {
        expect(report.anthropicBase).toMatch(/\/claude-code$/)
      }
      expect(report.environment).toContain(`"${keyName}":"next-upgrade-`)
    }
  )

  it.each([
    ['codex', 'codex-ai-gateway-api-key'],
    ['claude', 'claude-ai-gateway-api-key'],
  ] as const)(
    'runs %s as the agent user and takes the checkout back',
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
      expect(result.upstream).toHaveLength(1)
      const [report] = runs()
      expect(report.environment).not.toContain('fixture-key')
      const log = calls()
      const agent = log.findIndex((call) =>
        new RegExp(`^-n -u next-upgrade-agent -- env -i .* ${name} `).test(call)
      )
      expect(agent).toBeGreaterThan(-1)
      expect(log[agent]).not.toContain('fixture-key')
      // The probe ran first and found no access.
      expect(log.slice(0, agent).join('\n')).toContain(
        '-n -u next-upgrade-agent -- env -i'
      )
      expect(log).toContain(
        `-n chown -R next-upgrade-agent:${process.getgid()} ${directory}`
      )
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
      'codex-ai-gateway-api-key',
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
        'codex-ai-gateway-api-key',
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
      'codex-ai-gateway-api-key',
      [
        { model: 'gpt-fast', displayName: 'Fast' },
        { model: 'gpt-default', displayName: 'Default', isDefault: true },
      ],
      'gpt-default',
    ],
    [
      'claude',
      'claude-ai-gateway-api-key',
      [{ value: 'opus' }, { value: 'default' }],
      'default',
    ],
    ['codex', 'codex-ai-gateway-api-key', [], null],
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
    ['codex', 'codex-ai-gateway-api-key'],
    ['claude', 'claude-ai-gateway-api-key'],
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
    ['codex', 'codex-ai-gateway-api-key'],
    ['claude', 'claude-ai-gateway-api-key'],
  ] as const)(
    'shows an unverified %s result without the key',
    (name, authMode) => {
      writeFakeAgent(directory, name, { models: [], unverified: true })
      let stderr = ''
      try {
        runHostedAgent(directory, authMode, 'fixture/model')
      } catch (error) {
        stderr = String((error as { stderr?: unknown }).stderr)
      }
      expect(stderr).toContain('The build failed while using next-upgrade-')
      expect(stderr).not.toContain('fixture-key')
    }
  )

  it('reports a timeout without the key', () => {
    writeFakeAgent(directory, 'codex', { models: [], hang: true })
    let failure = { message: '', stderr: '' }
    try {
      runHostedAgent(
        directory,
        'codex-ai-gateway-api-key',
        'fixture/model',
        1000
      )
    } catch (error) {
      failure = error as typeof failure
    }
    expect(String(failure.stderr)).toContain('Using key next-upgr')
    expect(String(failure.stderr)).not.toContain('fixture-k')
    expect(String(failure.stderr)).toContain(
      'Codex upgrade and verification timed out.'
    )
  })

  it('rejects direct provider keys', () => {
    const script = `
import { pathToFileURL } from 'node:url'
const { modulePath, authMode } = JSON.parse(process.argv[1])
const { prepareUpgradeCandidates } = await import(pathToFileURL(modulePath).href)
const message = await prepareUpgradeCandidates({
  root: '.', artifactDirectory: '.', targets: [{ path: '.', policy: 'latest' }],
  supportingPaths: [], cliPath: '.', authMode, credential: 'fixture-key',
}).then(() => null, (error) => error.message)
console.log(JSON.stringify(message))
`
    for (const authMode of ['codex-api-key', 'claude-api-key']) {
      expect(
        runScript(
          script,
          { modulePath: join(actionRoot, 'prepare-upgrade.mjs'), authMode },
          directory
        )
      ).toBe(
        'A Vercel AI Gateway authentication mode and its credential are required.'
      )
    }
  })
})
