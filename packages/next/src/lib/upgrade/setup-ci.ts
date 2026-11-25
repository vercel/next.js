import { createHash, randomUUID } from 'crypto'
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
} from 'fs'
import { mkdtemp, readFile, realpath, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { isAbsolute, join, relative, sep } from 'path'

import spawn from 'next/dist/compiled/cross-spawn'

import * as Log from '../../build/output/log'
import loadConfig from '../../server/config'
import { normalizeConfig } from '../../server/config-shared'
import {
  CONFIG_FILES,
  PHASE_PRODUCTION_BUILD,
} from '../../shared/lib/constants'
import {
  eventAgentUpgradeCIInstallResult,
  eventAgentUpgradeCIInstallStarted,
  type AgentUpgradeCIInstallOutcome,
} from '../../telemetry/events/agent-upgrade'
import { Telemetry } from '../../telemetry/storage'
import { interopDefault } from '../interop-default'
import { bold, cyan, dim } from '../picocolors'
import {
  chooseOption,
  selectOption,
  showAnswer,
  showQuestion,
} from './choose-option'

const WORKFLOW = '.github/workflows/next-upgrade.yml'
const TEMPLATE = '.github/actions/next-upgrade/workflow.template.yml'
const SOURCE = 'vercel/next.js'
const SETUP_BRANCH_PREFIX = 'next-upgrade/setup-'
const SETUP_MARKER = '<!-- next-upgrade:setup -->'
const SECRET = 'NEXT_UPGRADE_AGENT_API_KEY'
const PUBLISH_SECRET = 'NEXT_UPGRADE_PUBLISH_TOKEN'
const TITLE = 'Set up scheduled Next.js upgrades'
const PHASE = PHASE_PRODUCTION_BUILD

const AUTH_OPTIONS = {
  'codex-ai-gateway-api-key': 'Codex through Vercel AI Gateway',
  'claude-ai-gateway-api-key': 'Claude Code through Vercel AI Gateway',
}

type Auth = keyof typeof AUTH_OPTIONS
type Policy = 'security' | 'latest'
type Target = { path: string; policy: Policy }
type SetupResult = {
  status: AgentUpgradeCIInstallOutcome
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
async function choose(question: string, values: Record<string, string>) {
  const id = await chooseOption(question, values, 0, true)
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
    throw new SetupError('A workspace package has an unsafe path.', 'blocked')
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

// pnpm reads the checkout itself, so on Windows the workspace members come
// from the committed lockfile instead: lockfile 9.0 lists every member as a
// two-space-indented key under `importers:` in its last document.
export function lockfileImporters(lockfile: string) {
  const document = lockfile.split(/^---$/m).at(-1) ?? ''
  const section = document.match(
    /^importers:\r?\n([\s\S]*?)(?=^\S|(?![\s\S]))/m
  )?.[1]
  if (section === undefined) {
    throw new SetupError(
      'Could not read the workspace packages from pnpm-lock.yaml.'
    )
  }
  return [...section.matchAll(/^ {2}('[^']*'|"[^"]*"|[^\s:'"][^\s:]*):/gm)].map(
    ([, key]) => key.replace(/^(['"])(.*)\1$/, '$2')
  )
}

async function discoverPackages({
  root,
  directory,
  env,
}: {
  root: string
  directory: string
  env: NodeJS.ProcessEnv
}) {
  // The pnpm workspace can sit below the Git root, e.g. in `frontend/`.
  let workspace: string | null = null
  for (let current = directory; ; current = join(current, '..')) {
    if (projectPathExists(root, join(current, 'pnpm-workspace.yaml'))) {
      workspace = current
      break
    }
    if (current === root || join(current, '..') === current) {
      break
    }
  }
  const paths = new Set([repoPath(root, workspace ?? directory)])
  if (workspace && process.platform === 'win32') {
    for (const key of lockfileImporters(
      readProjectText(root, join(workspace, 'pnpm-lock.yaml'))
    )) {
      paths.add(repoPath(root, join(workspace, key)))
    }
  } else if (workspace) {
    const listed = run({
      command: 'pnpm',
      args: ['list', '--recursive', '--depth', '-1', '--json'],
      cwd: workspace,
      env,
    })
    if (listed.status !== 0) {
      throw new SetupError('Could not list packages in the pnpm workspace.')
    }

    const projects: { path: string }[] = JSON.parse(listed.stdout)
    if (!Array.isArray(projects)) {
      throw new SetupError('pnpm returned an invalid workspace package list.')
    }
    for (const { path } of projects) {
      if (typeof path !== 'string' || !isAbsolute(path)) {
        throw new SetupError('pnpm returned an invalid workspace package path.')
      }
      // On Windows the manifest below is read from Git, not through this path.
      if (process.platform !== 'win32' && (await realpath(path)) !== path) {
        throw new SetupError('pnpm returned an invalid workspace package path.')
      }
      paths.add(repoPath(root, path))
    }
  }

  const packages = new Map<string, { app: boolean; declarations: string[] }>()
  for (const path of [...paths].sort()) {
    const dir = join(root, path)
    const manifestPath = join(dir, 'package.json')
    if (
      process.platform !== 'win32' &&
      (await realpath(manifestPath)) !== manifestPath
    ) {
      throw new SetupError('Expected a regular workspace package manifest.')
    }
    const manifest: Record<string, Record<string, string> | undefined> =
      JSON.parse(
        process.platform === 'win32'
          ? readProjectText(root, manifestPath)
          : await readFile(manifestPath, 'utf8')
      )
    const declarations = [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.optionalDependencies,
      manifest.peerDependencies,
    ].flatMap((dependencies) => {
      if (!dependencies || !Object.hasOwn(dependencies, 'next')) {
        return []
      }
      if (typeof dependencies.next !== 'string') {
        throw new SetupError('A package has an invalid Next.js dependency.')
      }
      return [dependencies.next]
    })
    if (declarations.length > 0) {
      packages.set(path, {
        app:
          !workspace ||
          ['app', 'pages', 'src/app', 'src/pages'].some((name) =>
            projectPathExists(root, join(dir, name))
          ),
        declarations,
      })
    }
  }

  return { workspace, packages }
}

function catalogFor(specifier: string) {
  if (specifier === 'catalog:' || specifier === 'catalog:default') {
    return 'catalog:default'
  }
  return specifier.startsWith('catalog:') ? specifier : null
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
  targets,
  supportingPaths,
  auth,
  telemetryDisabled,
}: {
  template: string
  sha: string
  targets: Target[]
  supportingPaths: string[]
  auth: Auth
  telemetryDisabled: boolean
}) {
  // JSON stays on a single YAML line. Double single quotes for the YAML scalar.
  const scalar = (value: unknown) =>
    "'" + JSON.stringify(value).replaceAll("'", "''") + "'"
  const substitutions = [
    [
      `    uses: ${SOURCE}/${WORKFLOW}@__NEXT_UPGRADE_WORKFLOW_SHA__`,
      `    uses: ${SOURCE}/${WORKFLOW}@${sha}`,
    ],
    [
      '      targets: __NEXT_UPGRADE_TARGETS__',
      `      targets: ${scalar(targets)}`,
    ],
    [
      '      supporting-paths: __NEXT_UPGRADE_SUPPORTING_PATHS__',
      `      supporting-paths: ${scalar(supportingPaths)}`,
    ],
    [
      '      agent-auth: __NEXT_UPGRADE_AGENT_AUTH__',
      `      agent-auth: ${auth}`,
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
// Reading each app's policy loads its config and .env files, which on Windows
// can follow a project link to a network share and send the user's
// credentials. Require an explicit policy there instead.
export function implicitPolicyError(
  policy: true | string,
  platform: NodeJS.Platform = process.platform
) {
  return policy === true && platform === 'win32'
    ? new SetupError(
        'On Windows, choose the upgrade policy explicitly: next upgrade --ci security or next upgrade --ci latest.',
        'blocked'
      )
    : null
}

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
  const installId = randomUUID()
  const start = Date.now()
  // The decision the rendered workflow uses once apps are selected: the
  // environment, the invoking directory's .env, or any selected app's .env.
  // Before selection, only the first two are known.
  const decision: { telemetryDisabled?: boolean } = {}
  let initialOptOut: string | undefined
  try {
    initialOptOut =
      process.env.NEXT_TELEMETRY_DISABLED || readEnvTelemetryOptOut(directory)
  } catch {
    initialOptOut = '1'
  }
  const result = await installScheduledUpgrade({ directory, policy, decision })
  try {
    const disabled = decision.telemetryDisabled ?? Boolean(initialOptOut)
    if (!disabled) {
      // Both events are sent once the outcome and the opt-out are known.
      // In CI, telemetry keeps its settings under distDir. Use a private
      // directory so it never opens project files such as a linked
      // .next/cache/config.json.
      const distDir = await mkdtemp(join(tmpdir(), 'next-upgrade-setup-'))
      try {
        const telemetry = new Telemetry({ distDir, skipNotify: true })
        telemetry.record(eventAgentUpgradeCIInstallStarted({ installId }))
        telemetry.record(
          eventAgentUpgradeCIInstallResult({
            installId,
            outcome: result.status,
            durationMs: Date.now() - start,
          })
        )
        await telemetry.flush()
      } finally {
        await rm(distDir, { recursive: true, force: true })
      }
    }
  } catch {
    // Reporting failures cannot change the setup result.
  }
  return result
}

async function installScheduledUpgrade({
  directory,
  policy,
  decision,
}: {
  directory: string
  policy: true | string
  decision: { telemetryDisabled?: boolean }
}): Promise<SetupResult> {
  // App configs can load dotenv files. Keep the invoking user's GitHub environment.
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

    // Read the environment's opt-out before loading any app config, which can
    // add one app's .env to process.env.
    const environmentOptOut = process.env.NEXT_TELEMETRY_DISABLED
    const windowsPolicy = implicitPolicyError(policy)
    if (windowsPolicy) {
      throw windowsPolicy
    }
    const { workspace, packages } = await discoverPackages({
      root,
      directory,
      env,
    })
    const apps = [...packages]
      .filter(([, pkg]) => pkg.app)
      .map(([path]) => path)
    if (apps.length === 0) {
      throw new SetupError(
        'No apps that directly declare Next.js were found.',
        'blocked'
      )
    }
    // The hosted workflow installs with pnpm, so require a pnpm lockfile.
    let lockDirectory = workspace ?? directory
    while (!projectPathExists(root, join(lockDirectory, 'pnpm-lock.yaml'))) {
      if (lockDirectory === root) {
        throw new SetupError(
          'Scheduled upgrades support pnpm projects. Commit a pnpm-lock.yaml and run setup again.',
          'blocked'
        )
      }
      lockDirectory = join(lockDirectory, '..')
    }
    // Scheduled runs read the lockfile format pnpm 9 and later write.
    const lockfileVersion = readProjectText(
      root,
      join(lockDirectory, 'pnpm-lock.yaml')
    ).match(/^lockfileVersion:\s*['"]?([^'"\s]+)/m)?.[1]
    if (lockfileVersion !== '9.0') {
      throw new SetupError(
        'Scheduled upgrades support pnpm lockfile version 9.0 (pnpm 9 or later). Update pnpm and run setup again.',
        'blocked'
      )
    }
    if (workspace && !interactive) {
      throw new SetupError(
        'Run setup interactively to select pnpm workspace apps.',
        'blocked'
      )
    }

    // The root is a package path as well, so use separate menu identifiers.
    const selected = new Set<string>(workspace ? [] : apps)
    if (workspace) {
      // One question for the whole selection. The menu reopens on the app
      // that was just toggled.
      showQuestion('Select the apps to upgrade:', true)
      let cursor = 0
      while (true) {
        const values: Record<string, string> = Object.fromEntries([
          ...apps.map((path, index) => [
            String(index),
            `${selected.has(path) ? '[x]' : '[ ]'} ${path}`,
          ]),
          ...(selected.size
            ? [['continue', 'Continue with selected apps']]
            : []),
          ['cancel', 'Cancel'],
        ])
        const choice = await selectOption(values, cursor)
        if (
          typeof choice !== 'string' ||
          !Object.hasOwn(values, choice) ||
          choice === 'cancel'
        ) {
          return { status: 'cancelled' }
        }
        if (choice === 'continue') {
          showAnswer(apps.filter((path) => selected.has(path)).join(', '))
          break
        }
        cursor = Number(choice)
        const path = apps[cursor]
        if (!selected.delete(path)) {
          selected.add(path)
        }
      }
    }

    // Any selected app's .env opt-out applies to the scheduled runs and to
    // setup's own events, whatever the outcome from here on.
    const telemetryDisabled = Boolean(
      environmentOptOut ||
        readEnvTelemetryOptOut(directory) ||
        [...selected].some((path) => readEnvTelemetryOptOut(join(root, path)))
    )
    decision.telemetryDisabled = telemetryDisabled

    const supportingPaths = new Set<string>()
    for (const path of selected) {
      const catalogs = new Set(packages.get(path)!.declarations.map(catalogFor))
      if (catalogs.size > 1 || (!workspace && !catalogs.has(null))) {
        throw new SetupError(
          `The shared Next.js dependency for ${path} could not be determined.`,
          'blocked'
        )
      }
      for (const catalog of catalogs) {
        if (catalog === null) {
          continue
        }
        const affected = [...packages].filter(([, pkg]) =>
          pkg.declarations.some(
            (specifier) => catalogFor(specifier) === catalog
          )
        )
        if (
          affected.some(([, pkg]) =>
            pkg.declarations.some(
              (specifier) => catalogFor(specifier) !== catalog
            )
          )
        ) {
          throw new SetupError(
            'A package uses conflicting Next.js declarations in the same catalog group.',
            'blocked'
          )
        }
        for (const [name, pkg] of affected) {
          if (pkg.app && !selected.has(name)) {
            throw new SetupError(
              `Select ${name} together with ${path} to approve the complete catalog group.`,
              'blocked'
            )
          }
          if (!pkg.app) {
            supportingPaths.add(name)
          }
        }
      }
    }

    const targets: Target[] = []
    for (const path of [...selected].sort()) {
      let resolvedPolicy: unknown = policy
      if (policy === true) {
        resolvedPolicy = undefined
        const dir = join(root, path)
        if (CONFIG_FILES.some((file) => existsSync(join(dir, file)))) {
          try {
            const raw = await loadConfig(PHASE, dir, { rawConfig: true })
            const config = await normalizeConfig(PHASE, interopDefault(raw))
            const experimental = config?.experimental
            if (experimental && Object.hasOwn(experimental, 'agentUpgrade')) {
              resolvedPolicy = experimental.agentUpgrade
            }
          } catch {
            throw new SetupError(
              `Could not read the upgrade policy for ${path}.`
            )
          }
        }
        if (resolvedPolicy === undefined) {
          if (!interactive) {
            throw new SetupError(
              `Specify security or latest with --ci to configure ${path} non-interactively.`,
              'blocked'
            )
          }
          resolvedPolicy = await choose(
            `Choose an upgrade policy for ${path}:`,
            {
              security: 'Security updates',
              latest: 'Latest stable release',
            }
          )
          if (resolvedPolicy === null) {
            return { status: 'cancelled' }
          }
        }
      }
      if (!isPolicy(resolvedPolicy)) {
        throw new SetupError(
          `The app config for ${path} disables agent upgrades or specifies an unsupported policy. Pass an explicit supported --ci policy to override it.`,
          'blocked'
        )
      }
      targets.push({ path, policy: resolvedPolicy })
    }

    const catalogPolicies = new Map<string, Policy>()
    for (const target of targets) {
      const catalog = catalogFor(packages.get(target.path)!.declarations[0])
      if (catalog !== null) {
        if (
          catalogPolicies.has(catalog) &&
          catalogPolicies.get(catalog) !== target.policy
        ) {
          throw new SetupError(
            `Select one policy for all apps in ${JSON.stringify(catalog)}.`,
            'blocked'
          )
        }
        catalogPolicies.set(catalog, target.policy)
      }
    }

    if (!interactive) {
      Log.info(
        `Run next upgrade --ci in an interactive terminal to choose the hosted agent. The workflow needs a Vercel AI Gateway API key in the ${SECRET} secret and a fine-grained personal access token in the ${PUBLISH_SECRET} secret.`
      )
      return { status: 'instructions_printed' }
    }
    const auth = await choose(
      'Choose the hosted agent for the scheduled GitHub workflow. It requires a Vercel AI Gateway API key:',
      AUTH_OPTIONS
    )
    if (auth === null) {
      return { status: 'cancelled' }
    }
    if (!isAuth(auth)) {
      throw new SetupError('The hosted authentication choice is invalid.')
    }

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
      targets,
      supportingPaths: [...supportingPaths].sort(),
      auth,
      telemetryDisabled,
    })

    // The draft shows the workflow, so setup does not print it.
    const confirmation = await choose(
      `Open a setup draft against ${repo} (${base})?`,
      {
        cancel: 'Cancel',
        publish: 'Open draft pull request',
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
          targets,
          [...supportingPaths].sort(),
          auth,
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
      // A previous attempt may have committed the workflow before opening the draft.
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
        'GitHub could not create the setup draft.',
        {
          method: 'POST',
          body: {
            title: TITLE,
            body: SETUP_MARKER,
            head: setupBranch,
            base,
            draft: true,
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
      pull?.draft !== true ||
      pull.state !== 'open' ||
      pull.head?.sha !== headSha ||
      pull.base?.ref !== base
    ) {
      throw new SetupError('GitHub did not confirm the expected setup draft.')
    }

    const url = pullUrl(pull)
    const agent = auth === 'codex-ai-gateway-api-key' ? 'Codex' : 'Claude Code'
    const secretCommand = (name: string) =>
      cyan(`gh secret set ${name} --repo ${repo}`)
    // Short lines the user can act on in order, with commands to copy.
    Log.bootstrap(
      [
        '',
        `  ${bold('Setup draft opened')}`,
        `  ${cyan(url)}`,
        '',
        `  ${bold('Finish setup in three steps')}`,
        '',
        `  ${bold('1. Add the agent key')}`,
        `     A Vercel AI Gateway API key for the hosted ${agent} agent.`,
        `     ${dim('Create one:')} https://vercel.com/docs/ai-gateway`,
        `     ${secretCommand(SECRET)}`,
        '',
        `  ${bold('2. Add the publication token')}`,
        '     A fine-grained personal access token for this repository with',
        '     read and write access to Contents, Pull requests, and Workflows.',
        `     ${dim('Create one:')} https://github.com/settings/personal-access-tokens/new`,
        `     ${secretCommand(PUBLISH_SECRET)}`,
        '',
        `  ${bold('3. Merge the setup draft')}`,
        '     Mark it ready and merge it. Upgrades then run every week.',
        `     ${dim('Run one now:')} Actions > Next.js upgrade > Run workflow`,
        '',
      ].join('\n')
    )
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
