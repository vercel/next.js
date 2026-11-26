import { createHash } from 'node:crypto'
import {
  appendFile,
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

import { createHostedAgent, isAuthMode } from './hosted-agent.mjs'
import {
  commandEnv,
  parseJson,
  run,
  sudo,
  systemCommand,
  systemPath,
} from './process.mjs'

const policies = new Set(['security', 'latest'])
const otherLockfiles = ['yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb']
export function normalizeUpgradePath(path) {
  if (
    typeof path !== 'string' ||
    path.trim() !== path ||
    path.length === 0 ||
    posix.isAbsolute(path) ||
    /[\\:\x00-\x1f\x7f]/u.test(path) ||
    path
      .split('/')
      .some((part) => part === '..' || part.toLowerCase() === '.git')
  ) {
    throw new Error('Invalid repository-relative upgrade path.')
  }
  return posix.normalize(path).replace(/\/$/u, '') || '.'
}

export function candidateKey({ path, policy }) {
  return createHash('sha256')
    .update(JSON.stringify({ path: normalizeUpgradePath(path), policy }))
    .digest('hex')
    .slice(0, 24)
}

function git(cwd, args) {
  return run(
    systemCommand('git'),
    ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args],
    {
      cwd,
      // An empty template directory keeps agent-written templates, such as a
      // filter in the system template config, out of runner-owned clones.
      env: {
        ...commandEnv(),
        PATH: systemPath(),
        GIT_TEMPLATE_DIR: '',
      },
      description: `Git ${args[0]}`,
    }
  )
}

async function checkout(source, root, baseSha) {
  // Copy the objects so the agent user does not need access to the consumer checkout.
  await git(source, [
    'clone',
    '--template=',
    '--no-checkout',
    '--shared',
    '--dissociate',
    '--',
    source,
    root,
  ])
  await git(root, ['remote', 'remove', 'origin'])
  await git(root, ['checkout', '--detach', baseSha])
  // The empty template creates no info directory, and a shallow source, like
  // the checkout actions/checkout makes, leaves none behind either.
  await mkdir(join(root, '.git', 'info'), { recursive: true })
  await appendFile(
    join(root, '.git', 'info', 'exclude'),
    '\nnode_modules/\n.next/\n'
  )
}

// Copies the agent's working tree into a fresh runner-owned checkout. Git then
// never reads configuration, hooks or ignore rules the agent could change.
async function snapshot({ source, destination, baseRoot, baseSha }) {
  await checkout(baseRoot, destination, baseSha)
  for (const entry of await readdir(destination)) {
    if (entry !== '.git') {
      await rm(join(destination, entry), { recursive: true, force: true })
    }
  }
  const copied = []
  await cp(source, destination, {
    recursive: true,
    verbatimSymlinks: true,
    filter: async (path) => {
      if (
        path !== source &&
        ['.git', 'node_modules', '.next'].includes(basename(path))
      ) {
        return false
      }
      copied.push(path)
      return true
    },
  })
  // Never hand agent-set setuid or setgid bits to files this process owns.
  for (const path of copied) {
    if (((await lstat(path)).mode & 0o6000) !== 0) {
      throw new Error('The candidate contains a file with special permissions.')
    }
  }
}

// Uses a snapshot and removes it before anything else runs.
async function withSnapshot(options, use) {
  try {
    await snapshot(options)
    return await use(options.destination)
  } finally {
    await rm(options.destination, { recursive: true, force: true })
  }
}

async function readProjectFile(root, path, { optional = false } = {}) {
  const file = join(root, path)
  const info = await lstat(file).catch((error) => {
    if (optional && error.code === 'ENOENT') {
      return null
    }
    throw error
  })
  if (info === null) {
    return null
  }
  if (!info.isFile() || (await realpath(file)) !== file) {
    throw new Error('Expected a regular project file in the checkout.')
  }
  return readFile(file, 'utf8')
}

// The working tree as one patch against the base commit. Git runs in a
// runner-owned snapshot, so it never reads configuration the agent changed.
async function candidatePatch({ root, baseSha, credential }) {
  if ((await git(root, ['rev-parse', 'HEAD'])).toString().trim() !== baseSha) {
    throw new Error('The candidate changed the checkout commit.')
  }
  await git(root, ['add', '--all'])
  // The snapshot leaves out node_modules and .next directories, so keep any
  // files the base tracks below them instead of publishing their removal.
  await git(root, [
    'reset',
    '--quiet',
    baseSha,
    '--',
    ':(glob)**/node_modules/**',
    ':(glob)**/.next/**',
  ])
  const changes = (
    await git(root, [
      'diff',
      '--cached',
      '--raw',
      '--no-abbrev',
      '-z',
      '--no-renames',
      baseSha,
    ])
  )
    .toString()
    .split('\0')
  if (changes.length < 2) {
    throw new Error('The agent did not change any files.')
  }
  for (let i = 0; i + 1 < changes.length; i += 2) {
    const [before, after, , blob] = changes[i].slice(1).split(' ')
    const file = changes[i + 1]
    // The publication token never writes workflows or submodules.
    if (
      normalizeUpgradePath(file) !== file ||
      file
        .split('/')
        .some((part) => /^(?:\.github|\.gitmodules)$/iu.test(part)) ||
      !['000000', '100644', '100755'].includes(before) ||
      (after !== '000000' &&
        after !== (before === '000000' ? '100644' : before))
    ) {
      throw new Error(
        'The candidate contains a protected path or unsupported file mode.'
      )
    }
    if (
      after !== '000000' &&
      (await git(root, ['cat-file', 'blob', blob])).includes(credential)
    ) {
      throw new Error('The candidate contains the agent credential.')
    }
  }
  const patch = await git(root, [
    'diff',
    '--cached',
    '--binary',
    '--no-renames',
    '--no-ext-diff',
    '--no-textconv',
    baseSha,
  ])
  if (patch.includes(credential)) {
    throw new Error('The candidate patch contains the agent credential.')
  }
  return patch
}

// The CLI's handoff for one app: an assessment, and the agent prompt when an
// upgrade is ready.
function readHandoff(contents) {
  const handoff = parseJson(contents, 'Next.js upgrade handoff')
  switch (handoff?.status) {
    case 'ready':
      if (
        semver.valid(handoff.installedVersion) === handoff.installedVersion &&
        semver.valid(handoff.targetVersion) === handoff.targetVersion &&
        semver.gt(handoff.targetVersion, handoff.installedVersion) &&
        typeof handoff.prompt === 'string' &&
        handoff.prompt.trim()
      ) {
        return handoff
      }
      break
    case 'unaffected':
    case 'blocked':
    case 'unknown':
      if (typeof handoff.reason === 'string') {
        return handoff
      }
      break
    default:
      break
  }
  throw new Error('Unsupported Next.js upgrade handoff.')
}

function validateApp({ appPath, policy }) {
  if (!policies.has(policy)) {
    throw new Error('Use the security or latest upgrade policy.')
  }
  return normalizeUpgradePath(appPath)
}

// A private scratch directory. With an agent user, only that user's group can
// pass through to the candidate checkout and guides.
async function createScratch(agentUser) {
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'next-upgrade-')))
  // The base clone, handoff and snapshot stay private to this process; only
  // the candidate checkout and guides are handed to the agent user.
  const privateRoot = join(scratch, 'private')
  await mkdir(privateRoot, { mode: 0o700 })
  if (agentUser !== undefined) {
    await sudo(['chgrp', agentUser, scratch], 'Sharing the scratch directory')
    await chmod(scratch, 0o710)
  }
  return { scratch, privateRoot }
}

// Checks the app, installs its dependencies in a candidate checkout and asks
// the pinned CLI whether an upgrade is ready. `stage` names the step that is
// running, for the failure message.
async function assessCheckout({
  root,
  path,
  policy,
  cliPath,
  baseSha,
  scratch,
  privateRoot,
  stage,
}) {
  stage.name = 'preflight'
  const baseRoot = join(privateRoot, 'base')
  await checkout(root, baseRoot, baseSha)
  if (
    (await readProjectFile(baseRoot, posix.join(path, 'package-lock.json'), {
      optional: true,
    })) === null
  ) {
    // Setup requires the committed lockfile, so a missing one is a failure.
    throw new Error(
      'Scheduled upgrades need a committed package-lock.json next to the app package.json on the default branch.'
    )
  }
  // The CLI picks a package manager from the lockfiles, and some run
  // repository code when probed, so an npm app has only the npm lockfile.
  for (const lockfile of otherLockfiles) {
    if (await lstat(join(baseRoot, path, lockfile)).catch(() => null)) {
      throw new Error(
        `Scheduled upgrades support npm only, and the app also has ${lockfile}.`
      )
    }
  }

  const id = candidateKey({ path, policy })
  const candidateRoot = join(scratch, id)
  const appDirectory = join(candidateRoot, path)
  await checkout(root, candidateRoot, baseSha)
  // The CLI reads the installed Next.js version, as for a local
  // `next upgrade --agent`. Scripts stay off outside the agent's sandbox,
  // and a project .npmrc cannot pick the Git that fetches Git dependencies:
  // the command line takes precedence over it.
  await run(
    'npm',
    [
      'ci',
      `--git=${systemCommand('git')}`,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    { cwd: appDirectory, description: 'Dependency install' }
  )

  const versionOutput = (
    await run(process.execPath, [cliPath, '--version'], {
      cwd: baseRoot,
      description: 'Pinned Next.js CLI version lookup',
    })
  )
    .toString()
    .trim()
  const cliVersion = versionOutput.match(/^Next\.js v(\S+)$/u)?.[1]
  if (!cliVersion || semver.valid(cliVersion) !== cliVersion) {
    throw new Error('Unsupported pinned Next.js CLI version output.')
  }

  stage.name = 'assessment'
  const handoffPath = join(privateRoot, 'handoff.json')
  // The CLI writes its guides here, outside the private directory, so the
  // agent user can read them.
  const guides = join(scratch, `${id}-guides`)
  await run(process.execPath, [cliPath, 'upgrade', '.', `--agent=${policy}`], {
    cwd: appDirectory,
    env: {
      ...commandEnv(),
      __NEXT_UPGRADE_EXPECTED_CLI_VERSION: cliVersion,
      __NEXT_AGENT_UPGRADE_CI_HANDOFF: handoffPath,
      __NEXT_AGENT_UPGRADE_CI_GUIDES: guides,
    },
    description: 'Pinned Next.js upgrade handoff',
  })
  const handoff = readHandoff(await readFile(handoffPath, 'utf8'))
  if (handoff.status === 'unknown') {
    throw new Error(handoff.reason)
  }
  if (handoff.status === 'ready') {
    if (
      (await git(candidateRoot, ['status', '--porcelain', '-z'])).length !== 0
    ) {
      throw new Error('The CLI handoff changed the candidate checkout.')
    }
  }
  return { id, baseRoot, candidateRoot, appDirectory, guides, handoff }
}

// Reports what assessment found for an app that needs no agent run.
function settledOutcome(outcome, handoff, explain) {
  if (handoff.status === 'unaffected') {
    outcome.status = 'no_upgrade'
    explain(`No upgrade needed. ${handoff.reason}`)
  } else {
    outcome.status = 'blocked'
    explain(`Blocked by the upgrade policy. ${handoff.reason}`)
  }
}

// Decides whether the app needs an agent run, before the agent or its
// credential are set up. It runs only the dependency install, with scripts
// off, and the pinned CLI.
export async function assessUpgrade({ root, appPath, policy, cliPath }) {
  const path = validateApp({ appPath, policy })
  root = await realpath(root)
  cliPath = await realpath(cliPath)
  const baseSha = (await git(root, ['rev-parse', 'HEAD'])).toString().trim()
  const outcome = { paths: [path], status: 'failed' }
  const explain = (message) => console.error(`${path}: ${message}`)
  const { scratch, privateRoot } = await createScratch(undefined)
  const stage = { name: 'preflight' }
  try {
    const { handoff } = await assessCheckout({
      root,
      path,
      policy,
      cliPath,
      baseSha,
      scratch,
      privateRoot,
      stage,
    })
    if (handoff.status === 'ready') {
      outcome.status = 'ready'
      outcome.targetVersion = handoff.targetVersion
      explain(
        `Ready to upgrade Next.js from ${handoff.installedVersion} to ${handoff.targetVersion}.`
      )
    } else {
      settledOutcome(outcome, handoff, explain)
    }
  } catch (error) {
    // Errors from child processes are already reduced to fixed messages.
    explain(`Failed during ${stage.name}. ${error.message}`)
    outcome.failureStage = stage.name
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
  return { baseSha, outcome }
}

export async function prepareUpgradeCandidate({
  root,
  artifactDirectory,
  appPath,
  policy,
  cliPath,
  authMode,
  credential,
  model,
  effort,
  agentUser,
  runAgent,
}) {
  if (
    !isAuthMode(authMode) ||
    typeof credential !== 'string' ||
    !credential.trim()
  ) {
    throw new Error(
      'A supported agent authentication mode and its credential are required.'
    )
  }
  if (
    agentUser !== undefined &&
    (typeof agentUser !== 'string' || !/^[a-z_][a-z0-9_-]*$/u.test(agentUser))
  ) {
    throw new Error('Invalid agent user.')
  }
  if (
    model !== undefined &&
    (typeof model !== 'string' || !/^[\w.:/[\]-]+$/u.test(model))
  ) {
    throw new Error('Invalid agent model override.')
  }
  if (
    effort !== undefined &&
    (typeof effort !== 'string' || !/^[a-z]+$/u.test(effort))
  ) {
    throw new Error('Invalid agent reasoning effort.')
  }
  const path = validateApp({ appPath, policy })

  root = await realpath(root)
  cliPath = await realpath(cliPath)
  artifactDirectory = resolve(artifactDirectory)
  const baseSha = (await git(root, ['rev-parse', 'HEAD'])).toString().trim()
  const outcome = { paths: [path], status: 'blocked' }
  const index = { baseSha, candidates: [], outcomes: [outcome] }
  // Paths and messages go only to the consumer's own workflow log.
  const explain = (message) => console.error(`${path}: ${message}`)
  const { scratch, privateRoot } = await createScratch(agentUser)
  let agent
  const stage = { name: 'preflight' }
  try {
    await mkdir(artifactDirectory, { recursive: true })
    // Assessment runs again here: the agent needs the installed checkout and
    // guides, and a release published since the first assessment wins.
    const { id, baseRoot, candidateRoot, appDirectory, guides, handoff } =
      await assessCheckout({
        root,
        path,
        policy,
        cliPath,
        baseSha,
        scratch,
        privateRoot,
        stage,
      })
    if (handoff.status !== 'ready') {
      settledOutcome(outcome, handoff, explain)
      return index
    }

    stage.name = 'execution'
    const task = {
      root: candidateRoot,
      guides,
      cwd: appDirectory,
      prompt: handoff.prompt,
    }
    if (runAgent === undefined) {
      agent = await createHostedAgent({
        authMode,
        credential,
        cliPath,
        model,
        effort,
        agentUser,
      })
      await agent.run(task)
      // Return the checkout to this process before reading it.
      await agent.dispose()
      agent = undefined
    } else {
      await runAgent(task)
    }

    stage.name = 'packaging'
    const patch = await withSnapshot(
      {
        source: candidateRoot,
        destination: join(privateRoot, `${id}-snapshot`),
        baseRoot,
        baseSha,
      },
      (snapshotRoot) =>
        candidatePatch({ root: snapshotRoot, baseSha, credential })
    )
    await writeFile(join(artifactDirectory, `${id}.patch`), patch)
    index.candidates.push({
      id,
      path,
      policy,
      fromVersion: handoff.installedVersion,
      targetVersion: handoff.targetVersion,
    })
    outcome.status = 'prepared'
    return index
  } catch (error) {
    // Errors from child processes are already reduced to fixed messages.
    explain(`Failed during ${stage.name}. ${error.message}`)
    outcome.status = 'failed'
    outcome.failureStage = stage.name
    return index
  } finally {
    await agent?.dispose().catch(() => {})
    await writeFile(
      join(artifactDirectory, 'index.json'),
      `${JSON.stringify(index, null, 2)}\n`
    ).catch(() => {})
    await rm(scratch, { recursive: true, force: true })
  }
}

// Sets a step output for the workflow, when it runs in one.
async function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
  }
}

async function main(env) {
  if (env.NEXT_UPGRADE_STAGE === 'assess') {
    // Assessment runs without the agent credential or agent user.
    const { baseSha, outcome } = await assessUpgrade({
      root: env.NEXT_UPGRADE_ROOT,
      appPath: env.NEXT_UPGRADE_APP_PATH,
      policy: env.NEXT_UPGRADE_POLICY,
      cliPath: env.NEXT_UPGRADE_CLI_PATH,
    })
    await setOutput('status', outcome.status)
    await setOutput('base-sha', baseSha)
    return outcome.status !== 'failed'
  }
  const credential = env.NEXT_UPGRADE_AGENT_CREDENTIAL
  delete env.NEXT_UPGRADE_AGENT_CREDENTIAL
  // This process's startup environment still holds the credential, so the
  // agent always runs as another user. Same-user runs are for tests only.
  if (!env.NEXT_UPGRADE_AGENT_USER) {
    throw new Error('An agent user is required.')
  }
  const index = await prepareUpgradeCandidate({
    root: env.NEXT_UPGRADE_ROOT,
    artifactDirectory: env.NEXT_UPGRADE_ARTIFACT_DIR,
    appPath: env.NEXT_UPGRADE_APP_PATH,
    policy: env.NEXT_UPGRADE_POLICY,
    cliPath: env.NEXT_UPGRADE_CLI_PATH,
    authMode: env.NEXT_UPGRADE_AUTH_MODE,
    credential,
    model: env.NEXT_UPGRADE_MODEL || undefined,
    effort: env.NEXT_UPGRADE_EFFORT || undefined,
    agentUser: env.NEXT_UPGRADE_AGENT_USER,
  })
  const [outcome] = index.outcomes
  await setOutput('status', outcome.status)
  // A failed run stops here, so the failure shows on the step that failed.
  return outcome.status !== 'failed'
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (!(await main(process.env))) {
      process.exitCode = 1
    }
  } catch (error) {
    console.error(`Next.js upgrade preparation failed. ${error.message}`)
    process.exitCode = 1
  }
}
