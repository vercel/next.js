import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { load } from 'js-yaml'

const nextBin = require.resolve('next/dist/bin/next')
const repoRoot = resolve(__dirname, '../../..')
const fixture = join(__dirname, 'fixtures/workspace')
const nextVersion: string = require('next/package.json').version
const publicSha = 'a'.repeat(40)
const tagObjectSha = 'd'.repeat(40)
const consumerSha = 'b'.repeat(40)
const setupSha = 'c'.repeat(40)
const repo = 'example/consumer'
const workflowPath = '.github/workflows/next-upgrade.yml'
const templatePath = '.github/actions/next-upgrade/workflow.template.yml'
const setupUrl = 'https://github.com/example/consumer/pull/1'
const secretExpression = (name: string) =>
  ['${', `{ secrets.${name} }}`].join('')

const setupHook = `
const fs = require('node:fs')
const Module = require('node:module')
const config = JSON.parse(fs.readFileSync(process.env.UPGRADE_SETUP_TEST, 'utf8'))
if (!config.nonInteractive) {
  Object.defineProperty(process.stdin, 'isTTY', { value: true })
  Object.defineProperty(process.stdout, 'isTTY', { value: true })
}
const choices = [...config.choices]
const load = Module._load
let head = null
const response = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: '' })
const missing = () => ({ status: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' })
Module._load = function (request, parent, isMain) {
  const actual = load.call(this, request, parent, isMain)
  // Stand in for the telemetry transport so opt-out is checked on what would be sent.
  if (parent?.filename.endsWith('telemetry/storage.js') && request.endsWith('/post-telemetry-payload')) {
    return { postNextTelemetryPayload: async ({ events }) => {
      fs.appendFileSync(config.requests, JSON.stringify({ telemetry: events }) + '\\n')
      if (config.telemetryFails) throw new Error('Transport unavailable')
    } }
  }
  // Setup's menus come from the helper it shares with next upgrade --agent.
  if (parent?.filename.endsWith('choose-option.js') && request.endsWith('/cli-select')) {
    return async ({ values }) => {
      // Tests that do not script the secret menus leave both for later.
      const selected = choices.shift() ?? (values.later ? 'Do it later' : undefined)
      // Like pressing Escape in the menu.
      if (selected === '__cancel__') throw undefined
      const key = Object.keys(values).find(key => values[key] === selected) ?? selected
      if (!(key in values)) throw new Error('Unexpected menu: ' + Object.keys(values))
      return { id: key }
    }
  }
  // Pasted secrets come from the test instead of the terminal.
  if (parent?.filename.endsWith('setup-secrets.js') && request.endsWith('/secret-input')) {
    const pasted = [...(config.pasted ?? [])]
    return { withHiddenInput: (task) => task(async () => pasted.length ? pasted.shift() : null) }
  }
  if (!parent?.filename.endsWith('setup-ci.js')) return actual
  if (request === './harness' || request.endsWith('/model-discovery')) {
    fs.appendFileSync(config.requests, JSON.stringify({ localAgent: request }) + '\\n')
  }
  if (!request.endsWith('/cross-spawn')) return actual
  // Setup opens pages without waiting, through the asynchronous form.
  const spawn = (command, args) => {
    if (!['open', 'xdg-open', 'rundll32'].includes(command)) throw new Error('Unexpected command ' + command)
    fs.appendFileSync(config.requests, JSON.stringify({ opened: args.at(-1) }) + '\\n')
    const child = { on: () => child, unref() {} }
    return child
  }
  return Object.assign(spawn, {
    ...actual,
    sync(command, args, options) {
      if (command !== 'gh') return actual.sync(command, args, options)
      if (args[0] === 'secret') {
        fs.appendFileSync(config.requests, JSON.stringify({ secret: { args, input: options.input } }) + '\\n')
        return config.secretFailure
          ? { status: 1, stdout: '', stderr: 'HTTP 403' }
          : { status: 0, stdout: '', stderr: '' }
      }
      const endpoint = args[3].startsWith('/') ? args[3].slice(1) : args[3]
      const body = options.input ? JSON.parse(options.input) : null
      fs.appendFileSync(config.requests, JSON.stringify({ endpoint, body }) + '\\n')
      const consumer = 'repos/' + config.repo
      const source = 'repos/vercel/next.js'
      if (endpoint === consumer) return response({ default_branch: 'main', permissions: { push: true } })
      if (endpoint === consumer + '/branches/main') {
        return response({ name: 'main', commit: { sha: config.consumerSha } })
      }
      if (endpoint === source + '/git/ref/tags/v' + config.nextVersion) {
        if (config.tagMissing) return missing()
        return response({ object: config.annotatedTag
          ? { type: 'tag', sha: config.tagObjectSha }
          : { type: 'commit', sha: config.publicSha } })
      }
      if (config.annotatedTag && endpoint === source + '/git/tags/' + config.tagObjectSha) {
        return response({ object: { type: 'commit', sha: config.publicSha } })
      }
      if (endpoint.startsWith(consumer + '/actions/secrets/')) {
        if (config.secretLookupFailure) return { status: 1, stdout: '', stderr: 'gh: Forbidden (HTTP 403)' }
        const name = endpoint.slice((consumer + '/actions/secrets/').length)
        return (config.registeredSecrets ?? []).includes(name) ? response({ name }) : missing()
      }
      if (endpoint.startsWith(consumer + '/contents/')) {
        return config.existingWorkflow ? response({ type: 'file' }) : missing()
      }
      if (endpoint.startsWith(consumer + '/pulls?')) {
        const pulls = [
          // Dependency bots can keep hundreds of large pull requests open.
          ...Array.from({ length: config.manyPulls ? 500 : 0 }, (_, index) => ({
            state: 'open',
            html_url: 'https://github.com/' + config.repo + '/pull/' + (index + 1000),
            body: 'x'.repeat(20000),
            base: { ref: 'main' },
            head: { ref: 'renovate/' + index, repo: { full_name: config.repo } },
          })),
          ...(config.existingDraft ? [{
            state: 'open',
            draft: true,
            html_url: config.setupUrl,
            body: config.crlfDraft
              ? 'Edited on GitHub\\r\\n\\r\\n<!-- next-upgrade:setup -->\\r\\n'
              : '<!-- next-upgrade:setup -->',
            base: { ref: 'main' },
            head: { ref: 'next-upgrade/setup-existing', repo: { full_name: config.repo } },
          }] : []),
        ]
        // Like gh: --jq prints each filtered value on its own line, and
        // --slurp prints every page at once, which overflows an 8 MiB buffer.
        if (args.includes('--jq')) {
          const lines = pulls
            .filter((pull) => pull.head.ref.startsWith('next-upgrade/setup-'))
            .map((pull) => JSON.stringify(pull) + '\\n')
          return { status: 0, stdout: lines.join(''), stderr: '' }
        }
        const slurped = response([pulls])
        return slurped.stdout.length > 8 * 1024 * 1024
          ? { status: null, stdout: '', stderr: '', error: new Error('ENOBUFS') }
          : slurped
      }
      if (endpoint === source + '/contents/' + config.templatePath + '?ref=' + config.publicSha) {
        if (config.templateFailure) return missing()
        return response({ type: 'file', encoding: 'base64', content: Buffer.from(config.template).toString('base64') })
      }
      if (endpoint === source + '/contents/' + config.workflowPath + '?ref=' + config.publicSha) {
        return response({ type: 'file', encoding: 'base64', content: Buffer.from('name: workflow').toString('base64') })
      }
      if (endpoint.startsWith(consumer + '/git/ref/heads/next-upgrade/setup-')) {
        return head ? response({ object: { sha: head } }) : missing()
      }
      if (endpoint === consumer + '/git/refs' && body) {
        head = config.consumerSha
        return response({ object: { sha: head } })
      }
      if (endpoint === 'graphql' && body) {
        head = config.setupSha
        return response({ data: { createCommitOnBranch: { commit: { oid: head } } } })
      }
      if (endpoint === consumer + '/pulls' && body) {
        return config.draftFailure ? missing() : response({
          draft: true,
          state: 'open',
          head: { sha: head },
          base: { ref: 'main' },
          html_url: config.setupUrl,
        })
      }
      throw new Error('Unexpected GitHub request ' + endpoint)
    },
  })
}
`

function runSetup({
  directory,
  choices = [],
  flags = ['--ci=latest'],
  existingWorkflow = false,
  existingDraft = false,
  manyPulls = false,
  crlfDraft = false,
  templateFailure = false,
  draftFailure = false,
  tagMissing = false,
  annotatedTag = false,
  telemetry = false,
  telemetryFails = false,
  nonInteractive = false,
  registeredSecrets = [],
  pasted = [],
  secretFailure = false,
  secretLookupFailure = false,
  cwd = directory,
}: {
  directory: string
  choices?: string[]
  flags?: string[]
  existingWorkflow?: boolean
  existingDraft?: boolean
  manyPulls?: boolean
  crlfDraft?: boolean
  templateFailure?: boolean
  draftFailure?: boolean
  tagMissing?: boolean
  annotatedTag?: boolean
  telemetry?: boolean
  telemetryFails?: boolean
  nonInteractive?: boolean
  registeredSecrets?: string[]
  pasted?: string[]
  secretFailure?: boolean
  secretLookupFailure?: boolean
  cwd?: string
}) {
  const hook = join(directory, 'setup-hook.cjs')
  const config = join(directory, 'setup-test.json')
  const requests = join(directory, 'requests.jsonl')
  writeFileSync(hook, setupHook)
  writeFileSync(requests, '')
  writeFileSync(
    config,
    JSON.stringify({
      repo,
      nextVersion,
      publicSha,
      tagObjectSha,
      consumerSha,
      setupSha,
      setupUrl,
      templatePath,
      workflowPath,
      requests,
      choices,
      existingWorkflow,
      existingDraft,
      manyPulls,
      crlfDraft,
      templateFailure,
      draftFailure,
      tagMissing,
      annotatedTag,
      telemetryFails,
      nonInteractive,
      registeredSecrets,
      pasted,
      secretFailure,
      secretLookupFailure,
      template: readFileSync(join(repoRoot, templatePath), 'utf8'),
    })
  )
  const result = spawnSync(
    process.execPath,
    ['--require', hook, nextBin, 'upgrade', ...flags],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        // CI keeps telemetry preferences in the test directory.
        CI: '1',
        NEXT_TELEMETRY_DISABLED: telemetry ? '' : '1',
        NEXT_TELEMETRY_DEBUG: '',
        UPGRADE_SETUP_TEST: config,
      },
    }
  )
  const entries = readFileSync(requests, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  return {
    status: result.status,
    output: result.stdout + result.stderr,
    requests: entries.filter((entry) => entry.endpoint !== undefined),
    secrets: entries.flatMap((entry) => (entry.secret ? [entry.secret] : [])),
    opened: entries.flatMap((entry) => (entry.opened ? [entry.opened] : [])),
    localAgent: entries.filter((entry) => entry.localAgent),
    telemetry: entries.flatMap((entry) => entry.telemetry ?? []),
  }
}

// The hosted workflow installs with pnpm, so single apps need a pnpm lockfile.
function copySingleApp(directory: string) {
  cpSync(join(fixture, 'apps/docs'), directory, { recursive: true })
  writeFileSync(join(directory, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
}

function git(directory: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Could not initialize the test checkout.')
  }
}

describe('next upgrade --ci', () => {
  let directory: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'next-upgrade-ci-'))
    git(directory, 'init')
    git(directory, 'remote', 'add', 'origin', `https://github.com/${repo}.git`)
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('pins the selected catalog group and prints the confirmed draft and secret', () => {
    cpSync(fixture, directory, { recursive: true })
    const result = runSetup({
      directory,
      choices: [
        '[ ] apps/admin',
        '[ ] apps/web',
        'continue',
        'codex-ai-gateway-api-key',
        'publish',
      ],
    })
    expect(result.status).toBe(0)
    expect(result.output).toContain(setupUrl)
    // The next steps name both required secrets with a command to register each.
    expect(result.output).toContain(
      'gh secret set NEXT_UPGRADE_AGENT_API_KEY --repo github.com/example/consumer'
    )
    expect(result.output).toContain(
      'gh secret set NEXT_UPGRADE_PUBLISH_TOKEN --repo github.com/example/consumer'
    )
    expect(result.output).toContain(
      'read and write access to Contents, Pull requests, and Workflows.'
    )
    expect(result.output).toContain('hosted Codex agent')
    expect(result.output).toContain('Finish setup in 3 steps')
    // Setup never merges the draft.
    expect(
      result.requests.some(({ endpoint }) => /\/merge$/.test(endpoint))
    ).toBe(false)
    // Setup asks and reports; the draft shows the group and the workflow.
    expect(result.output).not.toContain('group affects')
    expect(result.output).not.toContain('uses: vercel/next.js')
    expect(result.output).not.toContain('Choose an upgrade policy')
    expect(result.localAgent).toEqual([])
    expect(
      result.requests.some(({ endpoint }) =>
        endpoint.startsWith('repos/vercel/next.js/branches/')
      )
    ).toBe(false)
    const commit = result.requests.find(
      ({ endpoint }) => endpoint === 'graphql'
    )
    const file = commit.body.variables.input.fileChanges.additions[0]
    expect(file.path).toBe(workflowPath)
    expect(load(Buffer.from(file.contents, 'base64').toString())).toMatchObject(
      {
        jobs: {
          upgrade: {
            uses: `vercel/next.js/.github/workflows/next-upgrade.yml@${publicSha}`,
            with: {
              targets: JSON.stringify([
                { path: 'apps/admin', policy: 'latest' },
                { path: 'apps/web', policy: 'latest' },
              ]),
              'supporting-paths': JSON.stringify(['packages/shared']),
              'agent-auth': 'codex-ai-gateway-api-key',
              // The test environment sets NEXT_TELEMETRY_DISABLED.
              'telemetry-disabled': true,
            },
            secrets: {
              'agent-credential': secretExpression(
                'NEXT_UPGRADE_AGENT_API_KEY'
              ),
              'publish-token': secretExpression('NEXT_UPGRADE_PUBLISH_TOKEN'),
            },
          },
        },
      }
    )
    expect(
      result.requests.find(
        ({ endpoint, body }) => endpoint.endsWith('/pulls') && body
      )
    ).toMatchObject({
      body: {
        base: 'main',
        head: expect.stringMatching(/^next-upgrade\/setup-/),
        draft: true,
      },
    })
  })

  it('finds a pnpm workspace below the Git root', () => {
    const frontend = join(directory, 'frontend')
    cpSync(fixture, frontend, { recursive: true })
    const result = runSetup({
      directory,
      cwd: frontend,
      choices: [
        '[ ] frontend/apps/admin',
        '[ ] frontend/apps/web',
        'continue',
        'codex-ai-gateway-api-key',
        'publish',
      ],
    })
    expect(result.status).toBe(0)
    const commit = result.requests.find(
      ({ endpoint }) => endpoint === 'graphql'
    )
    const file = commit.body.variables.input.fileChanges.additions[0]
    expect(load(Buffer.from(file.contents, 'base64').toString())).toMatchObject(
      {
        jobs: {
          upgrade: {
            with: {
              targets: JSON.stringify([
                { path: 'frontend/apps/admin', policy: 'latest' },
                { path: 'frontend/apps/web', policy: 'latest' },
              ]),
              'supporting-paths': JSON.stringify(['frontend/packages/shared']),
            },
          },
        },
      }
    )
  })

  it('finds an open setup draft whose body was edited on GitHub', () => {
    copySingleApp(directory)
    const result = runSetup({ directory, existingDraft: true, crlfDraft: true })
    expect(result.status).toBe(0)
    expect(result.output).toContain(
      `A setup pull request is already open: ${setupUrl}`
    )
  })

  it('finds an open setup draft among hundreds of open pull requests', () => {
    copySingleApp(directory)
    const result = runSetup({ directory, existingDraft: true, manyPulls: true })
    expect(result.status).toBe(0)
    expect(result.output).toContain(
      `A setup pull request is already open: ${setupUrl}`
    )
  })

  it.each(['workflow', 'draft'])('stops for an existing %s', (existing) => {
    const result = runSetup({
      directory,
      existingWorkflow: existing === 'workflow',
      existingDraft: existing === 'draft',
    })
    expect(result.status).toBe(0)
    expect(result.requests.every(({ body }) => body === null)).toBe(true)
    expect(result.output).toContain(
      existing === 'workflow' ? 'already installed' : setupUrl
    )
  })

  it('honors an explicit app policy and renders Claude Gateway for a single app', () => {
    copySingleApp(directory)
    writeFileSync(
      join(directory, 'next.config.js'),
      "module.exports = { experimental: { agentUpgrade: 'latest' } }"
    )
    const result = runSetup({
      directory,
      flags: ['--ci'],
      choices: ['claude-ai-gateway-api-key', 'publish'],
      annotatedTag: true,
    })
    expect(result.output).toContain(setupUrl)
    expect(result.status).toBe(0)
    const commit = result.requests.find(
      ({ endpoint }) => endpoint === 'graphql'
    )
    const [{ contents }] = commit.body.variables.input.fileChanges.additions
    expect(load(Buffer.from(contents, 'base64').toString())).toMatchObject({
      jobs: {
        upgrade: {
          uses: `vercel/next.js/.github/workflows/next-upgrade.yml@${publicSha}`,
          with: {
            targets: JSON.stringify([{ path: '.', policy: 'latest' }]),
            'agent-auth': 'claude-ai-gateway-api-key',
          },
        },
      },
    })
  })

  it.each(['templateFailure', 'draftFailure'] as const)(
    'reports %s without claiming a setup draft',
    (failure) => {
      copySingleApp(directory)
      const result = runSetup({
        directory,
        choices: ['codex-ai-gateway-api-key', 'publish'],
        [failure]: true,
      })
      expect(result.status).toBe(1)
      expect(result.output).not.toContain('Setup draft opened')
      expect(result.output).toContain(
        failure === 'templateFailure'
          ? 'Could not read the workflow template'
          : 'GitHub could not create the setup draft'
      )
    }
  )

  it('stops without a release tag for the installed version', () => {
    copySingleApp(directory)
    const result = runSetup({
      directory,
      choices: ['codex-ai-gateway-api-key', 'publish'],
      tagMissing: true,
    })
    expect(result.status).toBe(1)
    expect(result.output).toContain(
      `No vercel/next.js release tag v${nextVersion} matches the installed Next.js`
    )
    expect(result.requests.every(({ body }) => body === null)).toBe(true)
  })

  it.each([
    [
      'records setup start and outcome',
      { telemetry: true, envOptOut: false, telemetryFails: false },
    ],
    [
      'honors NEXT_TELEMETRY_DISABLED',
      { telemetry: false, envOptOut: false, telemetryFails: false },
    ],
    [
      'honors a .env opt-out',
      { telemetry: true, envOptOut: true, telemetryFails: false },
    ],
    [
      'keeps the result when the transport fails',
      { telemetry: true, envOptOut: false, telemetryFails: true },
    ],
  ])('%s', (_, { telemetry, envOptOut, telemetryFails }) => {
    copySingleApp(directory)
    if (envOptOut) {
      writeFileSync(join(directory, '.env'), 'NEXT_TELEMETRY_DISABLED=1\n')
    }
    const result = runSetup({
      directory,
      choices: ['codex-ai-gateway-api-key', 'publish'],
      telemetry,
      telemetryFails,
    })
    expect(result.status).toBe(0)
    expect(result.output).toContain(setupUrl)
    const commit = result.requests.find(
      ({ endpoint }) => endpoint === 'graphql'
    )
    const [{ contents }] = commit.body.variables.input.fileChanges.additions
    // Scheduled runs inherit the opt-out that setup sees.
    expect(load(Buffer.from(contents, 'base64').toString())).toMatchObject({
      jobs: {
        upgrade: { with: { 'telemetry-disabled': !telemetry || envOptOut } },
      },
    })
    if (!telemetry || envOptOut) {
      expect(result.telemetry).toEqual([])
      return
    }
    expect(result.telemetry).toEqual([
      {
        eventName: 'NEXT_AGENT_UPGRADE_CI_INSTALL_STARTED',
        fields: { schemaVersion: 1, installId: expect.any(String) },
      },
      {
        eventName: 'NEXT_AGENT_UPGRADE_CI_INSTALL_RESULT',
        fields: {
          schemaVersion: 1,
          installId: result.telemetry[0].fields.installId,
          outcome: 'draft_created',
          durationMs: expect.any(Number),
        },
      },
    ])
  })

  it('treats a symlinked .env file as an opt-out without reading it', () => {
    copySingleApp(directory)
    const outside = mkdtempSync(join(tmpdir(), 'next-upgrade-ci-env-'))
    try {
      // The target has no opt-out, so reading it would enable telemetry.
      writeFileSync(join(outside, 'env'), 'OTHER=1\n')
      symlinkSync(join(outside, 'env'), join(directory, '.env'))
      const result = runSetup({
        directory,
        choices: ['codex-ai-gateway-api-key', 'publish'],
        telemetry: true,
      })
      expect(result.status).toBe(0)
      const commit = result.requests.find(
        ({ endpoint }) => endpoint === 'graphql'
      )
      const [{ contents }] = commit.body.variables.input.fileChanges.additions
      expect(load(Buffer.from(contents, 'base64').toString())).toMatchObject({
        jobs: { upgrade: { with: { 'telemetry-disabled': true } } },
      })
      expect(result.telemetry).toEqual([])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('keeps setup telemetry settings out of the project', () => {
    copySingleApp(directory)
    const outside = mkdtempSync(join(tmpdir(), 'next-upgrade-ci-conf-'))
    try {
      // In CI, telemetry would keep its settings in .next/cache/config.json.
      writeFileSync(join(outside, 'config.json'), '{}')
      mkdirSync(join(directory, '.next/cache'), { recursive: true })
      symlinkSync(
        join(outside, 'config.json'),
        join(directory, '.next/cache/config.json')
      )
      const result = runSetup({
        directory,
        choices: ['codex-ai-gateway-api-key', 'publish'],
        telemetry: true,
      })
      expect(result.status).toBe(0)
      expect(result.telemetry).toHaveLength(2)
      expect(readFileSync(join(outside, 'config.json'), 'utf8')).toBe('{}')
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('reads an empty NEXT_TELEMETRY_DISABLED in .env as no opt-out', () => {
    copySingleApp(directory)
    writeFileSync(
      join(directory, '.env'),
      'NEXT_TELEMETRY_DISABLED=\nNEXT_PUBLIC_API_URL=https://example.com\n'
    )
    const result = runSetup({
      directory,
      choices: ['codex-ai-gateway-api-key', 'publish'],
      telemetry: true,
    })
    expect(result.status).toBe(0)
    const commit = result.requests.find(
      ({ endpoint }) => endpoint === 'graphql'
    )
    const [{ contents }] = commit.body.variables.input.fileChanges.additions
    expect(load(Buffer.from(contents, 'base64').toString())).toMatchObject({
      jobs: { upgrade: { with: { 'telemetry-disabled': false } } },
    })
  })

  it('honors a .env opt-out in any selected app, with or without a policy', () => {
    cpSync(fixture, directory, { recursive: true })
    // Only the second app opts out, and setup runs with an explicit policy.
    writeFileSync(
      join(directory, 'apps/web/.env'),
      'NEXT_TELEMETRY_DISABLED=1\n'
    )
    const result = runSetup({
      directory,
      choices: [
        '[ ] apps/admin',
        '[ ] apps/web',
        'continue',
        'codex-ai-gateway-api-key',
        'publish',
      ],
      telemetry: true,
    })
    expect(result.status).toBe(0)
    const commit = result.requests.find(
      ({ endpoint }) => endpoint === 'graphql'
    )
    const [{ contents }] = commit.body.variables.input.fileChanges.additions
    expect(load(Buffer.from(contents, 'base64').toString())).toMatchObject({
      jobs: { upgrade: { with: { 'telemetry-disabled': true } } },
    })
    // Setup applies the same decision to its own events.
    expect(result.telemetry).toEqual([])
  })

  it('honors a selected app opt-out when setup stops after app selection', () => {
    cpSync(fixture, directory, { recursive: true })
    writeFileSync(
      join(directory, 'apps/web/.env'),
      'NEXT_TELEMETRY_DISABLED=1\n'
    )
    const result = runSetup({
      directory,
      choices: ['[ ] apps/admin', '[ ] apps/web', 'continue', '__cancel__'],
      telemetry: true,
    })
    expect(result.status).toBe(0)
    expect(result.output).not.toContain(setupUrl)
    expect(result.telemetry).toEqual([])
  })

  it('stops for a project without a pnpm lockfile', () => {
    cpSync(join(fixture, 'apps/docs'), directory, { recursive: true })
    const result = runSetup({ directory })
    expect(result.status).toBe(1)
    expect(result.output).toContain('Scheduled upgrades support pnpm projects')
    expect(result.requests.every(({ body }) => body === null)).toBe(true)
  })

  it('stops for a lockfile older than pnpm 9', () => {
    copySingleApp(directory)
    writeFileSync(join(directory, 'pnpm-lock.yaml'), "lockfileVersion: '6.0'\n")
    const result = runSetup({ directory })
    expect(result.status).toBe(1)
    expect(result.output).toContain(
      'Scheduled upgrades support pnpm lockfile version 9.0'
    )
    expect(result.requests.every(({ body }) => body === null)).toBe(true)
  })

  describe('secret registration', () => {
    const agentKey = 'gateway-key-0123456789'
    const publishToken = 'github_pat_0123456789'
    const setSecret = (name: string, input: string) => ({
      // The value is never an argument.
      args: ['secret', 'set', name, '--repo', 'github.com/example/consumer'],
      input,
    })
    const setup = (options: Partial<Parameters<typeof runSetup>[0]>) => {
      copySingleApp(directory)
      return runSetup({
        directory,
        ...options,
        choices: [
          'codex-ai-gateway-api-key',
          'publish',
          ...(options.choices ?? []),
        ],
      })
    }

    it('registers both pasted secrets and leaves only the merge', () => {
      const result = setup({
        choices: ['paste', 'paste'],
        pasted: [agentKey, publishToken],
        telemetry: true,
      })
      expect(result.status).toBe(0)
      expect(result.secrets).toEqual([
        setSecret('NEXT_UPGRADE_AGENT_API_KEY', agentKey),
        setSecret('NEXT_UPGRADE_PUBLISH_TOKEN', publishToken),
      ])
      expect(result.output).toContain('One step left')
      expect(result.output).toContain('1. Merge the setup draft')
      expect(result.output).not.toContain('gh secret set')
      // The values appear nowhere else.
      for (const value of [agentKey, publishToken]) {
        expect(result.output).not.toContain(value)
        expect(JSON.stringify(result.telemetry)).not.toContain(value)
        expect(JSON.stringify(result.requests)).not.toContain(value)
      }
    })

    it('skips secrets that are already registered', () => {
      const result = setup({
        registeredSecrets: [
          'NEXT_UPGRADE_AGENT_API_KEY',
          'NEXT_UPGRADE_PUBLISH_TOKEN',
        ],
      })
      expect(result.status).toBe(0)
      expect(result.secrets).toEqual([])
      expect(result.output.match(/is already registered/g)).toHaveLength(2)
      expect(result.output).toContain('One step left')
    })

    it('opens the pre-filled token page and asks again for a token of the wrong kind', () => {
      const result = setup({
        registeredSecrets: ['NEXT_UPGRADE_AGENT_API_KEY'],
        choices: ['open', 'again'],
        pasted: ['ghp_classic', publishToken],
      })
      expect(result.status).toBe(0)
      expect(result.opened).toHaveLength(1)
      const page = new URL(result.opened[0])
      expect(page.origin + page.pathname).toBe(
        'https://github.com/settings/personal-access-tokens/new'
      )
      expect(Object.fromEntries(page.searchParams)).toMatchObject({
        contents: 'write',
        pull_requests: 'write',
        workflows: 'write',
      })
      expect(result.output).toContain('This is not a fine-grained token')
      expect(result.output).not.toContain('ghp_classic')
      expect(result.secrets).toEqual([
        setSecret('NEXT_UPGRADE_PUBLISH_TOKEN', publishToken),
      ])
    })

    it('offers registration when the lookup fails', () => {
      const result = setup({
        secretLookupFailure: true,
        choices: ['paste', 'paste'],
        pasted: [agentKey, publishToken],
      })
      // A lookup GitHub refuses counts as not registered and never fails setup.
      expect(result.status).toBe(0)
      expect(result.secrets).toHaveLength(2)
      expect(result.output).toContain('One step left')
    })

    it('still looks up the secrets it does not ask about after Escape', () => {
      const result = setup({
        registeredSecrets: ['NEXT_UPGRADE_PUBLISH_TOKEN'],
        choices: ['__cancel__'],
      })
      expect(result.status).toBe(0)
      expect(result.output).toContain('Finish setup in 2 steps')
      expect(result.output).toContain('Publication token registered')
      expect(result.output).not.toContain(
        'gh secret set NEXT_UPGRADE_PUBLISH_TOKEN'
      )
    })

    it('rejects an empty value before registering anything', () => {
      const result = setup({
        choices: ['paste', 'later', 'later'],
        pasted: ['   '],
      })
      expect(result.status).toBe(0)
      expect(result.output).toContain('Nothing was pasted.')
      expect(result.secrets).toEqual([])
    })

    it.each([
      [
        'a rejected registration',
        {
          choices: ['paste', 'later'],
          pasted: [agentKey],
          secretFailure: true,
        },
      ],
      ['leaving the menu with Escape', { choices: ['__cancel__'] }],
      ['doing both later', { choices: ['later', 'later'] }],
    ])('keeps the step in the closing list after %s', (_, options) => {
      const result = setup(options)
      // The draft exists, so setup still succeeds.
      expect(result.status).toBe(0)
      expect(result.output).toContain(setupUrl)
      expect(result.output).toContain('Finish setup in 3 steps')
      expect(result.output).toContain(
        'gh secret set NEXT_UPGRADE_AGENT_API_KEY --repo github.com/example/consumer'
      )
      expect(result.output).toContain(
        'gh secret set NEXT_UPGRADE_PUBLISH_TOKEN --repo github.com/example/consumer'
      )
      expect(result.output).toContain('3. Merge the setup draft')
      expect(result.output).not.toContain(agentKey)
    })
  })

  it('prints instructions instead of prompting when not interactive', () => {
    copySingleApp(directory)
    const result = runSetup({ directory, nonInteractive: true })
    expect(result.status).toBe(0)
    expect(result.output).toContain(
      'Run next upgrade --ci in an interactive terminal'
    )
    expect(result.requests.every(({ body }) => body === null)).toBe(true)
  })

  it.each([
    ['blocks an app config that disables agent upgrades', ['--ci'], 1],
    ['lets an explicit --ci policy override it', ['--ci=security'], 0],
  ])('%s', (_, flags, status) => {
    copySingleApp(directory)
    writeFileSync(
      join(directory, 'next.config.js'),
      'module.exports = { experimental: { agentUpgrade: false } }'
    )
    const result = runSetup({
      directory,
      flags,
      choices: ['codex-ai-gateway-api-key', 'publish'],
    })
    expect(result.status).toBe(status)
    if (status === 0) {
      expect(result.output).toContain(setupUrl)
    } else {
      expect(result.output).toContain('disables agent upgrades')
      expect(result.requests.every(({ body }) => body === null)).toBe(true)
    }
  })

  it('requires every app in a shared catalog group', () => {
    cpSync(fixture, directory, { recursive: true })
    const result = runSetup({
      directory,
      choices: ['[ ] apps/web', 'continue'],
    })
    expect(result.status).toBe(1)
    expect(result.output).toContain('Select apps/admin together with apps/web')
    expect(result.requests.every(({ body }) => body === null)).toBe(true)
  })

  it('makes no changes when app selection is cancelled', () => {
    cpSync(fixture, directory, { recursive: true })
    const result = runSetup({ directory, choices: ['cancel'] })
    expect(result.status).toBe(0)
    expect(result.requests.every(({ body }) => body === null)).toBe(true)
  })

  it('rejects --agent and --ci together before contacting GitHub', () => {
    const result = runSetup({ directory, flags: ['--ci', '--agent'] })
    expect(result.status).toBe(1)
    expect(result.requests).toEqual([])
  })
})
