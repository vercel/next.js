import type { SpawnSyncReturns } from 'child_process'
import {
  accessSync,
  constants,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'fs'
import { realpath } from 'fs/promises'
import { delimiter, dirname, isAbsolute, join, relative, sep } from 'path'

import spawn from 'next/dist/compiled/cross-spawn'

import * as Log from '../../build/output/log'
import { bold, cyan } from '../picocolors'
import { Telemetry } from '../../telemetry/storage'
import { chooseOption } from './choose-option'
import { remainingSteps, setupSecrets, type AgentAuth } from './setup-secrets'

const WORKFLOW = '.github/workflows/next-upgrade.yml'
const TEMPLATE = 'templates/next-upgrade.yml'
const SOURCE = 'vercel/next-upgrade-action'
const SETUP_BRANCH = 'next-upgrade/setup'
const REFRESH_SCOPE = 'gh auth refresh -h github.com -s workflow'
const SECRET = 'NEXT_UPGRADE_AGENT_CREDENTIAL'
const PUBLISH_SECRET = 'NEXT_UPGRADE_PUBLISH_TOKEN'
const TITLE = 'Set up scheduled Next.js upgrades'

const AUTH_OPTIONS: Record<AgentAuth, string> = {
  'codex-openai-api-key': 'Codex with an OpenAI API key',
  'claude-anthropic-api-key': 'Claude Code with an Anthropic API key',
}

type Policy = 'security' | 'latest'
type SetupResult = {
  status:
    | 'pull_request_opened'
    | 'already_installed'
    | 'pull_request_open'
    | 'cancelled'
    | 'blocked'
    | 'failed'
}

type Repository = {
  full_name: string
  default_branch: string
  permissions?: { push?: boolean }
  archived?: boolean
  disabled?: boolean
}

type Pull = {
  state?: string
  html_url?: string
  head?: { ref?: string; sha?: string }
  base?: { ref?: string }
}

type FileContent = { type: string; content: string; encoding: string }

class SetupError extends Error {
  constructor(
    message: string,
    readonly status: 'blocked' | 'failed' = 'failed'
  ) {
    super(message)
  }
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}

// A bare command name could run a copy planted in the checkout: Windows looks
// in the working directory before PATH, and package runners put the project's
// node_modules/.bin on PATH, along with that of every directory above it, which
// the checkout controls for an app below the Git root. Run commands only from
// absolute PATH directories outside the working directory and node_modules.
// A PATH entry or candidate that is missing or unreadable is skipped.
const unusable = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP'])

function findCommand({
  name,
  cwd,
  env,
}: {
  name: string
  cwd: string
  env: NodeJS.ProcessEnv
}) {
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH')
  const path = pathKey === undefined ? undefined : env[pathKey]
  const extensions =
    process.platform === 'win32'
      ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : ['']
  for (const entry of path === undefined ? [] : path.split(delimiter)) {
    // Reject project directories before touching the filesystem, so a
    // checkout-controlled link is never followed (on Windows, to an SMB share).
    if (!isAbsolute(entry) || entry.split(sep).includes('node_modules')) {
      continue
    }

    const fromCwdEntry = relative(cwd, entry)
    if (
      fromCwdEntry !== '..' &&
      !fromCwdEntry.startsWith(`..${sep}`) &&
      !isAbsolute(fromCwdEntry)
    ) {
      continue
    }

    let directory: string
    try {
      directory = realpathSync(entry)
    } catch (error) {
      if (unusable.has((error as NodeJS.ErrnoException).code ?? '')) {
        continue
      }

      throw error
    }

    if (directory.split(sep).includes('node_modules')) {
      continue
    }

    const fromCwd = relative(cwd, directory)
    if (
      fromCwd !== '..' &&
      !fromCwd.startsWith(`..${sep}`) &&
      !isAbsolute(fromCwd)
    ) {
      continue
    }

    for (const extension of extensions) {
      const file = join(directory, name + extension)
      try {
        if (!statSync(file).isFile()) {
          continue
        }

        if (process.platform !== 'win32') {
          accessSync(file, constants.X_OK)
        }

        return file
      } catch (error) {
        if (!unusable.has((error as NodeJS.ErrnoException).code ?? '')) {
          throw error
        }
      }
    }
  }

  return null
}

function commandNotFound(command: string): SpawnSyncReturns<string> {
  const error: NodeJS.ErrnoException = new Error(`${command} not found`)
  error.code = 'ENOENT'
  return {
    pid: 0,
    output: [],
    stdout: '',
    stderr: '',
    status: null,
    signal: null,
    error,
  }
}

function run({
  command,
  args,
  cwd,
  env,
  input,
  checkout,
}: {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  input?: string
  checkout?: string
}): SpawnSyncReturns<string> {
  const file = findCommand({ name: command, cwd: checkout ?? cwd, env })
  if (!file) {
    return commandNotFound(command)
  }

  return spawn.sync(file, args, {
    cwd,
    env,
    input,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  })
}

// On Windows, any open that passes through a project link can reach a network
// share and send the user's credentials, and a path checked first can be
// swapped for a link before it is opened. There, setup reads project files
// from the Git objects of HEAD, which never follow worktree links.
function gitObject({
  root,
  path,
  args,
}: {
  root: string
  path: string
  args: string[]
}) {
  const name = relative(root, path).split(sep).join('/')
  const git = findCommand({ name: 'git', cwd: root, env: process.env })
  if (!git) {
    return commandNotFound('git')
  }

  return spawn.sync(git, [...args, `HEAD:${name}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    windowsHide: true,
  })
}

export function projectPathExists({
  root,
  path,
  platform,
}: {
  root: string
  path: string
  platform: NodeJS.Platform
}) {
  if (platform !== 'win32') {
    return existsSync(path)
  }

  return gitObject({ root, path, args: ['cat-file', '-e'] }).status === 0
}

function readProjectText({ root, path }: { root: string; path: string }) {
  if (process.platform !== 'win32') {
    return readFileSync(path, 'utf8')
  }

  const result = gitObject({ root, path, args: ['cat-file', 'blob'] })
  if (result.status !== 0) {
    throw new SetupError(
      `On Windows, setup reads committed project files. Commit ${relative(root, path).split(sep).join('/')} and run setup again.`,
      'blocked'
    )
  }

  return result.stdout
}

export async function setupUpgradeCI({
  directory: requestedDirectory,
  policy,
}: {
  directory: string
  policy: true | string
}): Promise<SetupResult> {
  const env = {
    ...process.env,
    GH_DEBUG: '',
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    // Forced colors would wrap the JSON gh prints in escape codes.
    CLICOLOR_FORCE: '0',
    GH_FORCE_TTY: '',
  }
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

  try {
    if (policy !== true && policy !== 'security' && policy !== 'latest') {
      throw new SetupError(
        'Use security or latest with --ci. Put the app directory before the flag, as in next upgrade my-app --ci security.',
        'blocked'
      )
    }

    let directory: string
    try {
      directory = await realpath(requestedDirectory)
    } catch (error) {
      throw new SetupError(
        `Could not find the app directory. ${String(error)}`,
        'blocked'
      )
    }

    // Find the checkout without running Git, so the Git that setup runs never
    // comes from a directory inside it, even one above the app.
    let checkout = directory
    while (
      !existsSync(join(checkout, '.git')) &&
      dirname(checkout) !== checkout
    ) {
      checkout = dirname(checkout)
    }

    const git = (...args: string[]) =>
      run({ command: 'git', args, cwd: directory, env, checkout })
    const top = git('rev-parse', '--show-toplevel')
    const origin = git('remote', 'get-url', 'origin')
    const match =
      origin.status === 0
        ? origin.stdout
            .trim()
            .match(
              /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+?)(?:\.git)?$/
            )
        : null
    if (top.status !== 0 || match === null || /\/\.{1,2}$/.test(match[1])) {
      throw new SetupError(
        'Run setup in a Git checkout with a GitHub.com origin.',
        'blocked'
      )
    }

    const root = await realpath(top.stdout.trim())
    let repo = match[1]

    const manifestPath = join(directory, 'package.json')
    if (
      !projectPathExists({
        root,
        path: manifestPath,
        platform: process.platform,
      })
    ) {
      throw new SetupError(
        'Run setup from the directory of a Next.js app.',
        'blocked'
      )
    }

    let manifest: Record<string, unknown> | null = null
    try {
      manifest = JSON.parse(readProjectText({ root, path: manifestPath }))
    } catch (error) {
      throw new SetupError(
        `Could not read the app package.json. ${String(error)}`,
        'blocked'
      )
    }

    if (
      typeof manifest !== 'object' ||
      manifest === null ||
      Array.isArray(manifest)
    ) {
      throw new SetupError('Could not read the app package.json.', 'blocked')
    }

    const declarations = [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ].flatMap((field) => {
      const dependencies = manifest[field] as
        | Record<string, unknown>
        | undefined
      return typeof dependencies === 'object' &&
        dependencies !== null &&
        Object.hasOwn(dependencies, 'next')
        ? [dependencies.next]
        : []
    })
    if (
      declarations.length === 0 ||
      !['app', 'pages', 'src/app', 'src/pages'].some((name) =>
        projectPathExists({
          root,
          path: join(directory, name),
          platform: process.platform,
        })
      )
    ) {
      throw new SetupError(
        'No Next.js app was found in this directory.',
        'blocked'
      )
    }

    const unsupported =
      'Scheduled upgrades currently support a single app that uses npm, pnpm, or Yarn 1, with one committed lockfile next to its package.json. Workspaces, Yarn 2 and later, and Bun are not supported yet.'
    const lockfiles = [
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
    ].filter((file) =>
      projectPathExists({
        root,
        path: join(directory, file),
        platform: process.platform,
      })
    )
    if (
      declarations.some(
        (specifier) =>
          typeof specifier !== 'string' ||
          /^(?:catalog|workspace):/.test(specifier)
      ) ||
      Object.hasOwn(manifest, 'workspaces') ||
      lockfiles.length !== 1 ||
      (lockfiles[0] === 'yarn.lock' &&
        readProjectText({ root, path: join(directory, 'yarn.lock') }).includes(
          '\n__metadata:'
        ))
    ) {
      throw new SetupError(unsupported, 'blocked')
    }

    // Scheduled runs read the default branch, so the lockfile must be committed.
    if (git('cat-file', '-e', `HEAD:./${lockfiles[0]}`).status !== 0) {
      throw new SetupError(
        `Commit the ${lockfiles[0]}, push it to the default branch, and run setup again.`,
        'blocked'
      )
    }

    for (let current = directory; ; current = join(current, '..')) {
      // create-next-app writes a pnpm-workspace.yaml without packages for
      // build settings, so only one listing packages makes the app a
      // workspace. Above the app, any of them makes pnpm use another root.
      const pnpmWorkspace = join(current, 'pnpm-workspace.yaml')
      if (
        ['bun.lock', 'bun.lockb'].some((file) =>
          projectPathExists({
            root,
            path: join(current, file),
            platform: process.platform,
          })
        ) ||
        (projectPathExists({
          root,
          path: pnpmWorkspace,
          platform: process.platform,
        }) &&
          (current !== directory ||
            /^packages\s*:/m.test(
              readProjectText({ root, path: pnpmWorkspace })
            )))
      ) {
        throw new SetupError(unsupported, 'blocked')
      }

      // An app inside a workspace shares the root's lockfile and install.
      const ancestorManifest = join(current, 'package.json')
      if (
        current !== directory &&
        projectPathExists({
          root,
          path: ancestorManifest,
          platform: process.platform,
        })
      ) {
        let parsed: unknown
        try {
          parsed = JSON.parse(readProjectText({ root, path: ancestorManifest }))
        } catch (error) {
          throw new SetupError(
            `Could not read ${relative(root, ancestorManifest).split(sep).join('/')}. ${String(error)}`,
            'blocked'
          )
        }

        if (Object.hasOwn(Object(parsed), 'workspaces')) {
          throw new SetupError(unsupported, 'blocked')
        }
      }

      if (current === root || join(current, '..') === current) {
        break
      }
    }

    const appPath = relative(root, directory).split(sep).join('/') || '.'
    if (
      isAbsolute(appPath) ||
      appPath
        .split('/')
        .some((part) => part === '..' || part.toLowerCase() === '.git') ||
      appPath.trim() !== appPath ||
      appPath.includes('\\') ||
      appPath.includes(':') ||
      appPath.includes('${{') ||
      /[\u2028-\u202e\u2066-\u2069]/.test(appPath) ||
      Array.from(appPath).some(
        (char) => char < ' ' || (char >= '\x7f' && char <= '\x9f')
      )
    ) {
      throw new SetupError('The app has an unsafe path.', 'blocked')
    }

    // Callers that pass missing or DELETE type the null they can get back.
    function api<T>({
      endpoint,
      description,
      method,
      body,
      missing,
    }: {
      endpoint: string
      description: string
      method?: 'POST' | 'DELETE'
      body?: object
      missing?: true
    }): T {
      const args = ['api', '--hostname', 'github.com', endpoint]
      if (method) {
        args.push('--method', method)
      }

      if (body !== undefined) {
        args.push('--input', '-')
      }

      const result = run({
        command: 'gh',
        args,
        cwd: root,
        env,
        input: body === undefined ? undefined : JSON.stringify(body),
      })
      if (result.status !== 0) {
        if (missing && /^gh: .*\(HTTP 404\)$/m.test(result.stderr ?? '')) {
          return null as T
        }

        if (
          result.error !== undefined &&
          (result.error as NodeJS.ErrnoException).code === 'ENOENT'
        ) {
          throw new SetupError(
            'Install and authenticate the GitHub CLI to set up scheduled upgrades.',
            'blocked'
          )
        }

        // gh exits with 4 when it is not signed in.
        if (result.status === 4) {
          throw new SetupError(
            'Run gh auth login, then run setup again.',
            'blocked'
          )
        }

        // gh's own error line, such as `gh: Not Found (HTTP 404)`, says why.
        const reason = (result.stderr ?? '').match(/^gh: .*$/m)
        throw new SetupError(
          reason ? `${description} ${reason[0]}` : description
        )
      }

      if (method === 'DELETE') {
        return null as T
      }

      let parsed: T | null
      try {
        parsed = JSON.parse(result.stdout)
      } catch (error) {
        throw new SetupError(`${description} ${String(error)}`)
      }

      if (parsed === null) {
        throw new SetupError(description)
      }

      return parsed
    }

    const repository = api<Repository>({
      endpoint: `repos/${repo}`,
      description: 'Could not look up the GitHub repository.',
    })
    // A renamed or transferred repository answers under its current name,
    // which pull request URLs and the open pull request lookup use.
    if (
      typeof repository.full_name === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository.full_name)
    ) {
      repo = repository.full_name
    }

    const base = repository.default_branch
    if (
      typeof base !== 'string' ||
      git('check-ref-format', `refs/heads/${base}`).status !== 0 ||
      base === SETUP_BRANCH
    ) {
      throw new SetupError('GitHub did not return a valid default branch.')
    }

    function pullUrl(pull: Pull) {
      const prefix = `https://github.com/${repo}/pull/`
      const url = pull.html_url
      if (
        !url ||
        !url.toLowerCase().startsWith(prefix.toLowerCase()) ||
        !/^[1-9][0-9]*$/.test(url.slice(prefix.length))
      ) {
        throw new SetupError(
          'GitHub did not return a valid setup pull request URL.'
        )
      }

      return url
    }

    const branch = api<{ name: string; commit: { sha: string } }>({
      endpoint: `repos/${repo}/branches/${encodeURIComponent(base)}`,
      description: 'Could not look up the consumer default branch.',
    })
    if (branch.name !== base || !isSha(Object(branch.commit).sha)) {
      throw new SetupError(
        'GitHub did not confirm the requested branch and commit.'
      )
    }

    const baseSha = branch.commit.sha

    const existingWorkflow = api<FileContent | null>({
      endpoint: `repos/${repo}/contents/${WORKFLOW}?ref=${baseSha}`,
      description:
        'Could not check the default branch for an existing workflow.',
      missing: true,
    })
    if (existingWorkflow) {
      if (existingWorkflow.type !== 'file') {
        throw new SetupError('The setup workflow path is occupied.', 'blocked')
      }

      const ref = base.split('/').map(encodeURIComponent).join('/')
      const url = `https://github.com/${repo}/blob/${ref}/${WORKFLOW}`
      Log.info(`Scheduled upgrades are already installed: ${url}`)
      return { status: 'already_installed' }
    }

    // Setup always uses one branch, so an open pull request from it is the
    // earlier setup.
    const owner = repo.split('/')[0]
    const pulls = api<Pull[]>({
      endpoint: `repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${SETUP_BRANCH}`)}&base=${encodeURIComponent(base)}`,
      description: 'Could not check for an open setup pull request.',
    })
    if (!Array.isArray(pulls)) {
      throw new SetupError('GitHub did not return the open pull requests.')
    }

    const open = pulls.find(
      (pull) =>
        pull.state === 'open' &&
        Object(pull.base).ref === base &&
        Object(pull.head).ref === SETUP_BRANCH
    )
    if (open) {
      const url = pullUrl(open)
      Log.info(`A setup pull request is already open: ${url}`)
      return { status: 'pull_request_open' }
    }

    // Check what in the repository would stop publishing before any question.
    if (
      !Object(repository.permissions).push ||
      repository.archived ||
      repository.disabled
    ) {
      throw new SetupError(
        'The GitHub account needs write access to the consumer repository.',
        'blocked'
      )
    }

    // GitHub rejects workflow files from an OAuth token without the workflow
    // scope. Other tokens do not report scopes, so the commit decides.
    const user = run({
      command: 'gh',
      args: ['api', '--hostname', 'github.com', 'user', '--include'],
      cwd: root,
      env,
    })
    if (user.status !== 0) {
      throw new SetupError('Could not check the GitHub CLI account.')
    }

    const scopes = /^x-oauth-scopes:(.*)$/im.exec(user.stdout)
    if (
      scopes !== null &&
      !scopes[1].split(',').some((scope) => scope.trim() === 'workflow')
    ) {
      throw new SetupError(
        `The GitHub CLI needs the workflow scope to add the setup workflow. Run ${REFRESH_SCOPE} and run setup again.`,
        'blocked'
      )
    }

    // The branch may hold someone else's work, so setup deletes it only when
    // the user agrees, and only at the commit they saw.
    let staleBranch: string | null = null
    const leftover = api<{ object?: { sha?: string } } | null>({
      endpoint: `repos/${repo}/git/ref/heads/${SETUP_BRANCH}`,
      description: 'Could not look up the setup branch.',
      missing: true,
    })
    if (leftover) {
      const leftoverSha = Object(leftover.object).sha
      if (!interactive || !isSha(leftoverSha)) {
        throw new SetupError(
          `The ${SETUP_BRANCH} branch already exists. Delete it and run setup again.`,
          'blocked'
        )
      }

      const comparison = api<{
        ahead_by?: number
        files?: { filename?: string }[]
      }>({
        endpoint: `repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(leftoverSha)}`,
        description:
          'Could not compare the setup branch with the default branch.',
      })
      const ahead = comparison.ahead_by
      if (typeof ahead !== 'number' || !Array.isArray(comparison.files)) {
        throw new SetupError('GitHub did not return the setup branch changes.')
      }

      const otherFiles = comparison.files.some(
        (file) => file.filename !== WORKFLOW
      )
      const commits = ahead === 1 ? '1 commit' : `${ahead} commits`
      const restart = await chooseOption({
        question: otherFiles
          ? `The ${SETUP_BRANCH} branch already exists and has ${commits} that change other files. Delete it and start over?`
          : `The ${SETUP_BRANCH} branch already exists. Delete it and start over?`,
        values: {
          delete: 'Delete and start over',
          cancel: 'Cancel',
        },
        defaultValue: otherFiles ? 1 : 0,
        firstPrompt: true,
      })
      if (restart !== 'delete') {
        return { status: 'cancelled' }
      }

      staleBranch = leftoverSha
    }

    // Choosing the hosted agent needs a terminal, so setup stops without one
    // instead of reporting success with nothing set up.
    if (!interactive) {
      throw new SetupError(
        `Run next upgrade --ci in an interactive terminal to choose the hosted agent. The workflow needs an OpenAI API key or an Anthropic API key in the ${SECRET} secret and a fine-grained personal access token in the ${PUBLISH_SECRET} secret.`,
        'blocked'
      )
    }

    let selectedPolicy: Policy | undefined =
      policy === true ? undefined : policy
    if (selectedPolicy === undefined) {
      const id = await chooseOption({
        question: 'Choose the upgrade policy:',
        values: {
          security: 'Security updates (only for security advisories)',
          latest: 'Latest stable release (every new stable release)',
        },
        defaultValue: 0,
        firstPrompt: true,
      })
      if (id !== 'security' && id !== 'latest') {
        return { status: 'cancelled' }
      }

      selectedPolicy = id
    }

    const auth = (await chooseOption({
      question: 'Choose the hosted agent for the scheduled GitHub workflow:',
      values: AUTH_OPTIONS,
      defaultValue: 0,
      firstPrompt: true,
    })) as AgentAuth | null
    if (typeof auth !== 'string' || !Object.hasOwn(AUTH_OPTIONS, auth)) {
      return { status: 'cancelled' }
    }

    // The workflow installs the Next.js version that runs setup from npm.
    // Testing an unreleased Next.js commit installs its preview package instead.
    const nextVersion = process.env.__NEXT_VERSION
    if (!nextVersion || !/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(nextVersion)) {
      throw new SetupError('Could not determine the installed Next.js version.')
    }

    const previewSha =
      process.env.__NEXT_UPGRADE_CI_NEXT_PREVIEW_SHA_FOR_TESTING || undefined
    if (previewSha && !isSha(previewSha)) {
      throw new SetupError(
        '__NEXT_UPGRADE_CI_NEXT_PREVIEW_SHA_FOR_TESTING must be a full commit SHA.',
        'blocked'
      )
    }

    const testingSha = process.env.__NEXT_UPGRADE_CI_WORKFLOW_SHA_FOR_TESTING
    let sha: string
    if (testingSha) {
      if (!isSha(testingSha)) {
        throw new SetupError(
          '__NEXT_UPGRADE_CI_WORKFLOW_SHA_FOR_TESTING must be a full commit SHA.',
          'blocked'
        )
      }

      sha = testingSha
    } else {
      const head = Object(
        api<{ object?: { type?: string; sha?: string } }>({
          endpoint: `repos/${SOURCE}/git/ref/heads/main`,
          description: `Could not look up the ${SOURCE} main branch.`,
        }).object
      )
      if (head.type !== 'commit' || !isSha(head.sha)) {
        throw new SetupError(
          `GitHub did not resolve the ${SOURCE} main branch to a commit.`
        )
      }

      sha = head.sha
    }

    const templateFile = api<FileContent>({
      endpoint: `repos/${SOURCE}/contents/${TEMPLATE}?ref=${sha}`,
      description: `Could not read the workflow template at the ${SOURCE} commit ${sha}.`,
    })
    if (
      templateFile.type !== 'file' ||
      templateFile.encoding !== 'base64' ||
      typeof templateFile.content !== 'string'
    ) {
      throw new SetupError('GitHub did not return the workflow template.')
    }

    // The action repository owns the caller workflow's shape, so setup only
    // fills in the template's placeholders.
    const template = Buffer.from(templateFile.content, 'base64')
      .toString('utf8')
      .replaceAll('\r\n', '\n')
    // Each value replaces its own placeholder line, so a line break other than
    // \n could hide a line from that check.
    if (/[\r\u0085\u2028\u2029]/.test(template)) {
      throw new SetupError(
        'The published workflow template has an unsupported line break.'
      )
    }

    // A single-quoted YAML scalar; the app path check already rejects line
    // breaks.
    const scalar = (value: string) => "'" + value.replaceAll("'", "''") + "'"
    // Empty model and effort keep the agent CLI's defaults.
    const substitutions = [
      [
        `    uses: ${SOURCE}/${WORKFLOW}@__NEXT_UPGRADE_WORKFLOW_SHA__`,
        `    uses: ${SOURCE}/${WORKFLOW}@${sha}`,
      ],
      [
        '      next-version: __NEXT_UPGRADE_NEXT_VERSION__',
        `      next-version: ${scalar(nextVersion)}`,
      ],
      [
        '      app-path: __NEXT_UPGRADE_APP_PATH__',
        `      app-path: ${scalar(appPath)}`,
      ],
      [
        '      policy: __NEXT_UPGRADE_POLICY__',
        `      policy: ${selectedPolicy}`,
      ],
      [
        '      agent: __NEXT_UPGRADE_AGENT__',
        `      agent: ${auth === 'codex-openai-api-key' ? 'codex' : 'claude'}`,
      ],
      ['      auth: __NEXT_UPGRADE_AUTH__', '      auth: api-key'],
      ['      model: __NEXT_UPGRADE_MODEL__', `      model: ''`],
      ['      effort: __NEXT_UPGRADE_EFFORT__', `      effort: ''`],
      [
        '      telemetry-disabled: __NEXT_UPGRADE_TELEMETRY_DISABLED__',
        `      telemetry-disabled: ${!new Telemetry({ distDir: process.cwd(), skipNotify: true }).isEnabled}`,
      ],
    ]
    const lines = template.trimEnd().split('\n')
    for (const [placeholder, value] of substitutions) {
      const index = lines.indexOf(placeholder)
      if (index < 0 || lines.lastIndexOf(placeholder) !== index) {
        throw new SetupError(
          'The published workflow template has an invalid placeholder.'
        )
      }

      lines[index] = value
    }

    if (previewSha) {
      // An unreleased Next.js commit is not on npm, so the run installs its preview package.
      const telemetry = lines.indexOf(
        substitutions[substitutions.length - 1][1]
      )
      lines.splice(telemetry + 1, 0, `      next-preview-sha: '${previewSha}'`)
    }

    const workflow = lines.join('\n') + '\n'
    if (/__NEXT_UPGRADE_[A-Z_]+__/.test(workflow)) {
      throw new SetupError(
        'The published workflow template has an invalid placeholder.'
      )
    }

    // The pull request shows the workflow, so setup does not print it.
    const confirmation = await chooseOption({
      question: `Open a setup pull request against ${repo} (${base})?`,
      values: {
        publish: 'Open pull request',
        cancel: 'Cancel',
      },
      defaultValue: 0,
      firstPrompt: true,
    })
    if (confirmation !== 'publish') {
      return { status: 'cancelled' }
    }

    // A branch that appeared or moved since the question may hold other
    // changes, so setup otherwise only ever creates it.
    const current = api<{ object?: { sha?: string } } | null>({
      endpoint: `repos/${repo}/git/ref/heads/${SETUP_BRANCH}`,
      description: 'Could not look up the setup branch.',
      missing: true,
    })
    if (current) {
      if (staleBranch === null || Object(current.object).sha !== staleBranch) {
        throw new SetupError(
          `The ${SETUP_BRANCH} branch already exists. Delete it and run setup again.`,
          'blocked'
        )
      }

      api({
        endpoint: `repos/${repo}/git/refs/heads/${SETUP_BRANCH}`,
        description: 'Could not delete the setup branch.',
        method: 'DELETE',
      })
    }

    const created = api<{ object?: { sha?: string } }>({
      endpoint: `repos/${repo}/git/refs`,
      description: 'Could not create the setup branch.',
      method: 'POST',
      body: { ref: `refs/heads/${SETUP_BRANCH}`, sha: baseSha },
    })
    if (Object(created.object).sha !== baseSha) {
      throw new SetupError(
        'GitHub did not confirm the setup branch at the expected base commit.'
      )
    }

    // GitHub signs this commit and checks the branch head atomically.
    let headSha: string | undefined
    let pull: Pull | null = null
    try {
      const commit = api<{
        data?: { createCommitOnBranch?: { commit?: { oid?: string } } }
      }>({
        endpoint: 'graphql',
        description: `Could not commit the setup workflow. If the GitHub CLI lacks the workflow scope, run ${REFRESH_SCOPE}.`,
        method: 'POST',
        body: {
          query:
            'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }',
          variables: {
            input: {
              branch: {
                repositoryNameWithOwner: repo,
                branchName: SETUP_BRANCH,
              },
              expectedHeadOid: baseSha,
              message: { headline: TITLE },
              fileChanges: {
                additions: [
                  {
                    path: WORKFLOW,
                    contents: Buffer.from(workflow).toString('base64'),
                  },
                ],
              },
            },
          },
        },
      })
      headSha = Object(
        Object(Object(commit.data).createCommitOnBranch).commit
      ).oid
      if (!isSha(headSha)) {
        throw new SetupError(
          `GitHub did not confirm the workflow commit. If the GitHub CLI lacks the workflow scope, run ${REFRESH_SCOPE}.`
        )
      }

      pull = api<Pull>({
        endpoint: `repos/${repo}/pulls`,
        description: 'GitHub could not create the setup pull request.',
        method: 'POST',
        body: { title: TITLE, head: SETUP_BRANCH, base },
      })
    } catch (error) {
      // Remove the branch setup just created, so a failure leaves nothing to
      // delete before the next attempt.
      try {
        api({
          endpoint: `repos/${repo}/git/refs/heads/${SETUP_BRANCH}`,
          description: 'Could not delete the setup branch.',
          method: 'DELETE',
        })
      } catch (cleanupError) {
        Log.warn(
          `Could not delete the ${SETUP_BRANCH} branch. Delete it on GitHub before you run setup again. ${String(cleanupError)}`
        )
      }

      throw error
    }

    if (
      pull === null ||
      pull.state !== 'open' ||
      Object(pull.head).sha !== headSha ||
      Object(pull.base).ref !== base
    ) {
      throw new SetupError(
        'GitHub did not confirm the expected setup pull request.'
      )
    }

    const url = pullUrl(pull)
    Log.bootstrap(
      ['', `  ${bold('Setup pull request opened')}`, `  ${cyan(url)}`].join(
        '\n'
      )
    )
    const secrets = setupSecrets({
      repo,
      auth,
      agentSecret: SECRET,
      publishSecret: PUBLISH_SECRET,
    })
    Log.bootstrap(remainingSteps({ secrets, repo, url }))
    return { status: 'pull_request_opened' }
  } catch (error) {
    if (error instanceof SetupError) {
      Log.error(error.message)
      return { status: error.status }
    }

    Log.error(
      `Could not complete scheduled Next.js upgrade setup. ${error instanceof Error ? error.message : String(error)}`
    )
    return { status: 'failed' }
  }
}
