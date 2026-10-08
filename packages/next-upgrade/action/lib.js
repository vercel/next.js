// Pure helpers for the Next.js upgrade GitHub Action. Side effects live in run.js.

const path = require('path')
const { createHash } = require('crypto')

const AGENTS = ['claude', 'codex']
const POLICIES = ['security', 'latest', 'experimental-future']
const RESULT_STATUSES = ['success', 'failure', 'no_update']

const BRANCH_PREFIX = 'next-upgrade/'
const MAX_TITLE_LENGTH = 256
const MAX_BODY_LENGTH = 60000
const MARKER_PATTERN = /<!-- next-upgrade: [^>\n]*? -->/

// Never hand GitHub or runner credentials to the agent.
const STRIPPED_ENV = new Set([
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
  'NEXT_UPGRADE_API_KEY',
  'NEXT_UPGRADE_GITHUB_TOKEN',
  'ACTIONS_RUNTIME_TOKEN',
  'ACTIONS_RUNTIME_URL',
  'ACTIONS_RESULTS_URL',
  'ACTIONS_CACHE_URL',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'CODEX_API_KEY',
  // Workflow command files would let the agent change later steps' env or PATH.
  'GITHUB_ENV',
  'GITHUB_PATH',
  'GITHUB_OUTPUT',
  'GITHUB_STATE',
])

function isInside(parent, child) {
  const relative = path.relative(parent, child)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}

// Returns the resolved app directory, or an error message for invalid input.
// `realpath` resolves symlinks so a linked directory cannot escape the repo.
function validateInputs(input, isDirectory, realpath = (value) => value) {
  if (!AGENTS.includes(input.agent)) {
    return {
      error: `Unsupported agent ${JSON.stringify(input.agent)}. Expected "claude" or "codex".`,
    }
  }
  if (!POLICIES.includes(input.policy)) {
    return {
      error: `Unsupported policy ${JSON.stringify(input.policy)}. Expected "security", "latest", or "experimental-future".`,
    }
  }
  if (!input.hasApiKey) {
    return {
      error: `Missing api-key. Pass the ${input.agent === 'codex' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} secret.`,
    }
  }
  const directory = input.directory || '.'
  const appDirectory = path.resolve(input.repoRoot, directory)
  if (path.isAbsolute(directory) || !isInside(input.repoRoot, appDirectory)) {
    return { error: 'The directory input must be inside the repository.' }
  }
  if (!isDirectory(appDirectory)) {
    return {
      error: `The directory ${JSON.stringify(directory)} does not exist.`,
    }
  }
  const realRepoRoot = realpath(input.repoRoot)
  const realAppDirectory = realpath(appDirectory)
  if (!isInside(realRepoRoot, realAppDirectory)) {
    return { error: 'The directory input must be inside the repository.' }
  }
  return {
    error: null,
    appDirectory: realAppDirectory,
    directory:
      path.relative(realRepoRoot, realAppDirectory).split(path.sep).join('/') ||
      '.',
  }
}

// Repository, source branch and app identify work owned by this Action.
function getUpgradeScope(repository, baseBranch, directory) {
  const key = createHash('sha256')
    .update(JSON.stringify([repository, baseBranch, directory]))
    .digest('hex')
    .slice(0, 12)
  return {
    repository,
    baseBranch,
    branchPrefix: `${BRANCH_PREFIX}v1/${key}/`,
    marker: `<!-- next-upgrade-action:v1:${key} -->`,
  }
}

// Find the install root from the nearest lockfile, preserving lockfile policy.
function getInstallCommand(appDirectory, repoRoot, fileExists, readFile) {
  let current = appDirectory
  while (true) {
    const directory = current
    const has = (name) => fileExists(path.join(directory, name))
    if (has('pnpm-lock.yaml')) {
      return {
        cwd: current,
        command: 'pnpm',
        args: ['install', '--frozen-lockfile'],
      }
    }
    if (has('yarn.lock')) {
      return {
        cwd: current,
        command: 'yarn',
        args: isYarnBerry(current, has, readFile)
          ? ['install', '--immutable']
          : ['install', '--frozen-lockfile'],
      }
    }
    if (has('package-lock.json') || has('npm-shrinkwrap.json')) {
      return { cwd: current, command: 'npm', args: ['ci'] }
    }
    if (has('bun.lock') || has('bun.lockb')) {
      return {
        cwd: current,
        command: 'bun',
        args: ['install', '--frozen-lockfile'],
      }
    }
    if (current === repoRoot || !isInside(repoRoot, current)) {
      break
    }
    current = path.dirname(current)
  }
  return { cwd: appDirectory, command: 'npm', args: ['install'] }
}

function isYarnBerry(directory, has, readFile) {
  if (has('.yarnrc.yml')) {
    return true
  }
  try {
    const { packageManager } = JSON.parse(
      readFile(path.join(directory, 'package.json'))
    )
    const major = /^yarn@(\d+)/.exec(packageManager || '')?.[1]
    return major !== undefined && Number(major) >= 2
  } catch {
    return false
  }
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function buildAgentPrompt({
  directory,
  policy,
  nextVersion,
  resultFile,
  branchPrefix,
}) {
  return `Run \`npx --yes next@${nextVersion} upgrade ${shellQuote(directory)} --agent=${policy}\` from the repository root and follow every instruction it prints.

This run is unattended in GitHub Actions. Nobody can answer questions, so make reasonable decisions and never wait for input. Work in the current checkout. Do not create a Git worktree.

You have no GitHub credentials. Report provider pull request checks as unavailable and rely on local branches, remote-tracking branches, and Git history for duplicate checks. Do not push, open pull requests, or call GitHub write APIs. The user approved one draft pull request, and this action opens it from your branch after you finish.

Commit the verified work on a local branch named \`${branchPrefix}${policy}-<target version>\` and leave that branch checked out with no uncommitted changes. If equivalent work exists locally, check out that candidate, verify it, and report its committed result in the same way. The Action checks GitHub for an equivalent pull request after you finish; local duplicate checks cannot determine that outcome.

When the task ends, write a JSON object to ${JSON.stringify(resultFile)}:
- \`{"status": "success", "branch": "<branch>", "title": "<pull request title>", "body": "<pull request body>"}\` after committing a verified upgrade. The body must describe the change and include the \`<!-- next-upgrade: ... -->\` marker from the upgrade instructions.
- \`{"status": "no_update"}\` when no upgrade is needed.
- \`{"status": "failure"}\` when the upgrade could not be completed and verified.
Never include secrets in this file.`
}

function getAgentInvocation(input) {
  const env = sanitizeAgentEnv(input.env)

  const args = []
  if (input.agent === 'claude') {
    env.ANTHROPIC_API_KEY = input.apiKey
    args.push('-p', '--permission-mode', 'bypassPermissions')
    if (input.model) args.push('--model', input.model)
    if (input.effort) args.push('--effort', input.effort)
  } else {
    env.CODEX_API_KEY = input.apiKey
    env.CODEX_HOME = input.codexHome
    // The ephemeral runner, rather than Codex's sandbox, is the isolation
    // boundary for unattended CI runs.
    args.push('exec', '--dangerously-bypass-approvals-and-sandbox')
    if (input.model) args.push('--model', input.model)
    if (input.effort) args.push('-c', `model_reasoning_effort=${input.effort}`)
  }
  args.push(input.prompt)
  return { command: input.agent, args, env }
}

function sanitizeAgentEnv(source) {
  const env = {}
  for (const [key, value] of Object.entries(source)) {
    if (
      value === undefined ||
      STRIPPED_ENV.has(key) ||
      key.startsWith('INPUT_') ||
      (key.startsWith('ACTIONS_') && /TOKEN|URL/.test(key))
    ) {
      continue
    }
    env[key] = value
  }
  return env
}

// The result file is agent output, so treat every field as untrusted.
function parseResult(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return { error: 'The agent result is not valid JSON.' }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'The agent result must be a JSON object.' }
  }
  if (!RESULT_STATUSES.includes(value.status)) {
    return { error: 'The agent result has an unknown status.' }
  }
  if (value.status !== 'success') {
    return { error: null, status: value.status }
  }

  const { branch, title, body } = value
  if (
    typeof branch !== 'string' ||
    !branch.startsWith(BRANCH_PREFIX) ||
    !/^[A-Za-z0-9._/-]+$/.test(branch) ||
    branch.length > 200
  ) {
    return {
      error: `The agent branch must start with "${BRANCH_PREFIX}" and use only letters, digits, ".", "_", "-", and "/".`,
    }
  }
  if (
    typeof title !== 'string' ||
    !title.trim() ||
    title.length > MAX_TITLE_LENGTH ||
    /[\r\n]/.test(title)
  ) {
    return { error: 'The agent pull request title is invalid.' }
  }
  if (typeof body !== 'string' || body.length > MAX_BODY_LENGTH) {
    return { error: 'The agent pull request body is invalid.' }
  }
  const marker = MARKER_PATTERN.exec(body)?.[0]
  if (!marker) {
    return {
      error: 'The agent pull request body is missing the next-upgrade marker.',
    }
  }
  return { error: null, status: 'success', branch, title, body, marker }
}

// A copied marker cannot make a fork or an unrelated branch Action-owned.
// Delivery compares the committed trees of these candidates before skipping.
function getOwnedPullRequests(pullRequests, scope) {
  return pullRequests.filter((pullRequest) => {
    if (
      pullRequest.isCrossRepository !== false ||
      pullRequest.headRepository?.nameWithOwner !== scope.repository ||
      !pullRequest.headRefName?.startsWith(scope.branchPrefix)
    ) {
      return false
    }
    if (
      pullRequest.baseRefName !== scope.baseBranch ||
      typeof pullRequest.body !== 'string' ||
      !pullRequest.body.includes(scope.marker) ||
      !/^[0-9a-f]{40}$/.test(pullRequest.headRefOid) ||
      !/^[A-Za-z0-9._/-]+$/.test(pullRequest.headRefName)
    ) {
      throw new Error(
        'An Action-owned pull request has inconsistent delivery metadata.'
      )
    }
    return true
  })
}

// Agent-controlled local config must not redirect or hook the token-bearing push.
function findUnsafeGitConfig(configKeys) {
  return configKeys.filter((key) => {
    const lower = key.toLowerCase()
    return (
      /^url\..*\.(push)?insteadof$/.test(lower) ||
      lower === 'include.path' ||
      lower.startsWith('includeif.') ||
      lower === 'core.sshcommand' ||
      lower === 'core.hookspath' ||
      lower === 'core.fsmonitor' ||
      lower.startsWith('credential.') ||
      /^http\..*\.(extraheader|proxy)$/.test(lower) ||
      lower === 'http.extraheader' ||
      lower === 'http.proxy'
    )
  })
}

// Git config passed by env vars: disables hooks and helpers that could run
// agent-controlled code while delivery handles the token.
function getSafeGitEnv(env, emptyHooksPath, extraEntries = []) {
  const entries = [
    ['core.hooksPath', emptyHooksPath],
    ['core.fsmonitor', 'false'],
    ['credential.helper', ''],
    ...extraEntries,
  ]
  const next = { ...env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' }
  next.GIT_CONFIG_COUNT = String(entries.length)
  entries.forEach(([key, value], index) => {
    next[`GIT_CONFIG_KEY_${index}`] = key
    next[`GIT_CONFIG_VALUE_${index}`] = value
  })
  return next
}

function getAuthorizationHeader(token) {
  return `basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`
}

// The token travels in Git config env vars so it never appears in argv.
function getDeliveryGitEnv(env, { serverUrl, token, emptyHooksPath }) {
  return getSafeGitEnv(env, emptyHooksPath, [
    [
      `http.${serverUrl}/.extraheader`,
      `AUTHORIZATION: ${getAuthorizationHeader(token)}`,
    ],
  ])
}

module.exports = {
  AGENTS,
  POLICIES,
  BRANCH_PREFIX,
  validateInputs,
  getUpgradeScope,
  getInstallCommand,
  buildAgentPrompt,
  getAgentInvocation,
  sanitizeAgentEnv,
  parseResult,
  getOwnedPullRequests,
  findUnsafeGitConfig,
  getSafeGitEnv,
  getAuthorizationHeader,
  getDeliveryGitEnv,
}
