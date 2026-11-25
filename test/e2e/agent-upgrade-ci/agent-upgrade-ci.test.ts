import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { load } from 'js-yaml'

const nextBin = require.resolve('next/dist/bin/next')
const repoRoot = resolve(__dirname, '../../..')
const fixture = join(__dirname, 'fixtures/single-app-npm')
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
  // Setup's menus come from the helper it shares with next upgrade --agent.
  if (parent?.filename.endsWith('choose-option.js') && request.endsWith('/cli-select')) {
    return async ({ values, defaultValue }) => {
      fs.appendFileSync(config.requests, JSON.stringify({ menu: { values, defaultValue } }) + '\\n')
      // Tests that do not script the secret menus leave both for later.
      const selected = choices.shift() ?? (values.later ? 'Do it later' : undefined)
      // Like pressing Escape in the menu.
      if (selected === '__cancel__') throw undefined
      // Like pressing Ctrl+C in the menu.
      if (selected === '__interrupt__') {
        process.stdin.emit('keypress', '', { ctrl: true, name: 'c' })
        throw undefined
      }
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
          ...(config.existingPull ? [{
            state: 'open',
            html_url: config.setupUrl,
            body: config.crlfPull
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
        return config.pullFailure ? missing() : response({
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
  existingPull = false,
  manyPulls = false,
  crlfPull = false,
  templateFailure = false,
  pullFailure = false,
  tagMissing = false,
  annotatedTag = false,
  nonInteractive = false,
  registeredSecrets = [],
  pasted = [],
  secretFailure = false,
  secretLookupFailure = false,
  agent,
  cwd = directory,
}: {
  directory: string
  choices?: string[]
  flags?: string[]
  existingWorkflow?: boolean
  existingPull?: boolean
  manyPulls?: boolean
  crlfPull?: boolean
  templateFailure?: boolean
  pullFailure?: boolean
  tagMissing?: boolean
  annotatedTag?: boolean
  nonInteractive?: boolean
  registeredSecrets?: string[]
  pasted?: string[]
  secretFailure?: boolean
  secretLookupFailure?: boolean
  agent?: FakeAgent
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
      existingPull,
      manyPulls,
      crlfPull,
      templateFailure,
      pullFailure,
      tagMissing,
      annotatedTag,
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
        NEXT_TELEMETRY_DISABLED: '1',
        // Agent CLIs installed on this machine never reach setup.
        PATH: agentPath(directory, agent),
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
    menus: entries.flatMap((entry) => (entry.menu ? [entry.menu] : [])),
    // The environment each agent CLI started with.
    agentRuns: readAgentRuns(directory),
  }
}

type AgentRun = { name: string; env: Record<string, string | undefined> }

function readAgentRuns(directory: string): AgentRun[] {
  const file = join(directory, 'agent-runs.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

const gitPath = (process.env.PATH ?? '')
  .split(delimiter)
  .map((directory) => join(directory, 'git'))
  .find((file) => spawnSync(file, ['--version']).status === 0)

type FakeAgent = { name: 'codex' | 'claude'; models: readonly unknown[] }

// A PATH with Git and, when given, a stand-in agent CLI that answers model
// discovery like Codex app-server or Claude stream-json.
function agentPath(directory: string, agent?: FakeAgent) {
  const bin = join(directory, 'bin')
  rmSync(bin, { recursive: true, force: true })
  mkdirSync(bin)
  if (!gitPath) throw new Error('Could not find Git on PATH.')
  symlinkSync(gitPath, join(bin, 'git'))
  rmSync(join(directory, 'agent-runs.jsonl'), { force: true })
  if (agent) {
    const file = join(bin, agent.name)
    writeFileSync(
      file,
      `#!${process.execPath}
const fs = require('node:fs')
const readline = require('node:readline')
const models = ${JSON.stringify(agent.models)}
// Setup gives the CLI a fresh environment, so the path is written here.
fs.appendFileSync(${JSON.stringify(join(directory, 'agent-runs.jsonl'))}, JSON.stringify({ name: ${JSON.stringify(agent.name)}, env: process.env }) + '\\n')
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    console.log(JSON.stringify({ id: message.id, result: {} }))
  } else if (message.method === 'model/list') {
    console.log(JSON.stringify({ id: message.id, result: { data: models, nextCursor: null } }))
  } else if (message.type === 'control_request') {
    console.log(JSON.stringify({ type: 'control_response', response: { request_id: message.request_id, subtype: 'success', response: { models } } }))
  }
})
`
    )
    chmodSync(file, 0o755)
  }
  return bin
}

const agentMenu = {
  'codex-openai-api-key': 'Codex with an OpenAI API key',
  'claude-anthropic-api-key': 'Claude Code with an Anthropic API key',
  'claude-subscription': 'Claude Code with a Claude subscription',
}

const defaultModelInfo = (name: string) =>
  `The workflow uses the default model of its ${name} CLI. Install ${name} here to choose another model.`

// Scheduled upgrades support a single app that uses npm.
function copyApp(target: string) {
  cpSync(fixture, target, { recursive: true })
  // Setup requires a committed lockfile; the index is enough for Git.
  git(target, 'add', '--all', '.')
}

function editManifest(
  directory: string,
  edit: (manifest: {
    dependencies: Record<string, string>
    workspaces?: string[]
  }) => void
) {
  const path = join(directory, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  edit(manifest)
  writeFileSync(path, JSON.stringify(manifest, null, 2))
}

function committedWorkflow(result: ReturnType<typeof runSetup>) {
  const commit = result.requests.find(({ endpoint }) => endpoint === 'graphql')
  const [file] = commit.body.variables.input.fileChanges.additions
  expect(file.path).toBe(workflowPath)
  return Buffer.from(file.contents, 'base64').toString()
}

function git(directory: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Could not initialize the test checkout.')
  }
}

const unsupported =
  'Scheduled upgrades currently support a single app that uses npm'

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

  it('renders the app at the Git root with the chosen policy and prints the confirmed pull request and secret', () => {
    copyApp(directory)
    const result = runSetup({
      directory,
      flags: ['--ci=security'],
      choices: ['codex-openai-api-key', 'publish'],
    })
    expect(result.status).toBe(0)
    expect(result.output).toContain(setupUrl)
    // The next steps name both required secrets with a command to register each.
    expect(result.output).toContain(
      'gh secret set NEXT_UPGRADE_AGENT_CREDENTIAL --repo github.com/example/consumer'
    )
    expect(result.output).toContain(
      'gh secret set NEXT_UPGRADE_PUBLISH_TOKEN --repo github.com/example/consumer'
    )
    expect(result.output).toContain('hosted Codex agent')
    expect(result.output).toContain('Finish setup in 3 steps')
    // Each hosted agent brings its own credential; none goes through a gateway.
    expect(result.output).toContain(
      'Choose the hosted agent for the scheduled GitHub workflow:'
    )
    expect(result.menus[0]).toEqual({ values: agentMenu, defaultValue: 0 })
    // Pressing Enter through setup opens the pull request.
    expect(result.menus.find(({ values }) => 'publish' in values)).toEqual({
      values: { publish: 'Open pull request', cancel: 'Cancel' },
      defaultValue: 0,
    })
    // Setup never merges the pull request.
    expect(
      result.requests.some(({ endpoint }) => /\/merge$/.test(endpoint))
    ).toBe(false)
    // An explicit policy skips the question, and the pull request shows the workflow.
    expect(result.output).not.toContain('Choose the upgrade policy')
    expect(result.output).not.toContain('uses: vercel/next.js')
    // Without a Codex CLI here, the workflow keeps the CLI default model.
    expect(result.output).toContain(defaultModelInfo('Codex'))
    expect(result.output).not.toContain('model should run the upgrade')
    expect(result.output).toContain(
      `Open a setup pull request against ${repo} (main)?`
    )
    expect(result.output).toContain('Setup pull request opened')
    expect(
      result.requests.some(({ endpoint }) =>
        endpoint.startsWith('repos/vercel/next.js/branches/')
      )
    ).toBe(false)
    const workflow = committedWorkflow(result)
    expect(workflow).toContain("      app-path: '.'\n")
    expect(load(workflow)).toEqual({
      name: 'Next.js upgrade',
      on: {
        schedule: [{ cron: '0 0 * * 1' }],
        workflow_dispatch: null,
      },
      permissions: {},
      jobs: {
        upgrade: {
          permissions: { contents: 'read' },
          uses: `vercel/next.js/.github/workflows/next-upgrade.yml@${publicSha}`,
          with: {
            'app-path': '.',
            policy: 'security',
            'agent-auth': 'codex-openai-api-key',
            model: '',
            effort: '',
            // The test environment sets NEXT_TELEMETRY_DISABLED.
            'telemetry-disabled': true,
          },
          secrets: {
            'agent-credential': secretExpression(
              'NEXT_UPGRADE_AGENT_CREDENTIAL'
            ),
            'publish-token': secretExpression('NEXT_UPGRADE_PUBLISH_TOKEN'),
          },
        },
      },
    })
    const pull = result.requests.find(
      ({ endpoint, body }) => endpoint.endsWith('/pulls') && body
    )
    expect(pull).toMatchObject({
      body: {
        base: 'main',
        head: expect.stringMatching(/^next-upgrade\/setup-/),
      },
    })
    // The setup opens as a regular pull request, not a draft.
    expect(pull.body).not.toHaveProperty('draft')
  })

  it('renders the path of an app below the Git root', () => {
    const frontend = join(directory, 'frontend')
    copyApp(frontend)
    const result = runSetup({
      directory,
      cwd: frontend,
      choices: ['codex-openai-api-key', 'publish'],
    })
    expect(result.status).toBe(0)
    expect(load(committedWorkflow(result))).toMatchObject({
      jobs: {
        upgrade: { with: { 'app-path': 'frontend', policy: 'latest' } },
      },
    })
  })

  it('asks for the policy with plain --ci and renders Claude Code with an Anthropic API key', () => {
    copyApp(directory)
    const result = runSetup({
      directory,
      flags: ['--ci'],
      choices: ['latest', 'claude-anthropic-api-key', 'publish'],
      annotatedTag: true,
    })
    expect(result.status).toBe(0)
    expect(result.output).toContain('Choose the upgrade policy:')
    expect(result.menus[0].values).toEqual({
      security: 'Security updates (only for security advisories)',
      latest: 'Latest stable release (every new stable release)',
    })
    expect(result.output).toContain(setupUrl)
    expect(result.output).toContain(defaultModelInfo('Claude Code'))
    expect(load(committedWorkflow(result))).toMatchObject({
      jobs: {
        upgrade: {
          uses: `vercel/next.js/.github/workflows/next-upgrade.yml@${publicSha}`,
          with: {
            'app-path': '.',
            policy: 'latest',
            'agent-auth': 'claude-anthropic-api-key',
            model: '',
            effort: '',
          },
        },
      },
    })
  })

  describe('with an agent CLI on PATH', () => {
    const codex = 'codex-openai-api-key'
    const claude = 'claude-anthropic-api-key'
    // Like Codex app-server, the default model need not come first.
    const codexModels = [
      {
        model: 'gpt-fast',
        displayName: 'Fast',
        description: 'Quick',
        supportedReasoningEfforts: [
          { reasoningEffort: 'low' },
          { reasoningEffort: 'high' },
        ],
      },
      { model: 'gpt-default', displayName: 'Default', isDefault: true },
    ]
    const claudeModels = [
      { value: 'default', displayName: 'Default' },
      {
        value: 'opus',
        displayName: 'Opus',
        description: 'Most capable',
        supportedEffortLevels: ['low', 'high'],
      },
    ]
    const agents = {
      [codex]: { name: 'codex', models: codexModels },
      [claude]: { name: 'claude', models: claudeModels },
    } as const
    const setup = (auth: keyof typeof agents, choices: string[]) => {
      copyApp(directory)
      return runSetup({
        directory,
        agent: agents[auth],
        choices: [auth, ...choices],
      })
    }
    const rendered = (result: ReturnType<typeof runSetup>) =>
      (
        load(committedWorkflow(result)) as {
          jobs: { upgrade: { with: Record<string, unknown> } }
        }
      ).jobs.upgrade.with
    const effortQuestion = 'Which reasoning effort should the upgrade use?'

    it.each([
      [
        'a Codex model and effort',
        codex,
        ['gpt-fast', 'high'],
        'gpt-fast',
        'high',
      ],
      ['the default Codex model', codex, ['gpt-default'], '', ''],
      [
        'a Claude Code model at its default effort',
        claude,
        ['opus', 'default'],
        'opus',
        '',
      ],
    ] as const)('renders %s', (_, auth, choices, model, effort) => {
      const result = setup(auth, [...choices, 'publish'])
      expect(result.status).toBe(0)
      const displayName = auth === codex ? 'Codex' : 'Claude Code'
      expect(result.output).toContain(
        `Which ${displayName} model should run the upgrade?`
      )
      expect(result.output).not.toContain(defaultModelInfo(displayName))
      // The model menu highlights the agent CLI default.
      expect(result.menus[1]).toEqual(
        auth === codex
          ? {
              values: { 'gpt-fast': 'Fast — Quick', 'gpt-default': 'Default' },
              defaultValue: 1,
            }
          : {
              values: { default: 'Default', opus: 'Opus — Most capable' },
              defaultValue: 0,
            }
      )
      if (choices.length > 1) {
        expect(result.output).toContain(effortQuestion)
        expect(result.menus[2]).toEqual({
          values: { default: 'Model default', low: 'low', high: 'high' },
          defaultValue: 0,
        })
      } else {
        // A model without efforts skips the question.
        expect(result.output).not.toContain(effortQuestion)
      }
      expect(rendered(result)).toMatchObject({
        'agent-auth': auth,
        model,
        effort,
      })
    })

    it('goes back one question with Escape', () => {
      const result = setup(codex, [
        // Back from the model to the agent.
        '__cancel__',
        codex,
        'gpt-fast',
        // Back from the effort to the model.
        '__cancel__',
        'gpt-fast',
        'low',
        'publish',
      ])
      expect(result.status).toBe(0)
      expect(
        result.menus
          .slice(0, 7)
          .map(({ values, defaultValue }) => [
            Object.keys(values)[0],
            defaultValue,
          ])
      ).toEqual([
        [codex, 0],
        ['gpt-fast', 1],
        // Each question highlights the previous answer.
        [codex, 0],
        ['gpt-fast', 1],
        ['default', 0],
        ['gpt-fast', 0],
        ['default', 0],
      ])
      expect(rendered(result)).toMatchObject({
        model: 'gpt-fast',
        effort: 'low',
      })
    })

    it.each([
      // Discovery runs for every installed CLI, not only the chosen one.
      ['codex', claude],
      ['claude', codex],
    ] as const)(
      'reads the %s models a fresh install offers before the agent menu',
      (name, chosen) => {
        copyApp(directory)
        const result = runSetup({
          directory,
          agent: name === 'codex' ? agents[codex] : agents[claude],
          choices: [chosen, 'publish'],
        })
        expect(result.status).toBe(0)
        expect(result.agentRuns).toHaveLength(1)
        const [{ name: ran, env }] = result.agentRuns
        expect(ran).toBe(name)
        // None of this user's agent configuration reaches the CLI.
        const home = env.HOME!
        expect(home).toBeDefined()
        expect(home).not.toBe(process.env.HOME)
        expect(env).toMatchObject({
          USERPROFILE: home,
          CODEX_HOME: join(home, 'codex'),
          CLAUDE_CONFIG_DIR: join(home, 'claude'),
          XDG_CONFIG_HOME: join(home, 'config'),
        })
        expect(env).not.toHaveProperty('UPGRADE_SETUP_TEST')
        expect(env).not.toHaveProperty('NEXT_TELEMETRY_DISABLED')
        // Setup removes the fresh home once the questions are answered.
        expect(existsSync(home)).toBe(false)
      }
    )

    it('makes no changes when the model question is interrupted', () => {
      const result = setup(codex, ['__interrupt__'])
      expect(result.status).toBe(0)
      expect(result.output).not.toContain('Open a setup pull request')
      expect(result.requests.every(({ body }) => body === null)).toBe(true)
    })
  })

  it('makes no changes when the policy question is cancelled', () => {
    copyApp(directory)
    const result = runSetup({
      directory,
      flags: ['--ci'],
      choices: ['__cancel__'],
    })
    expect(result.status).toBe(0)
    expect(result.output).toContain('Choose the upgrade policy:')
    expect(result.requests.every(({ body }) => body === null)).toBe(true)
  })

  it('stops for plain --ci when not interactive', () => {
    copyApp(directory)
    const result = runSetup({
      directory,
      flags: ['--ci'],
      nonInteractive: true,
    })
    expect(result.status).toBe(1)
    expect(result.output).toContain(
      'Specify security or latest with --ci to set up scheduled upgrades non-interactively.'
    )
    expect(result.output).not.toContain('Choose the upgrade policy')
    expect(result.requests.every(({ body }) => body === null)).toBe(true)
  })

  it('rejects an unsupported policy before contacting GitHub', () => {
    copyApp(directory)
    const result = runSetup({ directory, flags: ['--ci=experimental-future'] })
    expect(result.status).toBe(1)
    expect(result.output).toContain('Use security or latest with --ci.')
    expect(result.requests).toEqual([])
  })

  it('stops outside an app directory', () => {
    const result = runSetup({ directory })
    expect(result.status).toBe(1)
    expect(result.output).toContain(
      'Run setup from the directory of a Next.js app.'
    )
    expect(result.requests.every(({ body }) => body === null)).toBe(true)
  })

  it.each([
    [
      'a missing package-lock.json',
      (app: string) => rmSync(join(app, 'package-lock.json')),
    ],
    [
      'a workspaces field',
      (app: string) =>
        editManifest(app, (manifest) => {
          manifest.workspaces = ['packages/*']
        }),
    ],
    [
      'a catalog: specifier for next',
      (app: string) =>
        editManifest(app, (manifest) => {
          manifest.dependencies.next = 'catalog:'
        }),
    ],
    [
      'a workspace: specifier for next',
      (app: string) =>
        editManifest(app, (manifest) => {
          manifest.dependencies.next = 'workspace:*'
        }),
    ],
    [
      'a pnpm-workspace.yaml in the app',
      (app: string) =>
        writeFileSync(join(app, 'pnpm-workspace.yaml'), 'packages: []\n'),
    ],
    [
      'a yarn.lock in the app',
      (app: string) => writeFileSync(join(app, 'yarn.lock'), ''),
    ],
    [
      'a bun.lockb in the app',
      (app: string) => writeFileSync(join(app, 'bun.lockb'), ''),
    ],
  ])('stops for %s', (_, change) => {
    copyApp(directory)
    change(directory)
    const result = runSetup({
      directory,
      choices: ['codex-openai-api-key', 'publish'],
    })
    expect(result.status).toBe(1)
    expect(result.output).toContain(unsupported)
    // The layout check runs before any GitHub request.
    expect(result.requests).toEqual([])
  })

  it.each([
    ['a pnpm-lock.yaml', 'pnpm-lock.yaml', ''],
    ['a bun.lock', 'bun.lock', ''],
    [
      'an npm workspace root',
      'package.json',
      JSON.stringify({ private: true, workspaces: ['frontend'] }),
    ],
  ])('stops for %s at the Git root above the app', (_, file, contents) => {
    const frontend = join(directory, 'frontend')
    copyApp(frontend)
    writeFileSync(join(directory, file), contents)
    const result = runSetup({
      directory,
      cwd: frontend,
      choices: ['codex-openai-api-key', 'publish'],
    })
    expect(result.status).toBe(1)
    expect(result.output).toContain(unsupported)
    // The layout check runs before any GitHub request.
    expect(result.requests).toEqual([])
  })

  it('stops for a package-lock.json that is not committed', () => {
    copyApp(directory)
    git(directory, 'rm', '--cached', '--quiet', 'package-lock.json')
    const result = runSetup({ directory })
    expect(result.status).toBe(1)
    expect(result.output).toContain(
      'Commit the package-lock.json, push it to the default branch, and run setup again.'
    )
    expect(result.requests).toEqual([])
  })

  it('finds an open setup pull request whose body was edited on GitHub', () => {
    copyApp(directory)
    const result = runSetup({ directory, existingPull: true, crlfPull: true })
    expect(result.status).toBe(0)
    expect(result.output).toContain(
      `A setup pull request is already open: ${setupUrl}`
    )
  })

  it('finds an open setup pull request among hundreds of open pull requests', () => {
    copyApp(directory)
    const result = runSetup({ directory, existingPull: true, manyPulls: true })
    expect(result.status).toBe(0)
    expect(result.output).toContain(
      `A setup pull request is already open: ${setupUrl}`
    )
  })

  it.each(['workflow', 'pull request'])(
    'stops for an existing %s',
    (existing) => {
      copyApp(directory)
      const result = runSetup({
        directory,
        existingWorkflow: existing === 'workflow',
        existingPull: existing === 'pull request',
      })
      expect(result.status).toBe(0)
      expect(result.requests.every(({ body }) => body === null)).toBe(true)
      expect(result.output).toContain(
        existing === 'workflow' ? 'already installed' : setupUrl
      )
    }
  )

  it.each(['templateFailure', 'pullFailure'] as const)(
    'reports %s without claiming a setup pull request',
    (failure) => {
      copyApp(directory)
      const result = runSetup({
        directory,
        choices: ['codex-openai-api-key', 'publish'],
        [failure]: true,
      })
      expect(result.status).toBe(1)
      expect(result.output).not.toContain('Setup pull request opened')
      expect(result.output).toContain(
        failure === 'templateFailure'
          ? 'Could not read the workflow template'
          : 'GitHub could not create the setup pull request.'
      )
    }
  )

  it('stops without a release tag for the installed version', () => {
    copyApp(directory)
    const result = runSetup({
      directory,
      choices: ['codex-openai-api-key', 'publish'],
      tagMissing: true,
    })
    expect(result.status).toBe(1)
    expect(result.output).toContain(
      `No vercel/next.js release tag v${nextVersion} matches the installed Next.js`
    )
    expect(result.requests.every(({ body }) => body === null)).toBe(true)
  })

  describe('secret registration', () => {
    const agentKey = 'sk-0123456789'
    const publishToken = 'github_pat_0123456789'
    const setSecret = (name: string, input: string) => ({
      // The value is never an argument.
      args: ['secret', 'set', name, '--repo', 'github.com/example/consumer'],
      input,
    })
    const setup = (options: Partial<Parameters<typeof runSetup>[0]>) => {
      copyApp(directory)
      return runSetup({
        directory,
        ...options,
        choices: [
          'codex-openai-api-key',
          'publish',
          ...(options.choices ?? []),
        ],
      })
    }

    it('registers both pasted secrets and leaves only the merge', () => {
      const result = setup({
        choices: ['paste', 'paste'],
        pasted: [agentKey, publishToken],
      })
      expect(result.status).toBe(0)
      expect(result.secrets).toEqual([
        setSecret('NEXT_UPGRADE_AGENT_CREDENTIAL', agentKey),
        setSecret('NEXT_UPGRADE_PUBLISH_TOKEN', publishToken),
      ])
      expect(result.output).toContain('One step left')
      // A single step has no number.
      expect(result.output).toContain('Merge the setup pull request')
      expect(result.output).not.toContain('1. Merge the setup pull request')
      expect(result.output).not.toContain('gh secret set')
      // The values appear nowhere else.
      for (const value of [agentKey, publishToken]) {
        expect(result.output).not.toContain(value)
        expect(JSON.stringify(result.requests)).not.toContain(value)
      }
    })

    it('skips secrets that are already registered', () => {
      const result = setup({
        registeredSecrets: [
          'NEXT_UPGRADE_AGENT_CREDENTIAL',
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
        registeredSecrets: ['NEXT_UPGRADE_AGENT_CREDENTIAL'],
        choices: ['open', 'again'],
        pasted: ['ghp_classic', publishToken],
      })
      expect(result.status).toBe(0)
      expect(result.opened).toHaveLength(1)
      const page = new URL(result.opened[0])
      expect(page.origin + page.pathname).toBe(
        'https://github.com/settings/personal-access-tokens/new'
      )
      const permissions = Object.fromEntries(page.searchParams)
      expect(permissions).toMatchObject({
        contents: 'write',
        pull_requests: 'write',
      })
      // The workflow commits no workflow files, so the token needs no
      // Workflows permission.
      expect(permissions).not.toHaveProperty('workflows')
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
      // The pull request exists, so setup still succeeds.
      expect(result.status).toBe(0)
      expect(result.output).toContain(setupUrl)
      expect(result.output).toContain('Finish setup in 3 steps')
      expect(result.output).toContain(
        'gh secret set NEXT_UPGRADE_AGENT_CREDENTIAL --repo github.com/example/consumer'
      )
      expect(result.output).toContain(
        'gh secret set NEXT_UPGRADE_PUBLISH_TOKEN --repo github.com/example/consumer'
      )
      expect(result.output).toContain('3. Merge the setup pull request')
      expect(result.output).not.toContain(agentKey)
    })
  })

  describe('agent credential', () => {
    const credentials = [
      {
        auth: 'codex-openai-api-key',
        description: 'An OpenAI API key for the hosted Codex agent.',
        title: 'OpenAI API key',
        steps: ['Create an API key in your OpenAI account and copy it.'],
        value: 'fixture-openai-key',
      },
      {
        auth: 'claude-anthropic-api-key',
        description: 'An Anthropic API key for the hosted Claude Code agent.',
        title: 'Anthropic API key',
        steps: [
          'Create an API key in your Claude Console account and copy it.',
        ],
        value: 'fixture-anthropic-key',
      },
      {
        auth: 'claude-subscription',
        description:
          'A long-lived token for your Claude subscription, used by the hosted',
        title: 'Claude subscription token',
        steps: [
          'In another terminal, run: claude setup-token',
          'Sign in, then copy the token it prints.',
        ],
        value: 'fixture-subscription-token',
      },
    ] as const
    const setup = (auth: string, choices: string[], pasted: string[] = []) => {
      copyApp(directory)
      return runSetup({
        directory,
        choices: [auth, 'publish', ...choices],
        pasted,
        registeredSecrets: ['NEXT_UPGRADE_PUBLISH_TOKEN'],
      })
    }

    it.each(credentials)(
      'renders $auth and registers its credential as pasted',
      ({ auth, description, title, steps, value }) => {
        const result = setup(auth, ['open'], [value])
        expect(result.status).toBe(0)
        expect(load(committedWorkflow(result))).toMatchObject({
          jobs: {
            upgrade: {
              with: { 'agent-auth': auth },
              secrets: {
                'agent-credential': secretExpression(
                  'NEXT_UPGRADE_AGENT_CREDENTIAL'
                ),
              },
            },
          },
        })
        expect(result.output).toContain(`Step 1 of 2: ${title}`)
        expect(result.output).toContain(description)
        // Provider pages and value formats can change, so setup opens no page
        // and accepts any value; the workflow checks an API key itself.
        const menu = result.menus.find(({ values }) => 'paste' in values)
        expect(menu.values.open).toBe('Show how to create one')
        expect(result.opened).toEqual([])
        for (const step of steps) {
          expect(result.output).toContain(step)
        }
        expect(result.secrets).toEqual([
          {
            args: [
              'secret',
              'set',
              'NEXT_UPGRADE_AGENT_CREDENTIAL',
              '--repo',
              'github.com/example/consumer',
            ],
            input: value,
          },
        ])
        expect(result.output).toContain('One step left')
        expect(result.output).not.toContain(value)
      }
    )

    it.each(credentials)(
      'lists how to create the $auth credential when it is left for later',
      ({ auth, steps }) => {
        const result = setup(auth, ['later'])
        expect(result.status).toBe(0)
        expect(result.opened).toEqual([])
        expect(result.output).toContain('Finish setup in 2 steps')
        expect(result.output).toContain('1. Add NEXT_UPGRADE_AGENT_CREDENTIAL')
        const closing = result.output.slice(
          result.output.indexOf('Finish setup in 2 steps')
        )
        for (const step of steps) {
          expect(closing).toContain(step)
        }
        expect(closing).not.toContain('Create one:')
        expect(closing).toContain(
          'gh secret set NEXT_UPGRADE_AGENT_CREDENTIAL --repo github.com/example/consumer'
        )
        expect(closing).toContain('2. Merge the setup pull request')
        expect(closing).toContain(
          'Review and merge it. Upgrades then run every week.'
        )
      }
    )
  })

  it('prints instructions instead of prompting when not interactive', () => {
    copyApp(directory)
    const result = runSetup({ directory, nonInteractive: true })
    expect(result.status).toBe(0)
    expect(result.output).toContain(
      'Run next upgrade --ci in an interactive terminal'
    )
    expect(result.output).toContain(
      'The workflow needs an OpenAI API key, an Anthropic API key, or a Claude subscription token in the NEXT_UPGRADE_AGENT_CREDENTIAL secret'
    )
    expect(result.requests.every(({ body }) => body === null)).toBe(true)
  })

  it('rejects --agent and --ci together before contacting GitHub', () => {
    const result = runSetup({ directory, flags: ['--ci', '--agent'] })
    expect(result.status).toBe(1)
    expect(result.requests).toEqual([])
  })
})
