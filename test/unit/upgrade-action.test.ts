import { execFileSync, spawnSync } from 'child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import yaml from 'js-yaml'

const actionDirectory = resolve(__dirname, '../../packages/next-upgrade/action')
const lib = require(join(actionDirectory, 'lib.js'))
const UUID = '6f1c1f6e-2f6b-4c1e-9a3b-1d2e3f4a5b6c'
const MARKER = '<!-- next-upgrade: security; path="." -->'
const SCOPE = lib.getUpgradeScope('acme/app', 'main', '.')
const BRANCH = `${SCOPE.branchPrefix}security-16.3.5`

describe('next upgrade GitHub Action', () => {
  describe('action.yml', () => {
    const action = yaml.load(
      readFileSync(join(actionDirectory, 'action.yml'), 'utf8')
    ) as any

    it('declares the expected inputs', () => {
      expect(action.runs.using).toBe('composite')
      expect(
        Object.fromEntries(
          Object.entries(action.inputs).map(([name, input]: [string, any]) => [
            name,
            [input.required, input.default],
          ])
        )
      ).toEqual({
        agent: [true, undefined],
        'api-key': [true, undefined],
        policy: [false, 'security'],
        directory: [false, '.'],
        model: [false, ''],
        effort: [false, ''],
        'next-version': [false, 'canary'],
        'node-version': [false, 'lts/*'],
        // eslint-disable-next-line no-template-curly-in-string -- GitHub expression
        'github-token': [false, '${{ github.token }}'],
      })
    })

    it('reports the start before installs and the result always', () => {
      const steps: any[] = action.runs.steps
      const index = (command: string) =>
        steps.findIndex((step) => step.run?.endsWith(` ${command}`))

      expect(index('prepare')).toBeLessThan(index('report-started'))
      expect(index('report-started')).toBeLessThan(index('validate'))
      expect(index('validate')).toBeLessThan(index('install-dependencies'))
      expect(index('install-dependencies')).toBeLessThan(index('install-agent'))
      expect(index('install-agent')).toBeLessThan(index('agent'))
      expect(index('agent')).toBeLessThan(index('deliver'))
      expect(index('deliver')).toBeLessThan(index('report-result'))
      expect(index('report-result')).toBeLessThan(index('cleanup'))
      for (const command of ['report-started', 'report-result']) {
        expect(steps[index(command)]['continue-on-error']).toBe(true)
      }
      for (const command of ['report-result', 'cleanup']) {
        expect(steps[index(command)].if).toBe('always()')
      }
    })

    it('passes inputs through env and keeps the token out of the agent step', () => {
      const steps: any[] = action.runs.steps
      for (const step of steps) {
        if (step.run) {
          expect(step.shell).toBe('bash')
          expect(step.run).not.toContain('${{')
        }
      }
      const tokenSteps = steps.filter((step) =>
        JSON.stringify(step.env ?? {}).includes('github-token')
      )
      expect(tokenSteps.map((step) => step.run)).toEqual([
        'node "$GITHUB_ACTION_PATH/run.js" deliver',
      ])
      expect(tokenSteps[0].env.NODE_OPTIONS).toBe('')
    })
  })

  describe('validateInputs', () => {
    const repoRoot = resolve('/repo')
    const valid = {
      agent: 'claude',
      policy: 'security',
      hasApiKey: true,
      directory: 'apps/web',
      repoRoot,
    }

    it('resolves the app directory', () => {
      expect(lib.validateInputs(valid, () => true)).toEqual({
        error: null,
        appDirectory: resolve('/repo/apps/web'),
        directory: 'apps/web',
      })
      expect(
        lib.validateInputs({ ...valid, directory: '' }, () => true).directory
      ).toBe('.')
    })

    it.each([
      [{ agent: 'copilot' }, 'Unsupported agent "copilot"'],
      [{ policy: 'nightly' }, 'Unsupported policy "nightly"'],
      [{ hasApiKey: false }, 'Missing api-key. Pass the ANTHROPIC_API_KEY'],
      [
        { hasApiKey: false, agent: 'codex' },
        'Missing api-key. Pass the OPENAI_API_KEY',
      ],
      [{ directory: '../other' }, 'must be inside the repository'],
      [{ directory: resolve('/repo/app') }, 'must be inside the repository'],
    ])('rejects %j', (overrides, error) => {
      expect(
        lib.validateInputs({ ...valid, ...overrides }, () => true).error
      ).toContain(error)
    })

    it('rejects a missing directory', () => {
      expect(lib.validateInputs(valid, () => false).error).toBe(
        'The directory "apps/web" does not exist.'
      )
    })

    it('rejects a symlinked directory outside the repository', () => {
      expect(
        lib.validateInputs(
          valid,
          () => true,
          (directory: string) =>
            directory === resolve('/repo/apps/web')
              ? resolve('/elsewhere')
              : directory
        ).error
      ).toBe('The directory input must be inside the repository.')
    })
  })

  describe('getInstallCommand', () => {
    const repoRoot = resolve('/repo')
    const app = resolve('/repo/apps/web')
    const install = (files: Record<string, string>) =>
      lib.getInstallCommand(
        app,
        repoRoot,
        (file: string) => file in files,
        (file: string) => files[file]
      )

    it.each([
      ['pnpm-lock.yaml', 'pnpm', ['install', '--frozen-lockfile']],
      ['package-lock.json', 'npm', ['ci']],
      ['bun.lock', 'bun', ['install', '--frozen-lockfile']],
      ['bun.lockb', 'bun', ['install', '--frozen-lockfile']],
      ['yarn.lock', 'yarn', ['install', '--frozen-lockfile']],
    ])('uses %s from the workspace root', (lockfile, command, args) => {
      expect(install({ [join(repoRoot, lockfile)]: '' })).toEqual({
        cwd: repoRoot,
        command,
        args,
      })
    })

    it('prefers the nearest lockfile', () => {
      expect(
        install({
          [join(repoRoot, 'pnpm-lock.yaml')]: '',
          [join(app, 'package-lock.json')]: '',
        })
      ).toEqual({ cwd: app, command: 'npm', args: ['ci'] })
    })

    it.each([
      [{ '.yarnrc.yml': '' }],
      [{ 'package.json': JSON.stringify({ packageManager: 'yarn@4.5.0' }) }],
    ])('uses immutable installs for Yarn Berry %j', (extra) => {
      const files: Record<string, string> = {
        [join(repoRoot, 'yarn.lock')]: '',
      }
      for (const [name, value] of Object.entries(extra)) {
        files[join(repoRoot, name)] = value
      }
      expect(install(files).args).toEqual(['install', '--immutable'])
    })

    it('falls back to npm install', () => {
      expect(install({})).toEqual({
        cwd: app,
        command: 'npm',
        args: ['install'],
      })
    })
  })

  describe('getAgentInvocation', () => {
    const env = {
      PATH: '/bin',
      HOME: '/home/runner',
      NEXT_TELEMETRY_DISABLED: '1',
      GITHUB_TOKEN: 'ghs_secret',
      GH_TOKEN: 'ghs_secret',
      NEXT_UPGRADE_API_KEY: 'sk-secret',
      NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_secret',
      ACTIONS_RUNTIME_TOKEN: 'runtime',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc',
      INPUT_GITHUB_TOKEN: 'ghs_secret',
      OPENAI_API_KEY: 'other',
      GITHUB_ENV: '/runner/set_env',
      GITHUB_PATH: '/runner/add_path',
      GITHUB_OUTPUT: '/runner/set_output',
      GITHUB_STATE: '/runner/save_state',
    }
    const invoke = (
      agent: string,
      model: string | null,
      effort: string | null
    ) =>
      lib.getAgentInvocation({
        agent,
        apiKey: 'sk-key',
        model,
        effort,
        runId: UUID,
        codexHome: '/tmp/codex-home',
        env,
        prompt: 'Upgrade prompt',
      })

    it('runs Claude Code unattended', () => {
      const { command, args, env: agentEnv } = invoke('claude', 'opus', 'max')
      expect(command).toBe('claude')
      expect(args).toEqual([
        '-p',
        '--permission-mode',
        'bypassPermissions',
        '--model',
        'opus',
        '--effort',
        'max',
        'Upgrade prompt',
      ])
      expect(agentEnv).toEqual({
        PATH: '/bin',
        HOME: '/home/runner',
        NEXT_TELEMETRY_DISABLED: '1',
        ANTHROPIC_API_KEY: 'sk-key',
        __NEXT_AGENT_UPGRADE_ORIGIN: 'github_action',
        __NEXT_AGENT_UPGRADE_CI_RUN_ID: UUID,
      })
    })

    it('runs Codex unattended with a temporary home', () => {
      const {
        command,
        args,
        env: agentEnv,
      } = invoke('codex', 'gpt-5.6-terra', 'high')
      expect(command).toBe('codex')
      expect(args).toEqual([
        'exec',
        '--dangerously-bypass-approvals-and-sandbox',
        '--model',
        'gpt-5.6-terra',
        '-c',
        'model_reasoning_effort=high',
        'Upgrade prompt',
      ])
      expect(agentEnv).toEqual({
        PATH: '/bin',
        HOME: '/home/runner',
        NEXT_TELEMETRY_DISABLED: '1',
        CODEX_API_KEY: 'sk-key',
        CODEX_HOME: '/tmp/codex-home',
        __NEXT_AGENT_UPGRADE_ORIGIN: 'github_action',
        __NEXT_AGENT_UPGRADE_CI_RUN_ID: UUID,
      })
    })

    it('omits default model and effort', () => {
      expect(invoke('claude', null, null).args).toEqual([
        '-p',
        '--permission-mode',
        'bypassPermissions',
        'Upgrade prompt',
      ])
      expect(invoke('codex', null, null).args).toEqual([
        'exec',
        '--dangerously-bypass-approvals-and-sandbox',
        'Upgrade prompt',
      ])
    })
  })

  it('tells the agent to run the CLI and report without GitHub access', () => {
    const prompt = lib.buildAgentPrompt({
      directory: 'apps/web',
      policy: 'latest',
      nextVersion: 'canary',
      resultFile: '/tmp/result.json',
      branchPrefix: SCOPE.branchPrefix,
    })
    expect(prompt).toContain(
      "`npx --yes next@canary upgrade 'apps/web' --agent=latest`"
    )
    expect(prompt).toContain('You have no GitHub credentials.')
    expect(prompt).toContain('Do not push, open pull requests')
    expect(prompt).toContain(`\`${SCOPE.branchPrefix}latest-<target version>\``)
    expect(prompt).toContain('"/tmp/result.json"')
  })

  it('shell-quotes the app directory in the CLI command', () => {
    const prompt = lib.buildAgentPrompt({
      directory: "apps/it's $(web)",
      policy: 'security',
      nextVersion: 'canary',
      resultFile: '/tmp/result.json',
      branchPrefix: SCOPE.branchPrefix,
    })
    expect(prompt).toContain(
      "`npx --yes next@canary upgrade 'apps/it'\\''s $(web)' --agent=security`"
    )
  })

  describe('parseResult', () => {
    const success = {
      status: 'success',
      branch: BRANCH,
      title: 'Upgrade Next.js to 16.3.5',
      body: `Upgrades Next.js.\n\n${MARKER}`,
    }

    it('accepts a valid success result', () => {
      expect(lib.parseResult(JSON.stringify(success))).toEqual({
        error: null,
        ...success,
        marker: MARKER,
      })
    })

    it.each(['no_update', 'failure'])('accepts %s', (status) => {
      expect(lib.parseResult(JSON.stringify({ status }))).toEqual({
        error: null,
        status,
      })
    })

    it.each([
      ['not json', 'not valid JSON'],
      ['[]', 'must be a JSON object'],
      ['{"status":"done"}', 'unknown status'],
      ['{"status":"duplicate"}', 'unknown status'],
      [JSON.stringify({ ...success, branch: 'main' }), 'must start with'],
      [
        JSON.stringify({ ...success, branch: 'next-upgrade/$(whoami)' }),
        'must start with',
      ],
      [JSON.stringify({ ...success, title: 'a\nb' }), 'title is invalid'],
      [
        JSON.stringify({ ...success, title: 'x'.repeat(257) }),
        'title is invalid',
      ],
      [
        JSON.stringify({ ...success, body: `${MARKER}${'x'.repeat(60000)}` }),
        'body is invalid',
      ],
      [
        JSON.stringify({ ...success, body: 'No marker' }),
        'missing the next-upgrade marker',
      ],
    ])('rejects %s', (text, error) => {
      expect(lib.parseResult(text).error).toContain(error)
    })
  })

  describe('Action ownership', () => {
    const owned = {
      number: 7,
      isCrossRepository: false,
      headRepository: { nameWithOwner: 'acme/app' },
      headRefName: BRANCH,
      headRefOid: 'a'.repeat(40),
      baseRefName: 'main',
      body: SCOPE.marker,
    }

    it('ignores copied fork markers and unrelated app branches', () => {
      expect(
        lib.getOwnedPullRequests(
          [
            { ...owned, isCrossRepository: true },
            { ...owned, headRepository: { nameWithOwner: 'fork/app' } },
            { ...owned, headRefName: 'manual-upgrade' },
            {
              ...owned,
              headRefName: `${lib.getUpgradeScope('acme/app', 'main', 'apps/web').branchPrefix}security-16.3.5`,
            },
            owned,
          ],
          SCOPE
        )
      ).toEqual([owned])
    })

    it.each([
      { baseRefName: 'release' },
      { body: MARKER },
      { headRefOid: 'invalid' },
    ])('refuses inconsistent owned metadata %j', (changes) => {
      expect(() =>
        lib.getOwnedPullRequests([{ ...owned, ...changes }], SCOPE)
      ).toThrow('inconsistent delivery metadata')
    })

    it('separates repository, source branch and app identity', () => {
      const prefixes = [
        SCOPE,
        lib.getUpgradeScope('acme/other', 'main', '.'),
        lib.getUpgradeScope('acme/app', 'release', '.'),
        lib.getUpgradeScope('acme/app', 'main', 'apps/web'),
      ].map((scope) => scope.branchPrefix)
      expect(new Set(prefixes).size).toBe(4)
    })
  })

  it('flags Git config that could redirect or hook the push', () => {
    expect(
      lib.findUnsafeGitConfig([
        'core.bare',
        'remote.origin.url',
        'user.name',
        'url.https://evil.example/.insteadOf',
        'url.https://evil.example/.pushInsteadOf',
        'include.path',
        'includeIf.gitdir:/x/.path',
        'core.hooksPath',
        'core.fsmonitor',
        'core.sshCommand',
        'credential.helper',
        'http.https://github.com/.extraheader',
        'http.proxy',
      ])
    ).toEqual([
      'url.https://evil.example/.insteadOf',
      'url.https://evil.example/.pushInsteadOf',
      'include.path',
      'includeIf.gitdir:/x/.path',
      'core.hooksPath',
      'core.fsmonitor',
      'core.sshCommand',
      'credential.helper',
      'http.https://github.com/.extraheader',
      'http.proxy',
    ])
  })

  it('passes the push token through Git config env vars', () => {
    const env = lib.getDeliveryGitEnv(
      { PATH: '/bin' },
      {
        serverUrl: 'https://github.com',
        token: 'ghs_token',
        emptyHooksPath: '/tmp/hooks',
      }
    )
    expect(env).toEqual({
      PATH: '/bin',
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_COUNT: '4',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/tmp/hooks',
      GIT_CONFIG_KEY_1: 'core.fsmonitor',
      GIT_CONFIG_VALUE_1: 'false',
      GIT_CONFIG_KEY_2: 'credential.helper',
      GIT_CONFIG_VALUE_2: '',
      GIT_CONFIG_KEY_3: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_3: `AUTHORIZATION: basic ${Buffer.from('x-access-token:ghs_token').toString('base64')}`,
    })
    expect(lib.getAuthorizationHeader('ghs_token')).toBe(
      `basic ${Buffer.from('x-access-token:ghs_token').toString('base64')}`
    )
    expect(lib.getSafeGitEnv({}, '/tmp/hooks')).toEqual({
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/tmp/hooks',
      GIT_CONFIG_KEY_1: 'core.fsmonitor',
      GIT_CONFIG_VALUE_1: 'false',
      GIT_CONFIG_KEY_2: 'credential.helper',
      GIT_CONFIG_VALUE_2: '',
    })
  })

  describe('reporting', () => {
    it.each([
      [{ stage: 'install' }, ['result', UUID, 'failure', 'install']],
      [{ stage: 'agent' }, ['result', UUID, 'failure', 'agent']],
      [{ stage: 'result_file' }, ['result', UUID, 'failure', 'result_file']],
      [{ stage: 'delivery' }, ['result', UUID, 'failure', 'delivery']],
      [{ stage: undefined }, ['result', UUID, 'failure', 'validation']],
      [
        {
          stage: 'delivery',
          outcome: { result: 'pr_opened', failureStage: null },
        },
        ['result', UUID, 'pr_opened'],
      ],
      [
        {
          stage: 'result_file',
          outcome: { result: 'no_update', failureStage: null },
        },
        ['result', UUID, 'no_update'],
      ],
    ])('maps state %j to %j', (state, args) => {
      expect(lib.getReportArgs('result', { runId: UUID, ...state })).toEqual(
        args
      )
    })

    it('reports invalid start inputs as empty values', () => {
      expect(
        lib.getReportArgs('started', {
          runId: UUID,
          agent: 'x',
          policy: 'latest',
        })
      ).toEqual(['started', UUID, '', 'latest'])
    })
  })
})

// Drives run.js end to end against a real Git repository with fake gh and npx.
// The fakes are POSIX executables with a shebang, which Windows cannot run.
// @force-gate !windows
describe('next upgrade GitHub Action steps', () => {
  let root: string
  let repo: string
  let remote: string
  let bin: string
  let runnerTemp: string
  let log: string

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: join(root, 'gitconfig') },
    }).trim()

  function step(command: string, env: Record<string, string> = {}) {
    return spawnSync(
      process.execPath,
      [join(actionDirectory, 'run.js'), command],
      {
        cwd: repo,
        encoding: 'utf8',
        env: {
          NODE_ENV: 'test',
          PATH: `${bin}:${process.env.PATH}`,
          HOME: root,
          RUNNER_TEMP: runnerTemp,
          GITHUB_WORKSPACE: repo,
          GITHUB_REPOSITORY: 'acme/app',
          GITHUB_REF: 'refs/heads/main',
          GITHUB_SERVER_URL: `file://${root}`,
          GIT_CONFIG_GLOBAL: join(root, 'gitconfig'),
          NEXT_UPGRADE_AGENT: 'claude',
          NEXT_UPGRADE_POLICY: 'security',
          NEXT_UPGRADE_DIRECTORY: '.',
          NEXT_UPGRADE_NEXT_VERSION: '16.5.0',
          NEXT_UPGRADE_API_KEY: 'sk-key',
          ...env,
        },
      }
    )
  }

  function calls(name: string): string[][] {
    try {
      return readFileSync(log, 'utf8')
        .split('\n')
        .filter((line) => line.startsWith(`${name} `))
        .map((line) => JSON.parse(line.slice(name.length + 1)))
    } catch {
      return []
    }
  }

  function writeResult(value: unknown) {
    writeFileSync(
      join(runnerTemp, 'next-upgrade', 'result.json'),
      JSON.stringify(value)
    )
  }

  function commitUpgrade() {
    const branch = BRANCH
    git(repo, 'switch', '-q', '-c', branch)
    writeFileSync(
      join(repo, 'package.json'),
      '{"dependencies":{"next":"16.3.5"}}'
    )
    git(repo, 'commit', '-qam', 'Upgrade Next.js')
  }

  function writeUpgradeResult(branch: string) {
    writeResult({
      status: 'success',
      branch,
      title: 'Upgrade Next.js',
      body: MARKER,
    })
  }

  function ownedPull() {
    return {
      number: 7,
      url: 'https://github.com/acme/app/pull/7',
      state: 'OPEN',
      body: `${MARKER}\n${SCOPE.marker}`,
      isCrossRepository: false,
      headRepository: { nameWithOwner: 'acme/app' },
      headRefName: BRANCH,
      headRefOid: git(repo, 'rev-parse', BRANCH),
      baseRefName: 'main',
    }
  }

  // Use this test's Node runtime so PATH does not select another interpreter.
  function fakeBinary(name: string, script: string) {
    const file = join(bin, name)
    writeFileSync(
      file,
      `#!${process.execPath}\nrequire('fs').appendFileSync(${JSON.stringify(log)}, ${JSON.stringify(name)} + ' ' + JSON.stringify(process.argv.slice(2)) + '\\n')\n${script}`
    )
    chmodSync(file, 0o755)
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'next-upgrade-action-'))
    repo = join(root, 'repo')
    remote = join(root, 'acme', 'app.git')
    bin = join(root, 'bin')
    runnerTemp = join(root, 'temp')
    log = join(root, 'calls.log')
    for (const directory of [repo, bin, runnerTemp, join(root, 'acme')]) {
      mkdirSync(directory, { recursive: true })
    }
    writeFileSync(
      join(root, 'gitconfig'),
      '[user]\n\tname = Test\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n'
    )
    git(root, 'init', '-q', '--bare', remote)
    git(repo, 'init', '-q', '-b', 'main')
    writeFileSync(
      join(repo, 'package.json'),
      '{"dependencies":{"next":"14.1.1"}}'
    )
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'init')
    fakeBinary('npx', '')
    fakeBinary(
      'gh',
      `const args = process.argv.slice(2)
if (args[0] === 'repo') console.log('main')
else if (args[0] === 'pr' && args[1] === 'list') console.log(process.env.FAKE_PULLS || '[]')
else if (args[0] === 'pr' && args[1] === 'view') {
  const pull = JSON.parse(process.env.FAKE_PULLS || '[]').find(pull => String(pull.number) === args[2])
  console.log(JSON.stringify({ ...pull, ...JSON.parse(process.env.FAKE_PULL_CHANGES || '{}') }))
}
else if (args[0] === 'pr' && args[1] === 'create') {
  if (process.env.FAKE_CREATE_FAILURE) process.exit(1)
  console.log('https://github.com/acme/app/pull/1')
}
if (!process.env.GH_TOKEN) process.exit(1)`
    )
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('reports the start and an early validation failure', () => {
    expect(step('prepare', { NEXT_UPGRADE_AGENT: 'copilot' }).status).toBe(0)
    expect(step('report-started').status).toBe(0)
    const validation = step('validate')
    expect(validation.status).toBe(1)
    expect(validation.stdout).toContain('::error::Unsupported agent "copilot"')
    expect(step('report-result').status).toBe(0)

    const [started, result] = calls('npx')
    const runId = started[5]
    expect(started).toEqual([
      '--yes',
      'next@16.5.0',
      'internal',
      'report-agent-upgrade-action',
      'started',
      runId,
      '',
      'security',
    ])
    expect(runId).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.slice(4)).toEqual(['result', runId, 'failure', 'validation'])

    expect(step('cleanup').status).toBe(0)
    expect(() =>
      readFileSync(join(runnerTemp, 'next-upgrade', 'state.json'))
    ).toThrow()
  })

  it('pushes the agent branch and opens a draft pull request', () => {
    step('prepare')
    commitUpgrade()
    // Hooks planted by the agent must not run while delivery holds the token.
    const hookMarker = join(root, 'hook-ran')
    for (const hook of ['pre-push', 'reference-transaction', 'post-checkout']) {
      const file = join(repo, '.git', 'hooks', hook)
      writeFileSync(file, `#!/bin/sh\ntouch ${JSON.stringify(hookMarker)}\n`)
      chmodSync(file, 0o755)
    }
    writeResult({
      status: 'success',
      branch: BRANCH,
      title: 'Upgrade Next.js to 16.3.5',
      body: `Upgrade.\n\n${MARKER}`,
    })

    const delivery = step('deliver', { NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token' })
    expect(delivery.stdout).toContain(
      '::notice::Opened draft pull request https://github.com/acme/app/pull/1'
    )
    expect(delivery.status).toBe(0)
    expect(existsSync(hookMarker)).toBe(false)
    expect(delivery.stdout).toContain(
      `::add-mask::basic ${Buffer.from('x-access-token:ghs_token').toString('base64')}`
    )
    expect(git(remote, 'rev-parse', `refs/heads/${BRANCH}`)).toBe(
      git(repo, 'rev-parse', BRANCH)
    )
    const create = calls('gh').find((args) => args[1] === 'create')!
    expect(create.slice(0, 10)).toEqual([
      'pr',
      'create',
      '--draft',
      '--base',
      'main',
      '--head',
      BRANCH,
      '--title',
      'Upgrade Next.js to 16.3.5',
      '--body-file',
    ])

    step('report-result')
    expect(
      calls('npx')[0].slice(4, 5).concat(calls('npx')[0].slice(6))
    ).toEqual(['result', 'pr_opened'])
  })

  it('recognizes an owned pull request with the verified committed tree', () => {
    step('prepare')
    commitUpgrade()
    writeResult({
      status: 'success',
      branch: BRANCH,
      title: 'Upgrade Next.js',
      body: MARKER,
    })

    git(repo, 'push', '-q', remote, BRANCH)
    const existingPull = ownedPull()
    git(repo, 'commit', '--amend', '-qm', 'Same verified files, new commit')
    const delivery = step('deliver', {
      NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token',
      FAKE_PULLS: JSON.stringify([existingPull]),
    })
    expect(delivery.status).toBe(0)
    expect(delivery.stdout).toContain('https://github.com/acme/app/pull/7')
    expect(calls('gh').map((args) => args[1])).toEqual(['list', 'view'])
    step('report-result')
    expect(calls('npx')[0].slice(6)).toEqual(['duplicate_pr'])
  })

  it.each([
    { state: 'CLOSED' },
    { state: 'MERGED' },
    { baseRefName: 'release' },
    { headRepository: { nameWithOwner: 'fork/app' } },
    { headRefName: `${SCOPE.branchPrefix}another-upgrade` },
    { headRefOid: 'a'.repeat(40) },
    { body: MARKER },
  ])('refuses a duplicate PR that changes during delivery: %j', (changes) => {
    step('prepare')
    commitUpgrade()
    git(repo, 'push', '-q', remote, BRANCH)
    const existingPull = ownedPull()
    writeUpgradeResult(BRANCH)

    const delivery = step('deliver', {
      NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token',
      FAKE_PULLS: JSON.stringify([existingPull]),
      FAKE_PULL_CHANGES: JSON.stringify(changes),
    })
    expect(delivery.status).toBe(1)
    expect(`${delivery.stdout}${delivery.stderr}`).toContain('pull request')
    expect(calls('gh').some((args) => args[1] === 'create')).toBe(false)
    expect(git(remote, 'rev-parse', BRANCH)).toBe(existingPull.headRefOid)
  })

  it('preserves a branch created after the remote absence check', () => {
    step('prepare')
    const sourceHead = git(repo, 'rev-parse', 'HEAD')
    commitUpgrade()
    writeUpgradeResult(BRANCH)
    git(repo, 'push', '-q', remote, 'main')

    // Simulate another run creating an ancestor ref while ls-remote reports
    // its earlier empty result. Delivery must reject even a fast-forward.
    const realGit = execFileSync('which', ['git'], {
      encoding: 'utf8',
    }).trim()
    fakeBinary(
      'git',
      `const { execFileSync, spawnSync } = require('child_process')
const args = process.argv.slice(2)
if (args[0] === 'ls-remote') {
  execFileSync(${JSON.stringify(realGit)}, ['--git-dir', ${JSON.stringify(remote)}, 'update-ref', ${JSON.stringify(`refs/heads/${BRANCH}`)}, ${JSON.stringify(sourceHead)}])
  process.exit(0)
}
const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit', env: process.env })
process.exit(result.status === null ? 1 : result.status)`
    )

    const delivery = step('deliver', { NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token' })
    expect(delivery.status).toBe(1)
    expect(delivery.stdout).toContain('Could not push the upgrade branch.')
    expect(git(remote, 'rev-parse', BRANCH)).toBe(sourceHead)
    expect(calls('gh').some((args) => args[1] === 'create')).toBe(false)
  })

  it.each([
    [{ status: 'no_update' }, 0, ['no_update']],
    [{ status: 'duplicate' }, 1, ['failure', 'result_file']],
    [{ status: 'failure' }, 1, ['failure', 'agent']],
    ['not json', 1, ['failure', 'result_file']],
  ])('maps agent result %j', (value, status, reported) => {
    step('prepare')
    if (typeof value === 'string') {
      writeFileSync(join(runnerTemp, 'next-upgrade', 'result.json'), value)
    } else {
      writeResult(value)
    }
    expect(
      step('deliver', { NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token' }).status
    ).toBe(status)
    step('report-result')
    expect(calls('npx')[0].slice(6)).toEqual(reported)
    expect(calls('gh')).toEqual([])
  })

  it('fails without a result file', () => {
    step('prepare')
    expect(step('deliver').status).toBe(1)
    step('report-result')
    expect(calls('npx')[0].slice(6)).toEqual(['failure', 'result_file'])
  })

  it.each([
    ['the branch is missing', () => {}, 'The agent branch does not exist.'],
    [
      'the branch has no new commits',
      () => git(repo, 'branch', BRANCH),
      'The agent branch has no new commits.',
    ],
    [
      'the branch is not based on the checkout',
      () => {
        git(repo, 'switch', '-q', '--orphan', BRANCH)
        writeFileSync(join(repo, 'other'), '')
        git(repo, 'add', 'other')
        git(repo, 'commit', '-qm', 'orphan')
      },
      'The agent branch is not based on the checked out commit.',
    ],
    [
      'the agent redirected the remote',
      () => {
        commitUpgrade()
        git(repo, 'config', 'url.https://evil.example/.insteadOf', 'file://')
      },
      'Refusing to push with agent-modified Git config',
    ],
    [
      'the remote branch contains different files',
      () => {
        commitUpgrade()
        git(repo, 'push', '-q', remote, BRANCH)
        writeFileSync(join(repo, 'repair'), 'verified repair')
        git(repo, 'add', '.')
        git(repo, 'commit', '-qm', 'Repair')
      },
      'contains different work or source history',
    ],
  ])('refuses delivery when %s', (_name, setup, error) => {
    step('prepare')
    setup()
    writeResult({
      status: 'success',
      branch: BRANCH,
      title: 'Upgrade Next.js',
      body: MARKER,
    })

    const delivery = step('deliver', { NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token' })
    expect(delivery.status).toBe(1)
    expect(delivery.stdout).toContain(error)
    expect(calls('gh').some((args) => args[1] === 'create')).toBe(false)
    step('report-result')
    expect(calls('npx')[0].slice(6)).toEqual(['failure', 'delivery'])
  })

  it.each([
    [
      'an uncommitted tracked repair',
      () =>
        writeFileSync(
          join(repo, 'package.json'),
          '{"dependencies":{"next":"16.3.6"}}'
        ),
      'Commit all',
    ],
    [
      'an untracked repair',
      () => writeFileSync(join(repo, 'repair.js'), 'export {}'),
      'Commit all',
    ],
    [
      'a different checkout',
      () => git(repo, 'switch', '-q', 'main'),
      'Leave the verified',
    ],
  ])('refuses %s', (_name, mutate, message) => {
    step('prepare')
    commitUpgrade()
    mutate()
    writeUpgradeResult(BRANCH)
    const delivery = step('deliver', { NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token' })
    expect(delivery.status).toBe(1)
    expect(delivery.stdout).toContain(message)
    expect(git(remote, 'branch', '--list')).toBe('')
  })

  it('refuses an empty tree diff', () => {
    step('prepare')
    git(repo, 'switch', '-q', '-c', BRANCH)
    git(repo, 'commit', '--allow-empty', '-qm', 'Empty')
    writeUpgradeResult(BRANCH)
    const delivery = step('deliver', { NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token' })
    expect(delivery.status).toBe(1)
    expect(delivery.stdout).toContain('no changed files')
    expect(git(remote, 'branch', '--list')).toBe('')
  })

  it.each([false, true])(
    'recovers failed PR creation with a fresh job: %s',
    (freshJob) => {
      const sourceHead = git(repo, 'rev-parse', 'HEAD')
      step('prepare')
      commitUpgrade()
      writeUpgradeResult(BRANCH)
      expect(
        step('deliver', {
          NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token',
          FAKE_CREATE_FAILURE: '1',
        }).status
      ).toBe(1)
      const pushedHead = git(remote, 'rev-parse', BRANCH)
      if (freshJob) {
        git(repo, 'switch', '-q', 'main')
        git(repo, 'branch', '-D', BRANCH)
        expect(git(repo, 'rev-parse', 'HEAD')).toBe(sourceHead)
        step('prepare')
        commitUpgrade()
        git(repo, 'commit', '--amend', '-qm', 'Fresh job, same verified files')
        expect(git(repo, 'rev-parse', 'HEAD') === pushedHead).toBe(false)
        writeUpgradeResult(BRANCH)
      }
      expect(
        step('deliver', { NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token' }).status
      ).toBe(0)
      expect(git(remote, 'rev-parse', BRANCH)).toBe(pushedHead)
      expect(calls('gh').filter((args) => args[1] === 'create')).toHaveLength(2)
    }
  )

  it('uses the checked-out release branch as the PR base', () => {
    git(repo, 'switch', '-q', '-c', 'release')
    writeFileSync(join(repo, 'release-only'), 'release content')
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'Release change')
    step('prepare', { GITHUB_REF: 'refs/heads/release' })
    const branch = `${lib.getUpgradeScope('acme/app', 'release', '.').branchPrefix}security-16.3.5`
    git(repo, 'switch', '-q', '-c', branch)
    writeFileSync(
      join(repo, 'package.json'),
      '{"dependencies":{"next":"16.3.5"}}'
    )
    git(repo, 'commit', '-qam', 'Upgrade')
    writeUpgradeResult(branch)
    expect(
      step('deliver', { NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token' }).status
    ).toBe(0)
    expect(
      calls('gh')
        .find((args) => args[1] === 'create')!
        .slice(2, 5)
    ).toEqual(['--draft', '--base', 'release'])
  })

  it.each(['refs/tags/v1', 'refs/heads/other'])(
    'rejects unsupported source %s before the agent',
    (ref) => {
      step('prepare', { GITHUB_REF: ref })
      const validation = step('validate')
      expect(validation.status).toBe(1)
      expect(validation.stdout).toContain('Check out the source branch')
      expect(calls('claude')).toEqual([])
    }
  )

  it('does not accept a copied fork marker as a duplicate', () => {
    step('prepare')
    commitUpgrade()
    writeUpgradeResult(BRANCH)
    expect(
      step('deliver', {
        NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token',
        FAKE_PULLS: JSON.stringify([
          {
            ...ownedPull(),
            isCrossRepository: true,
            headRepository: { nameWithOwner: 'fork/app' },
          },
        ]),
      }).status
    ).toBe(0)
    expect(calls('gh').some((args) => args[1] === 'create')).toBe(true)
  })

  it('does not accept an owned PR with stale files as a duplicate', () => {
    step('prepare')
    commitUpgrade()
    git(repo, 'push', '-q', remote, BRANCH)
    const stalePull = ownedPull()
    writeFileSync(join(repo, 'repair'), 'new verified content')
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'Verified repair')
    writeUpgradeResult(BRANCH)
    const delivery = step('deliver', {
      NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token',
      FAKE_PULLS: JSON.stringify([stalePull]),
    })
    expect(delivery.status).toBe(1)
    expect(delivery.stdout).toContain(
      'contains different work or source history'
    )
    expect(calls('gh').some((args) => args[1] === 'create')).toBe(false)
  })

  it('refuses an equal remote tree with incompatible source history', () => {
    step('prepare')
    commitUpgrade()
    const manifest = readFileSync(join(repo, 'package.json'), 'utf8')
    git(repo, 'switch', '-q', '--orphan', 'unrelated')
    writeFileSync(join(repo, 'package.json'), manifest)
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'Unrelated source')
    git(repo, 'push', '-q', remote, `HEAD:refs/heads/${BRANCH}`)
    git(repo, 'switch', '-q', BRANCH)
    writeUpgradeResult(BRANCH)
    const delivery = step('deliver', { NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token' })
    expect(delivery.status).toBe(1)
    expect(delivery.stdout).toContain('different work or source history')
    expect(calls('gh').some((args) => args[1] === 'create')).toBe(false)
  })

  it('refuses multiple owned PRs containing the verified tree', () => {
    step('prepare')
    commitUpgrade()
    const secondBranch = `${SCOPE.branchPrefix}security-16.3.5-retry`
    git(repo, 'branch', secondBranch)
    git(repo, 'push', '-q', remote, BRANCH, secondBranch)
    writeUpgradeResult(BRANCH)
    const delivery = step('deliver', {
      NEXT_UPGRADE_GITHUB_TOKEN: 'ghs_token',
      FAKE_PULLS: JSON.stringify([
        ownedPull(),
        { ...ownedPull(), number: 8, headRefName: secondBranch },
      ]),
    })
    expect(delivery.status).toBe(1)
    expect(delivery.stdout).toContain('More than one Action-owned pull request')
    expect(calls('gh').some((args) => args[1] === 'create')).toBe(false)
  })

  it('removes checkout credentials before running the agent without GitHub tokens', () => {
    git(
      repo,
      'config',
      'http.https://github.com/.extraheader',
      'AUTHORIZATION: basic secret'
    )
    fakeBinary(
      'claude',
      `require('fs').writeFileSync(${JSON.stringify(join(root, 'agent-env.json'))}, JSON.stringify(process.env))`
    )
    step('prepare')

    const agent = step('agent', {
      GITHUB_TOKEN: 'ghs_secret',
      ACTIONS_RUNTIME_TOKEN: 'runtime',
    })
    expect(agent.status).toBe(0)
    expect(agent.stdout).toContain(
      'Removed http.https://github.com/.extraheader'
    )
    expect(
      spawnSync(
        'git',
        ['config', '--local', '--get', 'http.https://github.com/.extraheader'],
        {
          cwd: repo,
        }
      ).status
    ).toBe(1)

    const agentEnv = JSON.parse(
      readFileSync(join(root, 'agent-env.json'), 'utf8')
    )
    expect(agentEnv.GITHUB_TOKEN).toBeUndefined()
    expect(agentEnv.ACTIONS_RUNTIME_TOKEN).toBeUndefined()
    expect(agentEnv.NEXT_UPGRADE_API_KEY).toBeUndefined()
    expect(agentEnv.ANTHROPIC_API_KEY).toBe('sk-key')
    expect(agentEnv.__NEXT_AGENT_UPGRADE_ORIGIN).toBe('github_action')
    expect(agentEnv.__NEXT_AGENT_UPGRADE_CI_RUN_ID).toMatch(/^[0-9a-f-]{36}$/)
    const [args] = calls('claude')
    expect(args.slice(0, 3)).toEqual([
      '-p',
      '--permission-mode',
      'bypassPermissions',
    ])
  })

  it('reports an agent failure', () => {
    fakeBinary('claude', 'process.exit(3)')
    step('prepare')
    const agent = step('agent')
    expect(agent.status).toBe(1)
    expect(agent.stdout).toContain('The coding agent exited with code 3.')
    step('report-result')
    expect(calls('npx')[0].slice(6)).toEqual(['failure', 'agent'])
  })
})
