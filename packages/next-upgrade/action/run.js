#!/usr/bin/env node
// Steps of the Next.js upgrade GitHub Action. Inputs arrive through env vars set
// in action.yml; nothing is interpolated into a shell.

const { spawnSync } = require('child_process')
const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')

const lib = require('./lib')

const runDirectory = path.join(
  process.env.RUNNER_TEMP || require('os').tmpdir(),
  'next-upgrade'
)
const statePath = path.join(runDirectory, 'state.json')
const resultFile = path.join(runDirectory, 'result.json')

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'))
  } catch {
    return null
  }
}

function writeState(state) {
  fs.mkdirSync(runDirectory, { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
}

function updateState(changes) {
  const state = { ...readState(), ...changes }
  writeState(state)
  return state
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  return result.status ?? 1
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
  return {
    status: result.error ? 1 : (result.status ?? 1),
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  }
}

function fail(message) {
  console.log(`::error::${message.replace(/\r?\n/g, ' ')}`)
  process.exit(1)
}

function notice(message) {
  console.log(`::notice::${message.replace(/\r?\n/g, ' ')}`)
}

function prepare() {
  const env = process.env
  const workspace = env.GITHUB_WORKSPACE || process.cwd()
  const toplevel = capture('git', ['rev-parse', '--show-toplevel'], {
    cwd: workspace,
  })
  const repoRoot = fs.realpathSync(
    toplevel.status === 0 ? toplevel.stdout : workspace
  )
  const head = capture('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })
  const checkoutBranch = capture(
    'git',
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    { cwd: repoRoot }
  )
  const sourceRef = env.GITHUB_REF
  let baseBranch = checkoutBranch.status === 0 ? checkoutBranch.stdout : null
  if (sourceRef) {
    baseBranch = sourceRef.startsWith('refs/heads/')
      ? sourceRef.slice('refs/heads/'.length)
      : null
  }
  // Pin delivery to the branch and commit that this trusted event checked out.
  const sourceError =
    !env.GITHUB_REPOSITORY ||
    !baseBranch ||
    baseBranch.startsWith(lib.BRANCH_PREFIX) ||
    (checkoutBranch.status === 0 && checkoutBranch.stdout !== baseBranch) ||
    (env.GITHUB_SHA && env.GITHUB_SHA !== head.stdout) ||
    capture('git', ['check-ref-format', '--branch', baseBranch], {
      cwd: repoRoot,
    }).status !== 0
      ? 'Check out the source branch for this workflow; tags and ambiguous checkouts are unsupported.'
      : null
  const validation = lib.validateInputs(
    {
      agent: env.NEXT_UPGRADE_AGENT,
      policy: env.NEXT_UPGRADE_POLICY,
      hasApiKey: Boolean(env.NEXT_UPGRADE_API_KEY),
      directory: env.NEXT_UPGRADE_DIRECTORY,
      repoRoot,
    },
    (directory) => {
      try {
        return fs.statSync(directory).isDirectory()
      } catch {
        return false
      }
    },
    (directory) => fs.realpathSync(directory)
  )

  fs.rmSync(runDirectory, { recursive: true, force: true })
  writeState({
    runId: randomUUID(),
    stage: 'validation',
    agent: env.NEXT_UPGRADE_AGENT,
    policy: env.NEXT_UPGRADE_POLICY,
    nextVersion: env.NEXT_UPGRADE_NEXT_VERSION || 'canary',
    repoRoot,
    appDirectory: validation.appDirectory ?? null,
    directory: validation.directory ?? null,
    initialHead: head.status === 0 ? head.stdout : null,
    scope:
      sourceError || validation.error
        ? null
        : lib.getUpgradeScope(
            env.GITHUB_REPOSITORY,
            baseBranch,
            validation.directory
          ),
    validationError:
      validation.error ??
      sourceError ??
      (head.status === 0 ? null : 'The repository has no checked out commit.'),
  })
}

function validate() {
  const state = readState()
  if (!state) {
    fail('The upgrade run was not prepared.')
  }
  if (state.validationError) {
    fail(state.validationError)
  }
}

function installDependencies() {
  const state = updateState({ stage: 'install' })
  const install = lib.getInstallCommand(
    state.appDirectory,
    state.repoRoot,
    (file) => fs.existsSync(file),
    (file) => fs.readFileSync(file, 'utf8')
  )
  // pnpm and Yarn come from Corepack, which newer Node.js releases no longer bundle.
  if (install.command === 'pnpm' || install.command === 'yarn') {
    if (
      capture('corepack', ['--version']).status !== 0 &&
      run('npm', ['install', '--global', 'corepack'])
    ) {
      fail('Could not install Corepack.')
    }
    if (run('corepack', ['enable'])) {
      fail('Could not enable Corepack.')
    }
  }
  if (install.command === 'bun' && capture('bun', ['--version']).status) {
    if (run('npm', ['install', '--global', 'bun'])) {
      fail('Could not install Bun.')
    }
  }
  console.log(
    `Installing dependencies with ${install.command} in ${install.cwd}`
  )
  if (run(install.command, install.args, { cwd: install.cwd })) {
    fail('Could not install the app dependencies.')
  }
}

function installAgent() {
  const state = updateState({ stage: 'install' })
  const pkg =
    state.agent === 'codex' ? '@openai/codex' : '@anthropic-ai/claude-code'
  if (run('npm', ['install', '--global', pkg])) {
    fail(`Could not install ${pkg}.`)
  }
}

function listLocalGitConfigKeys(repoRoot, env = process.env) {
  const result = capture(
    'git',
    ['config', '--local', '--name-only', '--list'],
    {
      cwd: repoRoot,
      env,
    }
  )
  return result.status === 0 ? result.stdout.split('\n').filter(Boolean) : []
}

function agent() {
  const state = updateState({ stage: 'agent' })

  // Remove checkout credentials and redirects so the agent cannot use them.
  for (const key of new Set(
    lib.findUnsafeGitConfig(listLocalGitConfigKeys(state.repoRoot))
  )) {
    capture('git', ['config', '--local', '--unset-all', key], {
      cwd: state.repoRoot,
    })
    notice(`Removed ${key} from the local Git config before running the agent.`)
  }

  run('git', ['config', 'user.name', 'github-actions[bot]'], {
    cwd: state.repoRoot,
  })
  run(
    'git',
    [
      'config',
      'user.email',
      '41898282+github-actions[bot]@users.noreply.github.com',
    ],
    { cwd: state.repoRoot }
  )

  const codexHome = path.join(runDirectory, 'codex-home')
  fs.mkdirSync(codexHome, { recursive: true })
  fs.rmSync(resultFile, { force: true })

  const invocation = lib.getAgentInvocation({
    agent: state.agent,
    apiKey: process.env.NEXT_UPGRADE_API_KEY,
    model: process.env.NEXT_UPGRADE_MODEL || null,
    effort: process.env.NEXT_UPGRADE_EFFORT || null,
    runId: state.runId,
    codexHome,
    env: process.env,
    prompt: lib.buildAgentPrompt({
      directory: state.directory,
      policy: state.policy,
      nextVersion: state.nextVersion,
      resultFile,
      branchPrefix: state.scope.branchPrefix,
    }),
  })

  const status = run(invocation.command, invocation.args, {
    cwd: state.repoRoot,
    env: invocation.env,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  fs.rmSync(codexHome, { recursive: true, force: true })
  if (status !== 0) {
    fail(`The coding agent exited with code ${status}.`)
  }
}

function deliver() {
  const state = updateState({ stage: 'result_file' })
  let text
  try {
    text = fs.readFileSync(resultFile, 'utf8')
  } catch {
    fail('The coding agent did not write a result.')
  }
  const result = lib.parseResult(text)
  if (result.error) {
    fail(result.error)
  }

  if (result.status === 'no_update') {
    updateState({ outcome: { result: 'no_update', failureStage: null } })
    notice('No Next.js upgrade is needed.')
    return
  }
  if (result.status === 'failure') {
    updateState({ stage: 'agent' })
    fail('The coding agent could not complete and verify the upgrade.')
  }

  updateState({ stage: 'delivery' })
  const { repoRoot, initialHead, scope } = state
  // Every Git command here runs without the token and with hooks and fsmonitor
  // disabled, because the agent controlled the repository until now.
  const emptyHooksPath = path.join(runDirectory, 'empty-hooks')
  fs.mkdirSync(emptyHooksPath, { recursive: true })
  const baseEnv = lib.sanitizeAgentEnv(process.env)
  delete baseEnv.NODE_OPTIONS
  const safeGitEnv = lib.getSafeGitEnv(baseEnv, emptyHooksPath)
  const git = (args) => capture('git', args, { cwd: repoRoot, env: safeGitEnv })

  const unsafeConfig = lib.findUnsafeGitConfig(
    listLocalGitConfigKeys(repoRoot, safeGitEnv)
  )
  if (unsafeConfig.length > 0) {
    fail(
      `Refusing to push with agent-modified Git config: ${unsafeConfig.join(', ')}.`
    )
  }
  if (git(['check-ref-format', '--branch', result.branch]).status !== 0) {
    fail('The agent branch name is not a valid Git branch.')
  }
  if (!result.branch.startsWith(scope.branchPrefix)) {
    fail('The agent branch does not belong to this app and source branch.')
  }
  const branchHead = git([
    'rev-parse',
    '--verify',
    `refs/heads/${result.branch}^{commit}`,
  ])
  if (branchHead.status !== 0) {
    fail('The agent branch does not exist.')
  }
  const sha = branchHead.stdout
  if (sha === initialHead) {
    fail('The agent branch has no new commits.')
  }
  if (git(['merge-base', '--is-ancestor', initialHead, sha]).status !== 0) {
    fail('The agent branch is not based on the checked out commit.')
  }
  // Publish precisely the checkout that the agent finished verifying.
  const checkout = git(['symbolic-ref', '--quiet', '--short', 'HEAD'])
  if (checkout.status !== 0 || checkout.stdout !== result.branch) {
    fail('Leave the verified agent branch checked out before delivery.')
  }
  const status = git(['status', '--porcelain', '--untracked-files=all'])
  if (status.status !== 0 || status.stdout) {
    fail(
      'Commit all tracked changes and nonignored untracked files before delivery.'
    )
  }
  const tree = git(['rev-parse', `${sha}^{tree}`])
  const initialTree = git(['rev-parse', `${initialHead}^{tree}`])
  if (
    tree.status !== 0 ||
    initialTree.status !== 0 ||
    tree.stdout === initialTree.stdout
  ) {
    fail('The agent branch has no changed files.')
  }

  const token = process.env.NEXT_UPGRADE_GITHUB_TOKEN
  const repository = process.env.GITHUB_REPOSITORY
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  if (!token || !repository) {
    fail('Missing github-token or GITHUB_REPOSITORY.')
  }

  // The derived header is not a registered secret, so mask it explicitly.
  console.log(`::add-mask::${lib.getAuthorizationHeader(token)}`)
  const ghEnv = {
    ...lib.getDeliveryGitEnv(baseEnv, { serverUrl, token, emptyHooksPath }),
    GH_TOKEN: token,
    GH_REPO: repository,
    GH_PROMPT_DISABLED: '1',
  }
  const gh = (args) => capture('gh', args, { cwd: runDirectory, env: ghEnv })

  if (repository !== scope.repository) {
    fail('The delivery repository does not match the prepared upgrade.')
  }

  const pullFields =
    'number,url,state,body,isCrossRepository,headRepository,baseRefName,headRefName,headRefOid'
  const pulls = gh([
    'pr',
    'list',
    '--state',
    'open',
    '--limit',
    '200',
    '--json',
    pullFields,
  ])
  if (pulls.status !== 0) {
    fail('Could not check for duplicate pull requests.')
  }
  let openPullRequests
  try {
    openPullRequests = JSON.parse(pulls.stdout)
  } catch {
    fail('Could not read the open pull requests.')
  }
  const remoteUrl = `${serverUrl}/${repository}.git`
  // Fetch refs as data, with hooks disabled. Never check out or execute them.
  const fetchHead = (branch) => {
    const fetched = capture(
      'git',
      ['fetch', '--no-tags', remoteUrl, `refs/heads/${branch}`],
      { cwd: repoRoot, env: ghEnv }
    )
    if (fetched.status !== 0) {
      fail('Could not inspect the existing upgrade branch.')
    }
    const head = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}'])
    if (head.status !== 0 || !/^[0-9a-f]{40}$/.test(head.stdout)) {
      fail('Could not read the fetched upgrade commit.')
    }
    return head.stdout
  }
  const matches = []
  for (const pull of lib.getOwnedPullRequests(openPullRequests, scope)) {
    const observedHead = fetchHead(pull.headRefName)
    if (observedHead !== pull.headRefOid) {
      fail(
        'The existing upgrade pull request changed during delivery. Retry the run.'
      )
    }
    if (git(['rev-parse', `${observedHead}^{tree}`]).stdout === tree.stdout) {
      // An unchanged head alone cannot prove that the PR is still open and
      // targets this app's source branch. Recheck the complete identity.
      const current = gh([
        'pr',
        'view',
        String(pull.number),
        '--json',
        pullFields,
      ])
      if (current.status !== 0) {
        fail('Could not recheck the existing upgrade pull request.')
      }
      let currentPull
      try {
        currentPull = JSON.parse(current.stdout)
      } catch {
        fail('Could not read the existing upgrade pull request.')
      }
      if (
        !currentPull ||
        currentPull.state !== 'OPEN' ||
        currentPull.number !== pull.number ||
        currentPull.headRefName !== pull.headRefName ||
        currentPull.headRefOid !== observedHead ||
        lib.getOwnedPullRequests([currentPull], scope).length !== 1
      ) {
        fail(
          'The existing upgrade pull request changed during delivery. Retry the run.'
        )
      }
      matches.push(currentPull)
    }
  }
  if (matches.length > 1) {
    fail(
      'More than one Action-owned pull request contains this verified upgrade.'
    )
  }
  if (matches.length === 1) {
    updateState({ outcome: { result: 'duplicate_pr', failureStage: null } })
    notice(
      `An open pull request already contains this upgrade: ${matches[0].url}`
    )
    return
  }

  const remote = capture(
    'git',
    ['ls-remote', '--heads', remoteUrl, `refs/heads/${result.branch}`],
    {
      cwd: repoRoot,
      env: ghEnv,
    }
  )
  if (remote.status !== 0) {
    fail('Could not check the remote branch.')
  }
  if (remote.stdout) {
    // A fresh job may commit identical files with different metadata. Resume
    // PR creation only for an equal tree that contains this source commit.
    const observedHead = remote.stdout.split(/\s+/)[0]
    const existingHead = fetchHead(result.branch)
    if (
      existingHead !== observedHead ||
      git(['rev-parse', `${existingHead}^{tree}`]).stdout !== tree.stdout ||
      git(['merge-base', '--is-ancestor', initialHead, existingHead]).status !==
        0
    ) {
      fail(
        `The remote branch ${result.branch} contains different work or source history. Inspect it before retrying; it was not overwritten.`
      )
    }
  } else {
    // Create the ref only if it is still absent. A plain push could replace
    // work another run created after the absence check, even as a fast-forward.
    const push = capture(
      'git',
      [
        'push',
        `--force-with-lease=refs/heads/${result.branch}:`,
        remoteUrl,
        `${sha}:refs/heads/${result.branch}`,
      ],
      {
        cwd: repoRoot,
        env: ghEnv,
      }
    )
    if (push.status !== 0) {
      fail('Could not push the upgrade branch.')
    }
  }

  const bodyFile = path.join(runDirectory, 'pull-request-body.md')
  fs.writeFileSync(bodyFile, `${result.body}\n\n${scope.marker}`)
  const created = gh([
    'pr',
    'create',
    '--draft',
    '--base',
    scope.baseBranch,
    '--head',
    result.branch,
    '--title',
    result.title,
    '--body-file',
    bodyFile,
  ])
  if (created.status !== 0) {
    fail('Could not open the draft pull request.')
  }
  updateState({ outcome: { result: 'pr_opened', failureStage: null } })
  notice(`Opened draft pull request ${created.stdout}`)
}

function report(kind) {
  // Telemetry is best effort and never changes the job result.
  try {
    const state = readState()
    if (!state || !state.runId) {
      return
    }
    const args = lib.getReportArgs(kind, state)
    const cwd =
      state.appDirectory && fs.existsSync(state.appDirectory)
        ? state.appDirectory
        : state.repoRoot || process.cwd()
    const env = lib.sanitizeAgentEnv(process.env)
    capture(
      'npx',
      [
        '--yes',
        `next@${state.nextVersion || 'canary'}`,
        'internal',
        'report-agent-upgrade-action',
        ...args,
      ],
      { cwd, env, timeout: 180_000 }
    )
  } catch {}
}

function cleanup() {
  fs.rmSync(runDirectory, { recursive: true, force: true })
}

const commands = {
  prepare,
  validate,
  'install-dependencies': installDependencies,
  'install-agent': installAgent,
  agent,
  deliver,
  'report-started': () => report('started'),
  'report-result': () => report('result'),
  cleanup,
}

const command = commands[process.argv[2]]
if (!command) {
  fail(`Unknown step ${process.argv[2]}.`)
}
command()
