import { createHash } from 'crypto'
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from 'fs'
import { tmpdir } from 'os'
import { realpath } from 'fs/promises'
import { isAbsolute, join, relative, sep } from 'path'

import spawn from 'next/dist/compiled/cross-spawn'

import * as Log from '../../build/output/log'
import { bold, cyan } from '../picocolors'
import { chooseOption } from './choose-option'
import { findHarnesses, getHarnessDisplayName } from './harness'
import { getHarnessModels, type UpgradeModel } from './model-discovery'
import {
  registerSecrets,
  remainingSteps,
  setupSecrets,
  type AgentAuth,
} from './setup-secrets'

const WORKFLOW = '.github/workflows/next-upgrade.yml'
const TEMPLATE = '.github/actions/next-upgrade/workflow.template.yml'
const SOURCE = 'vercel/next.js'
const SETUP_BRANCH_PREFIX = 'next-upgrade/setup-'
const SETUP_MARKER = '<!-- next-upgrade:setup -->'
const SECRET = 'NEXT_UPGRADE_AGENT_CREDENTIAL'
const PUBLISH_SECRET = 'NEXT_UPGRADE_PUBLISH_TOKEN'
const TITLE = 'Set up scheduled Next.js upgrades'

const AUTH_OPTIONS: Record<AgentAuth, string> = {
  'codex-openai-api-key': 'Codex with an OpenAI API key',
  'claude-anthropic-api-key': 'Claude Code with an Anthropic API key',
  'claude-subscription': 'Claude Code with a Claude subscription',
}

type Auth = AgentAuth
type Policy = 'security' | 'latest'
type SetupResult = {
  status:
    | 'draft_created'
    | 'already_installed'
    | 'existing_draft'
    | 'instructions_printed'
    | 'cancelled'
    | 'blocked'
    | 'failed'
  url?: string
}

type Repository = {
  full_name?: string
  default_branch: string
  permissions?: { push?: boolean }
  archived?: boolean
  disabled?: boolean
}

type Pull = {
  body?: string
  draft?: boolean
  state?: string
  html_url?: string
  head?: { ref?: string; sha?: string; repo?: { full_name?: string } }
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

function isPolicy(value: unknown): value is Policy {
  return value === 'security' || value === 'latest'
}

function isAuth(value: string): value is Auth {
  return Object.hasOwn(AUTH_OPTIONS, value)
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}

function run({
  command,
  args,
  cwd,
  env,
  input,
}: {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  input?: string
}) {
  return spawn.sync(command, args, {
    cwd,
    env,
    input,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  })
}

// Esc and Ctrl+C both cancel setup.
async function choose(
  question: string,
  values: Record<string, string>,
  defaultIndex = 0
) {
  const id = await chooseOption(question, values, defaultIndex, true)
  return typeof id === 'string' && Object.hasOwn(values, id) ? id : null
}

function repoPath(root: string, path: string): string {
  const name = relative(root, path).split(sep).join('/') || '.'
  if (
    isAbsolute(name) ||
    name
      .split('/')
      .some((part) => part === '..' || part.toLowerCase() === '.git') ||
    name.trim() !== name ||
    name.includes('\\') ||
    name.includes(':') ||
    name.includes('${{') ||
    /[\u2028-\u202e\u2066-\u2069]/.test(name) ||
    Array.from(name).some(
      (char) => char < ' ' || (char >= '\x7f' && char <= '\x9f')
    )
  ) {
    throw new SetupError('The app has an unsafe path.', 'blocked')
  }
  return name
}

// On Windows, any open that passes through a project link can reach a network
// share and send the user's credentials, and a path checked first can be
// swapped for a link before it is opened. There, setup reads project files
// from the Git objects of HEAD, which never follow worktree links.
function gitObject(root: string, path: string, args: string[]) {
  const name = relative(root, path).split(sep).join('/')
  return spawn.sync('git', [...args, `HEAD:${name}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    windowsHide: true,
  })
}

export function projectPathExists(
  root: string,
  path: string,
  platform: NodeJS.Platform = process.platform
) {
  if (platform !== 'win32') {
    return existsSync(path)
  }
  return gitObject(root, path, ['cat-file', '-e']).status === 0
}

export function readProjectText(
  root: string,
  path: string,
  platform: NodeJS.Platform = process.platform
) {
  if (platform !== 'win32') {
    return readFileSync(path, 'utf8')
  }
  const result = gitObject(root, path, ['cat-file', 'blob'])
  if (result.status !== 0) {
    throw new SetupError(
      `On Windows, setup reads committed project files. Commit ${relative(root, path).split(sep).join('/')} and run setup again.`,
      'blocked'
    )
  }
  return result.stdout
}

function decodeFile(file: FileContent | null) {
  if (
    file?.type !== 'file' ||
    file.encoding !== 'base64' ||
    typeof file.content !== 'string'
  ) {
    throw new SetupError('GitHub did not return the requested repository file.')
  }
  return Buffer.from(file.content, 'base64').toString('utf8')
}

function renderWorkflow({
  template,
  sha,
  appPath,
  policy,
  auth,
  model,
  effort,
  telemetryDisabled,
}: {
  template: string
  sha: string
  appPath: string
  policy: Policy
  auth: Auth
  model: string
  effort: string
  telemetryDisabled: boolean
}) {
  // A single-quoted YAML scalar; repoPath already rejects line breaks.
  const scalar = (value: string) => "'" + value.replaceAll("'", "''") + "'"
  const substitutions = [
    [
      `    uses: ${SOURCE}/${WORKFLOW}@__NEXT_UPGRADE_WORKFLOW_SHA__`,
      `    uses: ${SOURCE}/${WORKFLOW}@${sha}`,
    ],
    [
      '      app-path: __NEXT_UPGRADE_APP_PATH__',
      `      app-path: ${scalar(appPath)}`,
    ],
    ['      policy: __NEXT_UPGRADE_POLICY__', `      policy: ${policy}`],
    [
      '      agent-auth: __NEXT_UPGRADE_AGENT_AUTH__',
      `      agent-auth: ${auth}`,
    ],
    ['      model: __NEXT_UPGRADE_MODEL__', `      model: ${scalar(model)}`],
    [
      '      effort: __NEXT_UPGRADE_EFFORT__',
      `      effort: ${scalar(effort)}`,
    ],
    [
      '      telemetry-disabled: __NEXT_UPGRADE_TELEMETRY_DISABLED__',
      `      telemetry-disabled: ${telemetryDisabled}`,
    ],
  ]
  const lines = template.replaceAll('\r\n', '\n').trimEnd().split('\n')
  for (const [placeholder, value] of substitutions) {
    const index = lines.indexOf(placeholder)
    if (index < 0 || lines.lastIndexOf(placeholder) !== index) {
      throw new SetupError(
        'The published workflow template has an invalid placeholder.'
      )
    }
    lines[index] = value
  }

  const workflow = lines.join('\n') + '\n'
  // Validate the caller's supported YAML shape, including indentation and unique keys.
  const shape = lines
    .filter((line) => line.trim() && !line.trimStart().startsWith('#'))
    .map(
      (line) =>
        substitutions.find(([, rendered]) => line === rendered)?.[0] ?? line
    )
    .join('\n')
  const expectedShape = [
    'name: Next.js upgrade',
    'on:',
    '  schedule:',
    "    - cron: '0 0 * * 1'",
    '  workflow_dispatch:',
    'permissions: {}',
    'jobs:',
    '  upgrade:',
    '    permissions:',
    '      contents: read',
    substitutions[0][0],
    '    with:',
    ...substitutions.slice(1).map(([placeholder]) => placeholder),
    '    secrets:',
    '      agent-credential: ${{ secrets.' + SECRET + ' }}',
    '      publish-token: ${{ secrets.' + PUBLISH_SECRET + ' }}',
  ].join('\n')
  if (shape !== expectedShape || /__NEXT_UPGRADE_[A-Z_]+__/.test(workflow)) {
    throw new SetupError(
      'The published workflow template has an invalid YAML structure.'
    )
  }
  return workflow
}

// Mirrors @next/env's production file order, where the first file wins.
export function readEnvTelemetryOptOut(
  directory: string,
  platform: NodeJS.Platform = process.platform
) {
  const files = [
    '.env.production.local',
    '.env.local',
    '.env.production',
    '.env',
  ]
  // On Windows even listing or opening a project file can follow a link to a
  // network share and send the user's credentials, and dotenv files are
  // usually not committed. Treat telemetry as opted out there instead.
  if (platform === 'win32') {
    return '1'
  }
  for (const file of files) {
    const path = join(directory, file)
    const info = lstatSync(path, { throwIfNoEntry: false })
    if (!info) {
      continue
    }
    // Never follow a link: on Windows it could reach a network share and send
    // the user's credentials. Treat a linked file, which can hold an opt-out,
    // as one instead of reporting telemetry the user may have disabled.
    let contents: string
    try {
      if (!info.isFile()) {
        throw new Error('Not a regular file.')
      }
      const descriptor = openSync(
        path,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
      )
      try {
        contents = readFileSync(descriptor, 'utf8')
      } finally {
        closeSync(descriptor)
      }
    } catch {
      return '1'
    }
    const value = contents.match(
      // Match within one line, as dotenv does, so an empty value stays empty.
      /^[^\S\r\n]*(?:export[^\S\r\n]+)?NEXT_TELEMETRY_DISABLED[^\S\r\n]*=[^\S\r\n]*([^\r\n]*?)[^\S\r\n]*$/m
    )?.[1]
    if (value !== undefined) {
      return value.replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return undefined
}

export async function setupUpgradeCI({
  directory,
  policy,
}: {
  directory: string
  policy: true | string
}): Promise<SetupResult> {
  // Keep the invoking user's GitHub environment.
  const env = {
    ...process.env,
    GH_DEBUG: '',
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
  }
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

  try {
    if (policy !== true && !isPolicy(policy)) {
      throw new SetupError('Use security or latest with --ci.', 'blocked')
    }
    directory = await realpath(directory)
    const git = (...args: string[]) =>
      run({ command: 'git', args, cwd: directory, env })
    const top = git('rev-parse', '--show-toplevel')
    const origin = git('remote', 'get-url', 'origin')
    const match = origin.stdout
      ?.trim()
      .match(
        /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+?)(?:\.git)?$/
      )
    if (
      top.status !== 0 ||
      origin.status !== 0 ||
      !match ||
      /\/\.{1,2}$/.test(match[1])
    ) {
      throw new SetupError(
        'Run setup in a Git checkout with a GitHub.com origin.',
        'blocked'
      )
    }

    const root = await realpath(top.stdout.trim())
    let repo = match[1]

    // Slice support: one app with its own npm lockfile. Workspaces and other
    // package managers stop here until the workflow supports them.
    const manifestPath = join(directory, 'package.json')
    if (!projectPathExists(root, manifestPath)) {
      throw new SetupError(
        'Run setup from the directory of a Next.js app.',
        'blocked'
      )
    }
    let manifest: Record<string, unknown> | null = null
    try {
      manifest = JSON.parse(readProjectText(root, manifestPath))
    } catch {}
    if (
      typeof manifest !== 'object' ||
      manifest === null ||
      Array.isArray(manifest)
    ) {
      throw new SetupError('Could not read the app package.json.', 'blocked')
    }
    const appManifest = manifest
    const declarations = [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ].flatMap((field) => {
      const dependencies = appManifest[field] as
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
        projectPathExists(root, join(directory, name))
      )
    ) {
      throw new SetupError(
        'No Next.js app was found in this directory.',
        'blocked'
      )
    }
    const unsupported =
      'Scheduled upgrades currently support a single app that uses npm, with a committed package-lock.json next to its package.json. Workspaces and other package managers are not supported yet.'
    if (
      declarations.some(
        (specifier) =>
          typeof specifier !== 'string' ||
          /^(?:catalog|workspace):/.test(specifier)
      ) ||
      Object.hasOwn(manifest, 'workspaces') ||
      !projectPathExists(root, join(directory, 'package-lock.json'))
    ) {
      throw new SetupError(unsupported, 'blocked')
    }
    // Scheduled runs read the default branch, so the lockfile must be committed.
    if (
      git('ls-files', '--error-unmatch', '--', 'package-lock.json').status !== 0
    ) {
      throw new SetupError(
        'Commit the package-lock.json, push it to the default branch, and run setup again.',
        'blocked'
      )
    }
    for (let current = directory; ; current = join(current, '..')) {
      if (
        [
          'pnpm-workspace.yaml',
          'pnpm-lock.yaml',
          'yarn.lock',
          'bun.lock',
          'bun.lockb',
        ].some((file) => projectPathExists(root, join(current, file)))
      ) {
        throw new SetupError(unsupported, 'blocked')
      }
      // An app inside an npm workspace shares the root's lockfile and install.
      const ancestorManifest = join(current, 'package.json')
      if (current !== directory && projectPathExists(root, ancestorManifest)) {
        let workspaces = true
        try {
          const parsed = JSON.parse(readProjectText(root, ancestorManifest))
          workspaces = Object.hasOwn(Object(parsed), 'workspaces')
        } catch {}
        if (workspaces) {
          throw new SetupError(unsupported, 'blocked')
        }
      }
      if (current === root || join(current, '..') === current) {
        break
      }
    }
    const appPath = repoPath(root, directory)

    function api<T>(
      endpoint: string,
      description: string,
      options: {
        method?: 'POST'
        body?: object
        missing?: true
        paginate?: true
        jq?: string
      } = {}
    ): T | null {
      const { method, body, missing, jq } = options
      const args = ['api', '--hostname', 'github.com', endpoint]
      if (options.paginate) {
        args.push('--paginate')
      }
      if (jq) {
        // gh prints one JSON value per line for each result of the filter.
        args.push('--jq', jq)
      } else if (options.paginate) {
        args.push('--slurp')
      }
      if (method) {
        args.push('--method', method, '--input', '-')
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
          return null
        }
        if (
          (result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
        ) {
          throw new SetupError(
            'Install and authenticate the GitHub CLI to set up scheduled upgrades.',
            'blocked'
          )
        }
        throw new SetupError(description)
      }
      try {
        return jq
          ? (result.stdout
              .split('\n')
              .filter(Boolean)
              .map((line) => JSON.parse(line)) as T)
          : JSON.parse(result.stdout)
      } catch {
        throw new SetupError(description)
      }
    }

    function branchSha(branch: string) {
      const response = api<{ name: string; commit: { sha: string } }>(
        `repos/${repo}/branches/${encodeURIComponent(branch)}`,
        'Could not look up the consumer default branch.'
      )
      if (response?.name !== branch || !isSha(response?.commit?.sha)) {
        throw new SetupError(
          'GitHub did not confirm the requested branch and commit.'
        )
      }
      return response.commit.sha
    }

    const repository = api<Repository>(
      `repos/${repo}`,
      'Could not look up the GitHub repository.'
    )
    // GitHub follows renames, so use the canonical name for later requests.
    if (
      typeof repository?.full_name === 'string' &&
      repository.full_name.toLowerCase() !== repo.toLowerCase() &&
      /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository.full_name)
    ) {
      repo = repository.full_name
    }
    const defaultBranch = repository?.default_branch
    if (
      typeof defaultBranch !== 'string' ||
      git('check-ref-format', `refs/heads/${defaultBranch}`).status !== 0 ||
      defaultBranch.startsWith(SETUP_BRANCH_PREFIX)
    ) {
      throw new SetupError('GitHub did not return a valid default branch.')
    }
    const base = defaultBranch

    const fileAt = (
      source: string,
      path: string,
      ref: string,
      description: string,
      missing?: true
    ) =>
      api<FileContent>(
        `repos/${source}/contents/${path}?ref=${ref}`,
        description,
        { missing }
      )

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

    function checkExisting(sha: string): SetupResult | null {
      const installed = fileAt(
        repo,
        WORKFLOW,
        sha,
        'Could not check the default branch for an existing workflow.',
        true
      )
      if (installed) {
        if (installed.type !== 'file') {
          throw new SetupError(
            'The setup workflow path is occupied.',
            'blocked'
          )
        }
        const ref = base.split('/').map(encodeURIComponent).join('/')
        const url = `https://github.com/${repo}/blob/${ref}/${WORKFLOW}`
        Log.info(`Scheduled upgrades are already installed: ${url}`)
        return { status: 'already_installed', url }
      }

      // Keep only setup branches, so repositories with many open pull
      // requests do not overflow the output buffer.
      const pulls = api<Pull[]>(
        `repos/${repo}/pulls?state=open&per_page=100`,
        'Could not check for an open setup pull request.',
        {
          paginate: true,
          jq: `.[] | select(.head.ref | startswith(${JSON.stringify(SETUP_BRANCH_PREFIX)})) | {state, draft, html_url, body, base: {ref: .base.ref}, head: {ref: .head.ref, repo: {full_name: .head.repo.full_name}}}`,
        }
      )
      if (!Array.isArray(pulls)) {
        throw new SetupError('GitHub did not return the open pull requests.')
      }
      for (const pull of pulls) {
        if (
          pull.state === 'open' &&
          pull.base?.ref === base &&
          pull.head?.ref?.startsWith(SETUP_BRANCH_PREFIX) &&
          pull.head.repo?.full_name?.toLowerCase() === repo.toLowerCase() &&
          // Bodies edited on GitHub use CRLF line endings.
          pull.body?.split(/\r?\n/).includes(SETUP_MARKER)
        ) {
          const url = pullUrl(pull)
          Log.info(`A setup pull request is already open: ${url}`)
          return { status: 'existing_draft', url }
        }
      }
      return null
    }

    const baseSha = branchSha(base)
    const existing = checkExisting(baseSha)
    if (existing) {
      return existing
    }

    // The environment or the app's .env files can opt out of telemetry for
    // the scheduled runs and for setup's own events.
    const telemetryDisabled = Boolean(
      process.env.NEXT_TELEMETRY_DISABLED || readEnvTelemetryOptOut(directory)
    )

    // The workflow holds the one policy for the app.
    let selectedPolicy: string | null = policy === true ? null : policy
    if (selectedPolicy === null) {
      if (!interactive) {
        throw new SetupError(
          'Specify security or latest with --ci to set up scheduled upgrades non-interactively.',
          'blocked'
        )
      }
      selectedPolicy = await choose('Choose the upgrade policy:', {
        security: 'Security updates (only for security advisories)',
        latest: 'Latest stable release (every new stable release)',
      })
      if (selectedPolicy === null) {
        return { status: 'cancelled' }
      }
    }
    if (!isPolicy(selectedPolicy)) {
      throw new SetupError('Use security or latest with --ci.', 'blocked')
    }

    if (!interactive) {
      Log.info(
        `Run next upgrade --ci in an interactive terminal to choose the hosted agent. The workflow needs an OpenAI API key, an Anthropic API key, or a Claude subscription token in the ${SECRET} secret and a fine-grained personal access token in the ${PUBLISH_SECRET} secret.`
      )
      return { status: 'instructions_printed' }
    }
    // The same agent, model and effort questions as `next upgrade --agent`,
    // with the models read from the agent CLI installed here. Esc goes back
    // one question and Ctrl+C cancels. The CLI default model and the model
    // default effort stay unset, so runs follow the workflow's agent CLI.
    const installed = await findHarnesses()
    // The workflow's agent starts from a fresh configuration, so read the
    // models a fresh install offers, not those from this user's agent setup.
    let discoveryHome: string | undefined
    const discoveryEnv = (): NodeJS.ProcessEnv => {
      discoveryHome ??= mkdtempSync(join(tmpdir(), 'next-upgrade-models-'))
      for (const name of ['codex', 'claude', 'config']) {
        mkdirSync(join(discoveryHome, name), { recursive: true })
      }
      return {
        NODE_ENV: process.env.NODE_ENV,
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TMPDIR: process.env.TMPDIR,
        HOME: discoveryHome,
        USERPROFILE: discoveryHome,
        CODEX_HOME: join(discoveryHome, 'codex'),
        CLAUDE_CONFIG_DIR: join(discoveryHome, 'claude'),
        XDG_CONFIG_HOME: join(discoveryHome, 'config'),
      }
    }
    // Like `next upgrade --agent`, read every catalog before the first menu,
    // so no agent CLI runs while a menu reads the terminal.
    const catalogs = new Map<string, UpgradeModel[]>(
      await Promise.all(
        installed.map(
          async (harness) =>
            [
              harness.name,
              (await getHarnessModels(
                harness.name,
                harness.path,
                directory,
                undefined,
                discoveryEnv()
              )) ?? [],
            ] as const
        )
      )
    )
    let stage: 'agent' | 'model' | 'effort' = 'agent'
    let auth: Auth | undefined
    let chosenModel: UpgradeModel | undefined
    let effort = 'default'
    try {
      while (true) {
        if (stage === 'agent') {
          const id = await chooseOption(
            'Choose the hosted agent for the scheduled GitHub workflow:',
            AUTH_OPTIONS,
            Math.max(0, Object.keys(AUTH_OPTIONS).indexOf(auth ?? '')),
            true
          )
          if (typeof id !== 'string' || !isAuth(id)) {
            return { status: 'cancelled' }
          }
          auth = id
          stage = 'model'
          continue
        }
        const harnessName = auth === 'codex-openai-api-key' ? 'codex' : 'claude'
        const displayName = getHarnessDisplayName(harnessName)
        if (stage === 'model') {
          const models = catalogs.get(harnessName) ?? []
          if (models.length === 0) {
            chosenModel = undefined
            Log.info(
              `The workflow uses the default model of its ${displayName} CLI. Install ${displayName} here to choose another model.`
            )
            break
          }
          const chosenId = chosenModel?.id
          const previous = models.some(({ id }) => id === chosenId)
            ? chosenId
            : undefined
          const modelId = await chooseOption(
            `Which ${displayName} model should run the upgrade?`,
            Object.fromEntries(
              models.map(({ id, label, description }) => [
                id,
                description ? `${label} — ${description}` : label,
              ])
            ),
            Math.max(
              0,
              models.findIndex(({ id, isDefault }) =>
                previous ? id === previous : isDefault
              )
            )
          )
          if (modelId === null) {
            return { status: 'cancelled' }
          }
          if (modelId === undefined) {
            stage = 'agent'
            continue
          }
          chosenModel = models.find(({ id }) => id === modelId)
          if (!chosenModel) {
            throw new SetupError('The model choice is invalid.')
          }
          if (!chosenModel.efforts.includes(effort)) {
            effort = 'default'
          }
          stage = 'effort'
          continue
        }
        if (!chosenModel || chosenModel.efforts.length === 0) {
          break
        }
        const efforts = ['default', ...chosenModel.efforts]
        const selectedEffort = await chooseOption(
          'Which reasoning effort should the upgrade use?',
          Object.fromEntries(
            efforts.map((value) => [
              value,
              value === 'default' ? 'Model default' : value,
            ])
          ),
          Math.max(0, efforts.indexOf(effort))
        )
        if (selectedEffort === null) {
          return { status: 'cancelled' }
        }
        if (selectedEffort === undefined) {
          stage = 'model'
          continue
        }
        if (!efforts.includes(selectedEffort)) {
          throw new SetupError('The reasoning effort choice is invalid.')
        }
        effort = selectedEffort
        break
      }
    } finally {
      if (discoveryHome) {
        rmSync(discoveryHome, { recursive: true, force: true })
      }
    }
    if (!auth) {
      return { status: 'cancelled' }
    }
    const model =
      chosenModel &&
      !chosenModel.isDefault &&
      /^[\w.:/-]+$/.test(chosenModel.id)
        ? chosenModel.id
        : ''
    const effortInput =
      chosenModel && effort !== 'default' && /^[a-z]+$/.test(effort)
        ? effort
        : ''

    // Pin the release that matches the installed Next.js, which the workflow runs from npm.
    const version = process.env.__NEXT_VERSION
    const tag = `v${version}`
    if (!version || git('check-ref-format', `refs/tags/${tag}`).status !== 0) {
      throw new SetupError('Could not determine the installed Next.js version.')
    }
    const tagRef = api<{ object?: { type?: string; sha?: string } }>(
      `repos/${SOURCE}/git/ref/tags/${encodeURIComponent(tag)}`,
      `Could not look up the ${SOURCE} release tag ${tag}.`,
      { missing: true }
    )
    if (!tagRef) {
      throw new SetupError(
        `No ${SOURCE} release tag ${tag} matches the installed Next.js. Install a published release and run setup again.`,
        'blocked'
      )
    }
    let target = tagRef.object
    if (target?.type === 'tag' && isSha(target.sha)) {
      target = api<{ object?: { type?: string; sha?: string } }>(
        `repos/${SOURCE}/git/tags/${target.sha}`,
        `Could not resolve the ${SOURCE} release tag ${tag}.`
      )?.object
    }
    if (target?.type !== 'commit' || !isSha(target.sha)) {
      throw new SetupError(
        `GitHub did not resolve the ${SOURCE} release tag ${tag} to a commit.`
      )
    }
    const sha = target.sha
    const template = decodeFile(
      fileAt(
        SOURCE,
        TEMPLATE,
        sha,
        `Could not read the workflow template at the ${SOURCE} release tag ${tag}.`
      )
    )
    decodeFile(
      fileAt(
        SOURCE,
        WORKFLOW,
        sha,
        `Could not read the reusable workflow at the ${SOURCE} release tag ${tag}.`
      )
    )
    // Carry an opt-out the repository or this environment already sets into the scheduled runs.
    const workflow = renderWorkflow({
      template,
      sha,
      appPath,
      policy: selectedPolicy,
      auth,
      model,
      effort: effortInput,
      telemetryDisabled,
    })

    // The pull request shows the workflow, so setup does not print it.
    const confirmation = await choose(
      `Open a setup pull request against ${repo} (${base})?`,
      {
        publish: 'Open pull request',
        cancel: 'Cancel',
      }
    )
    if (confirmation !== 'publish') {
      return { status: 'cancelled' }
    }
    if (
      !repository?.permissions?.push ||
      repository.archived ||
      repository.disabled
    ) {
      throw new SetupError(
        'The GitHub account needs write access to the consumer repository.',
        'blocked'
      )
    }

    function recheck() {
      const currentRepository = api<Repository>(
        `repos/${repo}`,
        'Could not recheck the consumer repository.'
      )
      if (currentRepository?.default_branch !== base) {
        throw new SetupError(
          'The default branch changed during setup. Run setup again.',
          'blocked'
        )
      }
      const currentSha = branchSha(base)
      const found = checkExisting(currentSha)
      if (found) {
        return found
      }
      if (
        !currentRepository.permissions?.push ||
        currentRepository.archived ||
        currentRepository.disabled
      ) {
        throw new SetupError(
          'The GitHub account no longer has write access to the consumer repository.',
          'blocked'
        )
      }
      if (currentSha !== baseSha) {
        throw new SetupError(
          'The default branch advanced during setup. Run setup again.',
          'blocked'
        )
      }
      return null
    }

    const pending = recheck()
    if (pending) {
      return pending
    }
    // Equivalent attempts share a branch and GitHub admits one open PR per head/base.
    const setupKey = createHash('sha256')
      .update(
        JSON.stringify([
          baseSha,
          sha,
          appPath,
          selectedPolicy,
          auth,
          model,
          effortInput,
          telemetryDisabled,
        ])
      )
      .digest('hex')
      .slice(0, 24)
    const setupBranch = SETUP_BRANCH_PREFIX + setupKey
    const refEndpoint = `repos/${repo}/git/ref/heads/${setupBranch}`
    const ref = api<{ object?: { sha?: string } }>(
      refEndpoint,
      'Could not look up the setup branch.',
      { missing: true }
    )
    let headSha = ref?.object?.sha
    if (!ref) {
      try {
        headSha = api<{ object?: { sha?: string } }>(
          `repos/${repo}/git/refs`,
          'Could not create the setup branch.',
          {
            method: 'POST',
            body: { ref: `refs/heads/${setupBranch}`, sha: baseSha },
          }
        )?.object?.sha
      } catch (error) {
        const found = recheck()
        if (found) {
          return found
        }
        throw error
      }
      if (headSha !== baseSha) {
        throw new SetupError(
          'GitHub did not confirm the setup branch at the expected base commit.'
        )
      }
    }

    if (headSha === baseSha) {
      // GitHub signs this commit and checks the branch head atomically.
      const result = api<{
        data?: { createCommitOnBranch?: { commit?: { oid?: string } } }
      }>(
        'graphql',
        'Could not commit the setup workflow. Check workflow file write permissions.',
        {
          method: 'POST',
          body: {
            query:
              'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }',
            variables: {
              input: {
                branch: {
                  repositoryNameWithOwner: repo,
                  branchName: setupBranch,
                },
                expectedHeadOid: baseSha,
                message: { headline: TITLE, body: SETUP_MARKER },
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
        }
      )
      headSha = result?.data?.createCommitOnBranch?.commit?.oid
      if (!isSha(headSha)) {
        throw new SetupError(
          'GitHub did not confirm the workflow commit. Check workflow file write permissions.'
        )
      }
    } else {
      // A previous attempt may have committed the workflow before opening the pull request.
      if (!isSha(headSha)) {
        throw new SetupError('GitHub did not confirm the setup branch commit.')
      }
      const comparison = api<{
        ahead_by: number
        behind_by: number
        commits: { commit: { message: string } }[]
        files: { filename: string; status: string }[]
      }>(
        `repos/${repo}/compare/${baseSha}...${headSha}`,
        'Could not verify the existing setup branch.'
      )
      if (
        comparison?.ahead_by !== 1 ||
        comparison.behind_by !== 0 ||
        comparison.commits?.length !== 1 ||
        comparison.commits[0].commit.message !==
          `${TITLE}\n\n${SETUP_MARKER}` ||
        comparison.files?.length !== 1 ||
        comparison.files[0].filename !== WORKFLOW ||
        comparison.files[0].status !== 'added' ||
        decodeFile(
          fileAt(
            repo,
            WORKFLOW,
            headSha,
            'Could not verify the existing setup workflow.'
          )
        ) !== workflow
      ) {
        throw new SetupError(
          `The ${setupBranch} branch already exists with different changes.`,
          'blocked'
        )
      }
    }

    const opened = recheck()
    if (opened) {
      return opened
    }
    if (
      api<{ object?: { sha?: string } }>(
        refEndpoint,
        'Could not verify the setup branch before publication.'
      )?.object?.sha !== headSha
    ) {
      throw new SetupError(
        'The setup branch changed before publication.',
        'blocked'
      )
    }

    let pull: Pull | null
    try {
      pull = api<Pull>(
        `repos/${repo}/pulls`,
        'GitHub could not create the setup pull request.',
        {
          method: 'POST',
          body: {
            title: TITLE,
            body: SETUP_MARKER,
            head: setupBranch,
            base,
          },
        }
      )
    } catch (error) {
      const found = recheck()
      if (found) {
        return found
      }
      throw error
    }
    if (
      pull?.state !== 'open' ||
      pull.head?.sha !== headSha ||
      pull.base?.ref !== base
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
    const results = await registerSecrets({
      secrets: setupSecrets({
        repo,
        auth,
        agentSecret: SECRET,
        publishSecret: PUBLISH_SECRET,
      }),
      repo,
      isRegistered(name) {
        try {
          // A failed lookup counts as not registered.
          return Boolean(
            api(
              `repos/${repo}/actions/secrets/${name}`,
              'Could not look up the secret.',
              { missing: true }
            )
          )
        } catch {
          return false
        }
      },
      register(name, value) {
        // The value travels on standard input only, never in an argument.
        const result = run({
          command: 'gh',
          args: ['secret', 'set', name, '--repo', `github.com/${repo}`],
          cwd: root,
          env,
          input: value,
        })
        return result.status === 0
      },
      openUrl(page) {
        const [command, ...args] =
          process.platform === 'darwin'
            ? ['open']
            : process.platform === 'win32'
              ? ['rundll32', 'url.dll,FileProtocolHandler']
              : ['xdg-open']
        // Do not wait for the browser, and ignore a machine without one: the
        // URL is printed as well.
        spawn(command, [...args, page], {
          cwd: root,
          env,
          stdio: 'ignore',
          detached: true,
        })
          .on('error', () => {})
          .unref()
      },
    })
    Log.bootstrap(remainingSteps({ results, repo, url }))
    return { status: 'draft_created', url }
  } catch (error) {
    if (error instanceof SetupError) {
      Log.error(error.message)
      return { status: error.status }
    }
    // Child process and configuration errors may contain credentials.
    Log.error('Could not complete scheduled Next.js upgrade setup.')
    return { status: 'failed' }
  }
}
