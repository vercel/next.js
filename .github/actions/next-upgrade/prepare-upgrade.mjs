import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
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
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { tmpdir } from 'node:os'
import {
  basename,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, promisify } from 'node:util'
import yaml from 'js-yaml'
import semver from 'semver'

const exec = promisify(execFile)
const policies = new Set(['security', 'latest'])
const authModes = new Set([
  'codex-ai-gateway-api-key',
  'claude-ai-gateway-api-key',
])
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

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

export function candidateKey({ targets, catalog }) {
  const sortedTargets = targets
    .map(({ path, policy }) => ({ path: normalizeUpgradePath(path), policy }))
    .sort((a, b) => {
      const [first, second] =
        a.path === b.path ? [a.policy, b.policy] : [a.path, b.path]
      return first < second ? -1 : Number(first > second)
    })
  const entry =
    catalog === null ? null : { name: catalog.name, dependency: 'next' }
  return createHash('sha256')
    .update(JSON.stringify({ targets: sortedTargets, catalog: entry }))
    .digest('hex')
    .slice(0, 24)
}

function commandEnv() {
  const env = {
    CI: 'true',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1',
  }
  for (const name of [
    'PATH',
    'HOME',
    'USERPROFILE',
    'SystemRoot',
    'TMPDIR',
    'TEMP',
    'TMP',
    'COREPACK_HOME',
    'PNPM_HOME',
    'NEXT_TELEMETRY_DISABLED',
  ]) {
    if (process.env[name] !== undefined) {
      env[name] = process.env[name]
    }
  }
  return env
}

// Removes the key, including a copy cut off at the end of a stopped stream.
function redact(buffer, secret) {
  let text = (buffer ?? Buffer.alloc(0))
    .toString('utf8')
    .split(secret)
    .join('[redacted]')
  for (let length = secret.length - 1; length >= 4; length--) {
    if (text.endsWith(secret.slice(0, length))) {
      text = text.slice(0, -length) + '[redacted]'
      break
    }
  }
  return text
}

// Prints the end of an agent's output to the consumer's own log, without the key.
function showOutput({ stdout, stderr }, secret) {
  const text = redact(stdout, secret) + redact(stderr, secret)
  console.error(text.split('\n').slice(-40).join('\n'))
}

async function run(
  file,
  args,
  { cwd, env, description, timeout = 600_000, secret }
) {
  const options = {
    cwd,
    env: env ?? commandEnv(),
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
    timeout,
    windowsHide: true,
  }
  const started = Date.now()
  let result
  try {
    const pending = exec(file, args, options)
    // Agent CLIs such as `codex exec` wait for more input until stdin closes.
    pending.child.stdin?.end()
    result = await pending
  } catch (error) {
    // Child output can contain credentials, so only agent output is shown, redacted.
    if (secret) {
      showOutput(error, secret)
    }
    const timedOut = error.killed || Date.now() - started >= timeout
    throw new Error(`${description} ${timedOut ? 'timed out' : 'failed'}.`)
  }
  // A child that handles the timeout signal can still exit with status 0.
  if (Date.now() - started >= timeout) {
    if (secret) {
      showOutput(result, secret)
    }
    throw new Error(`${description} timed out.`)
  }
  // Agent runs return both streams so a failed result can be explained.
  return secret ? result : result.stdout
}

function git(cwd, args) {
  return run(
    'git',
    ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args],
    { cwd, description: `Git ${args[0]}` }
  )
}

async function checkout(source, root, baseSha) {
  // Copy the objects so the agent user does not need access to the consumer checkout.
  await git(source, [
    'clone',
    '--no-checkout',
    '--shared',
    '--dissociate',
    '--',
    source,
    root,
  ])
  await git(root, ['remote', 'remove', 'origin'])
  await git(root, ['checkout', '--detach', baseSha])
  await appendFile(
    join(root, '.git', 'info', 'exclude'),
    '\nnode_modules/\n.next/\n.pnpm-store/\n.pnpm-debug.log\n'
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

// An unsupported project setup, reported with its own fixed message.
class SupportError extends Error {}

function parseJson(value, description) {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`Invalid ${description} JSON.`)
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

function parseYamlDocuments(contents, path) {
  try {
    const documents = yaml.loadAll(contents, { schema: yaml.CORE_SCHEMA })
    if (
      !documents.length ||
      documents.some(
        (value) => !value || typeof value !== 'object' || Array.isArray(value)
      )
    ) {
      throw new Error()
    }
    return documents
  } catch {
    throw new Error(`Invalid ${path}.`)
  }
}

function nearestFile(files, start, basename) {
  let directory = start
  for (;;) {
    if (files.has(posix.join(directory, basename))) {
      return directory
    }
    if (directory === '.') {
      return null
    }
    directory = posix.dirname(directory)
  }
}

function catalogReference(specifier) {
  if (typeof specifier !== 'string' || !specifier.startsWith('catalog:')) {
    return undefined
  }
  const name = specifier.slice('catalog:'.length)
  return name === '' || name === 'default' ? null : name
}

function declaredNext(manifest) {
  return dependencyFields
    .filter((field) => Object.hasOwn(manifest[field] ?? {}, 'next'))
    .map((field) => ({ field, specifier: manifest[field].next }))
}

// pnpm locks a package's own copy from its non-peer declaration. A peer-only
// declaration may be locked under a non-peer field (auto-installed peers).
function lockedDeclarations(declarations) {
  const installed = declarations.filter(
    ({ field }) => field !== 'peerDependencies'
  )
  return installed.length > 0 ? installed : declarations
}

// A peer-only catalog member follows its consumers. Some pnpm versions do not
// lock it at all, so it may have no version of its own.
function unlockedPeer(pkg, catalog) {
  return (
    catalog !== null &&
    pkg?.version === null &&
    pkg.declarations.length > 0 &&
    pkg.declarations.every(({ field }) => field === 'peerDependencies')
  )
}

function resolvedNext(importer, declarations) {
  const locked = lockedDeclarations(declarations)
  if (locked.length !== 1) {
    return null
  }
  const [{ field, specifier }] = locked
  const entry =
    field === 'peerDependencies'
      ? dependencyFields
          .map((name) => importer?.[name]?.next)
          .find((candidate) => candidate?.specifier === specifier)
      : importer?.[field]?.next
  const version =
    typeof entry?.version === 'string' ? entry.version.split('(', 1)[0] : null
  return version !== null &&
    entry.specifier === specifier &&
    semver.valid(version) === version
    ? version
    : null
}

// Only the base checkout runs pnpm to list members. pnpm loads project hooks
// such as .pnpmfile.cjs, so trees the agent changed reuse the base's members.
async function readWorkspace(root, workspaceRoot, baseMembers) {
  const workspaceDirectory = join(root, workspaceRoot)
  const workspaceContents = await readProjectFile(
    root,
    posix.join(workspaceRoot, 'pnpm-workspace.yaml'),
    { optional: true }
  )
  const workspaceDocuments =
    workspaceContents === null
      ? []
      : parseYamlDocuments(workspaceContents, 'pnpm-workspace.yaml')
  if (workspaceDocuments.length > 1) {
    throw new Error('Unsupported pnpm workspace configuration.')
  }
  const workspace = workspaceDocuments[0] ?? null
  const lockfileDocuments = parseYamlDocuments(
    await readProjectFile(root, posix.join(workspaceRoot, 'pnpm-lock.yaml')),
    'pnpm-lock.yaml'
  )
  const lockfile = lockfileDocuments.at(-1)
  if (lockfile?.lockfileVersion !== '9.0') {
    throw new SupportError(
      'Scheduled upgrades support pnpm lockfile version 9.0 (pnpm 9 or later).'
    )
  }
  const importers = lockfile.importers
  if (!importers || typeof importers !== 'object' || Array.isArray(importers)) {
    throw new Error(
      'Expected workspace importers in the last pnpm lockfile document.'
    )
  }
  const paths = new Set(
    Object.keys(importers).map((path) => {
      if (path !== normalizeUpgradePath(path)) {
        throw new Error('Invalid pnpm lockfile importer path.')
      }
      return path
    })
  )
  if (baseMembers !== undefined) {
    for (const path of baseMembers) {
      paths.add(path)
    }
  } else if (workspace !== null) {
    const projects = parseJson(
      await run('pnpm', ['list', '--recursive', '--depth', '-1', '--json'], {
        cwd: workspaceDirectory,
        description: 'pnpm workspace discovery',
      }),
      'pnpm workspace list'
    )
    if (!Array.isArray(projects)) {
      throw new Error('Unsupported pnpm workspace list.')
    }
    for (const { path } of projects) {
      if (typeof path !== 'string' || !isAbsolute(path)) {
        throw new Error('Invalid path in pnpm workspace list.')
      }
      paths.add(
        normalizeUpgradePath(
          relative(workspaceDirectory, path).split(sep).join('/') || '.'
        )
      )
    }
  }
  const packages = new Map()
  for (const path of [...paths].sort()) {
    const packagePath = posix.join(workspaceRoot, path)
    const manifest = parseJson(
      await readProjectFile(root, posix.join(packagePath, 'package.json')),
      'package manifest'
    )
    const declarations = declaredNext(manifest)
    packages.set(packagePath, {
      declarations,
      version: resolvedNext(importers[path], declarations),
      importer: importers[path],
    })
  }
  return {
    packages,
    members: paths,
    workspace,
    lockfile,
    lockfileDocuments,
    workspaceRoot,
  }
}

function catalogTable(workspace, name) {
  return name === null ? workspace?.catalog : workspace?.catalogs?.[name]
}

function planGroups({ packages, targets, supportingPaths }) {
  const groups = new Map()
  for (const target of targets) {
    const declarations = packages.get(target.path)?.declarations ?? []
    const names = [
      ...new Set(
        declarations
          .map(({ specifier }) => catalogReference(specifier))
          .filter((name) => name !== undefined)
      ),
    ]
    const catalog =
      names.length === 1 ? { name: names[0], dependency: 'next' } : null
    const key = JSON.stringify(catalog ?? target.path)
    if (!groups.has(key)) {
      groups.set(key, { catalog, targets: [], supportingPaths: [] })
    }
    groups.get(key).targets.push(target)
  }

  for (const group of groups.values()) {
    if (group.catalog === null) {
      continue
    }
    const selected = new Set(group.targets.map(({ path }) => path))
    for (const [path, { declarations }] of packages) {
      if (
        !selected.has(path) &&
        declarations.some(
          ({ specifier }) => catalogReference(specifier) === group.catalog.name
        ) &&
        supportingPaths.has(path)
      ) {
        group.supportingPaths.push(path)
      }
    }
  }
  return groups.values()
}

function groupIsKnown(group, base) {
  const affected = new Set([
    ...group.targets.map(({ path }) => path),
    ...group.supportingPaths,
  ])
  const catalog = group.catalog
  if (
    catalog !== null &&
    (typeof catalogTable(base.workspace, catalog.name)?.next !== 'string' ||
      [...base.packages].some(
        ([path, { declarations }]) =>
          !affected.has(path) &&
          declarations.some(
            ({ specifier }) => catalogReference(specifier) === catalog.name
          )
      ))
  ) {
    return false
  }

  for (const path of affected) {
    const pkg = base.packages.get(path)
    if (
      (!pkg?.version && !unlockedPeer(pkg, catalog)) ||
      (catalog === null
        ? pkg.declarations.length !== 1
        : lockedDeclarations(pkg.declarations).length !== 1) ||
      pkg.declarations.some(({ specifier }) =>
        catalog === null
          ? typeof specifier !== 'string' ||
            semver.validRange(specifier) === null
          : catalogReference(specifier) !== catalog.name
      )
    ) {
      return false
    }
  }

  return (
    catalog === null ||
    new Set(
      [...affected]
        .map((path) => base.packages.get(path).version)
        .filter((version) => version !== null)
    ).size === 1
  )
}

async function assess({ root, cliPath, version, policy }) {
  const response = parseJson(
    await run(
      process.execPath,
      [cliPath, 'internal', 'assess-agent-upgrade', version, policy],
      {
        cwd: root,
        description: 'Next.js upgrade assessment',
      }
    ),
    'Next.js upgrade assessment'
  )
  switch (response?.status) {
    case 'ready':
      if (
        typeof response.targetVersion === 'string' &&
        semver.valid(response.targetVersion) === response.targetVersion &&
        semver.gt(response.targetVersion, version)
      ) {
        return response
      }
      break
    case 'blocked':
    case 'unaffected':
    case 'unknown':
      return response
  }
  throw new Error('Unsupported Next.js upgrade assessment result.')
}

// Installs here only check the lockfile and resolved versions, outside the
// agent's sandbox, so they never run lifecycle scripts the agent may have added.
async function frozenInstall(root) {
  // Copy packages instead of hard-linking them to the runner's store, so
  // handing the checkout to the agent user never hands over store files.
  await run(
    'pnpm',
    [
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
      '--package-import-method=copy',
    ],
    {
      cwd: root,
      description: 'Frozen pnpm install at the workspace root',
    }
  )
}

async function verifyInstalledVersions(root, packages) {
  for (const [path, { version }] of packages) {
    // Peer-only or multiple declarations have no single locked version to check.
    // Unselected packages are compared with the base instead.
    if (version === null) {
      continue
    }
    // Read the link again after install instead of using Node's cached resolution.
    const manifest = await realpath(
      join(root, path, 'node_modules', 'next', 'package.json')
    )
    const manifestPath = normalizeUpgradePath(
      relative(root, manifest).split(sep).join('/')
    )
    const installed = parseJson(
      await readProjectFile(root, manifestPath),
      'installed Next.js manifest'
    )
    if (installed.version !== version) {
      throw new Error(
        'An installed Next.js version disagrees with the pnpm lockfile.'
      )
    }
  }
}

function withoutNextCatalog(data, name, lockfile) {
  const copy = structuredClone(data)
  const table = lockfile
    ? copy.catalogs?.[name ?? 'default']
    : catalogTable(copy, name)
  if (table) {
    delete table.next
  }
  return copy
}

function workspaceLockSettings(lockfile, catalog) {
  const settings =
    catalog === null
      ? { ...lockfile }
      : withoutNextCatalog(lockfile, catalog.name, true)
  for (const field of [
    'importers',
    'packages',
    'snapshots',
    ...dependencyFields,
    'specifiers',
  ]) {
    delete settings[field]
  }
  return settings
}

function verifiesDeclaration(specifier, targetVersion) {
  return (
    typeof specifier === 'string' &&
    semver.minVersion(specifier)?.version === targetVersion &&
    semver.satisfies(targetVersion, specifier)
  )
}

function verifyCandidate({ base, updated, group, targetVersion }) {
  const { catalog } = group
  const affected = new Set([
    ...group.targets.map(({ path }) => path),
    ...group.supportingPaths,
  ])
  if (
    !isDeepStrictEqual(
      [...base.packages.keys()],
      [...updated.packages.keys()]
    ) ||
    !isDeepStrictEqual(
      base.lockfileDocuments.slice(0, -1),
      updated.lockfileDocuments.slice(0, -1)
    ) ||
    !isDeepStrictEqual(
      workspaceLockSettings(base.lockfile, catalog),
      workspaceLockSettings(updated.lockfile, catalog)
    )
  ) {
    throw new Error(
      'The upgrade changed workspace membership or unrelated lockfile settings.'
    )
  }

  if (catalog === null) {
    if (!isDeepStrictEqual(base.workspace, updated.workspace)) {
      throw new Error(
        'An independent upgrade changed the workspace configuration.'
      )
    }
  } else if (
    !updated.workspace ||
    !verifiesDeclaration(
      catalogTable(updated.workspace, catalog.name)?.next,
      targetVersion
    ) ||
    !isDeepStrictEqual(
      withoutNextCatalog(base.workspace, catalog.name, false),
      withoutNextCatalog(updated.workspace, catalog.name, false)
    )
  ) {
    throw new Error(
      'The shared workspace change exceeds the approved Next.js catalog entry.'
    )
  }

  for (const [path, before] of base.packages) {
    const after = updated.packages.get(path)
    if (!affected.has(path)) {
      if (!isDeepStrictEqual(before, after)) {
        throw new Error(
          'The upgrade changed an unselected package declaration or lockfile importer.'
        )
      }
    } else if (
      (after.version !== targetVersion &&
        !(unlockedPeer(before, catalog) && unlockedPeer(after, catalog))) ||
      (catalog === null
        ? after.declarations.length !== 1 ||
          after.declarations[0].field !== before.declarations[0].field ||
          after.declarations[0].specifier ===
            before.declarations[0].specifier ||
          !verifiesDeclaration(after.declarations[0].specifier, targetVersion)
        : !isDeepStrictEqual(before.declarations, after.declarations))
    ) {
      throw new Error(
        'The candidate does not declare and resolve the approved Next.js target.'
      )
    }
  }
  if (
    catalog !== null &&
    updated.lockfile.catalogs?.[catalog.name ?? 'default']?.next?.version !==
      targetVersion
  ) {
    throw new Error(
      'The pnpm lockfile catalog does not resolve the approved version.'
    )
  }
}

function inPackage(file, path) {
  return path === '.' || file === path || file.startsWith(`${path}/`)
}

async function candidatePatch({
  root,
  baseSha,
  base,
  files,
  group,
  credential,
}) {
  if ((await git(root, ['rev-parse', 'HEAD'])).toString().trim() !== baseSha) {
    throw new Error('The candidate changed the checkout commit.')
  }
  await git(root, ['add', '--all'])
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
  const approved = new Set([
    ...group.targets.map(({ path }) => path),
    ...group.supportingPaths,
  ])
  const owners = [...files]
    .filter((file) => posix.basename(file) === 'package.json')
    .map((file) => posix.dirname(file))
    .sort((a, b) => b.length - a.length)
  const lockfile = posix.join(base.workspaceRoot, 'pnpm-lock.yaml')
  const workspaceFile = posix.join(base.workspaceRoot, 'pnpm-workspace.yaml')
  let changedLockfile = false
  let changedWorkspace = false
  for (let i = 0; i + 1 < changes.length; i += 2) {
    const [before, after, , blob] = changes[i].slice(1).split(' ')
    const file = changes[i + 1]
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
    if (file === lockfile) {
      changedLockfile = true
    } else if (file === workspaceFile && group.catalog !== null) {
      changedWorkspace = true
    } else if (
      ['pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(
        posix.basename(file)
      ) ||
      !approved.has(owners.find((path) => inPackage(file, path)))
    ) {
      throw new Error(
        'The candidate contains a file outside the approved package paths.'
      )
    }
    if (
      after !== '000000' &&
      (await git(root, ['cat-file', 'blob', blob])).includes(credential)
    ) {
      throw new Error('The candidate contains the agent credential.')
    }
  }
  if (!changedLockfile || (group.catalog !== null && !changedWorkspace)) {
    throw new Error(
      'The candidate is missing a required shared dependency file change.'
    )
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

const verifiedMessage = 'NEXT_UPGRADE_VERIFIED'
// Upgrading, installing and verifying a group of apps can take a while.
const agentTimeout = 90 * 60_000
const gatewayOrigin = 'https://ai-gateway.vercel.sh'

// Forwards the agent's Gateway requests and adds the key, so the agent and the
// processes it starts only ever hold a placeholder token.
async function startGatewayProxy({ credential, origin, prefix }) {
  const token = `next-upgrade-${randomBytes(24).toString('hex')}`
  const upstream = new URL(origin)
  const send = upstream.protocol === 'https:' ? httpsRequest : httpRequest
  const server = createServer((request, response) => {
    const { authorization, 'x-api-key': apiKey, ...headers } = request.headers
    if (
      !request.url.startsWith(`${prefix}/`) ||
      (authorization !== `Bearer ${token}` && apiKey !== token)
    ) {
      request.resume()
      response.writeHead(403).end()
      return
    }
    delete headers.host
    delete headers.connection
    delete headers['keep-alive']
    headers.authorization = `Bearer ${credential}`
    const forwarded = send(
      new URL(request.url, upstream),
      { method: request.method, headers },
      (reply) => {
        const {
          connection,
          'keep-alive': keepAlive,
          ...replyHeaders
        } = reply.headers
        response.writeHead(reply.statusCode ?? 502, replyHeaders)
        reply.pipe(response)
      }
    )
    forwarded.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502)
      }
      response.end()
    })
    request.pipe(forwarded)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    token,
    url: `http://127.0.0.1:${server.address().port}${prefix}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

// Runs a command as the agent user, which cannot read this process's
// environment or memory, or use sudo. Without a user, runs it directly.
function agentCommand(user, file, args, env) {
  if (user === undefined) {
    return { file, args, env }
  }
  return {
    file: 'sudo',
    args: [
      '-n',
      '-u',
      user,
      '--',
      'env',
      '-i',
      ...Object.entries(env).map(([name, value]) => `${name}=${value}`),
      file,
      ...args,
    ],
    env: commandEnv(),
  }
}

function sudo(args, description) {
  return run('sudo', ['-n', ...args], { description })
}

// Stops everything the agent user started and returns its files to the runner.
async function reclaim(user, paths) {
  await sudo(['pkill', '-KILL', '-u', user], 'Stopping agent processes').catch(
    () => {}
  )
  const owner = `${process.getuid()}:${process.getgid()}`
  for (const path of paths) {
    await sudo(['chown', '-R', owner, path], 'Reclaiming agent files')
  }
}

const isolationProbe = `
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const pids = JSON.parse(process.argv[1])
const environ = pids.some((pid) => {
  try {
    fs.readFileSync('/proc/' + pid + '/environ')
    return true
  } catch {
    return false
  }
})
let sudo = true
try {
  execFileSync('sudo', ['-n', 'true'], { stdio: 'ignore' })
} catch {
  sudo = false
}
console.log(JSON.stringify({ environ, sudo }))
`

// Configure the selected agent once in an isolated home. The Gateway key stays
// in this process; the agent reaches the fixed Gateway endpoint through a local
// proxy with a placeholder token.
export async function createHostedAgent({
  authMode,
  credential,
  cliPath,
  model,
  agentUser,
  origin = gatewayOrigin,
}) {
  const home = await mkdtemp(join(tmpdir(), 'next-upgrade-agent-'))
  let proxy
  try {
    const codex = authMode === 'codex-ai-gateway-api-key'
    const command = codex ? 'codex' : 'claude'
    proxy = await startGatewayProxy({
      credential,
      origin,
      prefix: codex ? '/codex' : '/claude-code',
    })
    const env = {
      ...commandEnv(),
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      GIT_TERMINAL_PROMPT: '0',
    }
    if (codex) {
      env.CODEX_HOME = join(home, '.codex')
      env.AI_GATEWAY_API_KEY = proxy.token
      await mkdir(env.CODEX_HOME)
      await writeFile(
        join(env.CODEX_HOME, 'config.toml'),
        `model_provider = "next_upgrade"
approval_policy = "never"
[model_providers.next_upgrade]
name = "Vercel AI Gateway"
base_url = "${proxy.url}/v1"
env_key = "AI_GATEWAY_API_KEY"
wire_api = "responses"
[sandbox_workspace_write]
network_access = true
[shell_environment_policy]
exclude = ["AI_GATEWAY_API_KEY"]
`
      )
    } else {
      env.CLAUDE_CONFIG_DIR = join(home, '.claude')
      env.ANTHROPIC_BASE_URL = proxy.url
      env.ANTHROPIC_AUTH_TOKEN = proxy.token
      env.ANTHROPIC_API_KEY = ''
    }
    const asAgent = (file, args, options) => {
      const wrapped = agentCommand(agentUser, file, args, env)
      return run(wrapped.file, wrapped.args, { ...options, env: wrapped.env })
    }

    // Match next upgrade --agent: the CLI's default model with its default effort.
    // Discovery starts only the agent CLI, never consumer code, so it runs here.
    let selected = model
    if (selected === undefined) {
      const discovery = parseJson(
        await run(
          process.execPath,
          [cliPath, 'internal', 'agent-upgrade-model', command, command],
          { cwd: home, env, description: 'Agent model discovery' }
        ),
        'agent model discovery'
      )
      if (discovery?.model !== null && typeof discovery?.model !== 'string') {
        throw new Error('Unsupported agent model discovery result.')
      }
      selected = discovery.model
    }
    if (agentUser !== undefined) {
      // Only this process's group can read the agent's reply file.
      await chmod(home, 0o750)
      await sudo(
        ['chown', '-R', `${agentUser}:${process.getgid()}`, home],
        'Handing the agent home over'
      )
      const probe = parseJson(
        await asAgent(
          process.execPath,
          ['-e', isolationProbe, JSON.stringify([process.pid, process.ppid])],
          { cwd: home, description: 'Agent user isolation check' }
        ),
        'agent user isolation check'
      )
      if (probe?.environ !== false || probe?.sudo !== false) {
        throw new Error(
          'The agent user can read the preparation process or use sudo.'
        )
      }
    }

    const modelArgs = selected === null ? [] : ['--model', selected]

    // The checkout stays with the agent user until dispose. After each command
    // no agent process is left, so the files this process reads stay put.
    const handed = new Set()
    const runAsAgent = async (paths, file, args, options) => {
      if (agentUser === undefined) {
        return asAgent(file, args, options)
      }
      for (const path of paths) {
        if (handed.has(path)) {
          continue
        }
        // Other local users cannot enter the checkout; this process reads it
        // through its group.
        await chmod(path, 0o750)
        await sudo(
          ['chown', '-R', `${agentUser}:${process.getgid()}`, path],
          'Handing the checkout over'
        )
        handed.add(path)
      }
      try {
        return await asAgent(file, args, options)
      } finally {
        await sudo(
          ['pkill', '-KILL', '-u', agentUser],
          'Stopping agent processes'
        ).catch(() => {})
      }
    }

    return {
      model: selected,
      async run({ root, guides, cwd, prompt, timeout = agentTimeout }) {
        const paths = guides === undefined ? [root] : [root, guides]
        const instructions = `The checkout is ${JSON.stringify(root)}. Run the app commands from ${JSON.stringify(cwd)}.\n\n${prompt}\n\nAfter completing every required installation and app check, reply with exactly ${verifiedMessage}. If a check fails, describe the failure instead.`
        if (codex) {
          // A new name per run: the agent user owns the home, so this
          // process cannot remove a previous reply there.
          const response = join(
            home,
            `response-${randomBytes(8).toString('hex')}`
          )
          const output = await runAsAgent(
            paths,
            'codex',
            [
              'exec',
              ...modelArgs,
              '--skip-git-repo-check',
              '--sandbox',
              'workspace-write',
              '--add-dir',
              root,
              '--output-last-message',
              response,
              instructions,
            ],
            {
              cwd: home,
              timeout,
              secret: credential,
              description: 'Codex upgrade and verification',
            }
          )
          const message = await readFile(response, 'utf8').catch(() => '')
          if (message.trim() !== verifiedMessage) {
            showOutput(output, credential)
            throw new Error('Codex did not confirm app verification.')
          }
          return
        }
        const output = await runAsAgent(
          paths,
          'claude',
          [
            '--print',
            ...modelArgs,
            '--output-format',
            'json',
            '--no-session-persistence',
            '--permission-mode',
            'bypassPermissions',
            '--setting-sources',
            '',
            '--strict-mcp-config',
            '--add-dir',
            root,
            '--',
            instructions,
          ],
          {
            cwd: home,
            timeout,
            secret: credential,
            description: 'Claude upgrade and verification',
          }
        )
        let response = null
        try {
          response = JSON.parse(output.stdout.toString('utf8'))
        } catch {}
        if (
          response?.is_error !== false ||
          response.result?.trim() !== verifiedMessage
        ) {
          showOutput(output, credential)
          throw new Error('Claude did not confirm app verification.')
        }
      },
      // Installs after the agent run read files the agent changed, so they run
      // as the agent user as well.
      install(root, cwd) {
        return runAsAgent(
          [root],
          'pnpm',
          [
            'install',
            '--frozen-lockfile',
            '--ignore-scripts',
            '--package-import-method=copy',
          ],
          { cwd, description: 'Frozen pnpm install at the workspace root' }
        )
      },
      async dispose() {
        await proxy.close()
        if (agentUser !== undefined) {
          await reclaim(agentUser, [home, ...handed])
        }
        await rm(home, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await proxy?.close()
    if (agentUser !== undefined) {
      await reclaim(agentUser, [home]).catch(() => {})
    }
    await rm(home, { recursive: true, force: true })
    throw error
  }
}

export async function prepareUpgradeCandidates({
  root,
  artifactDirectory,
  targets,
  supportingPaths,
  cliPath,
  authMode,
  credential,
  model,
  agentUser,
  runAgent,
  // The workflow job allows 300 minutes; keep time to verify and upload.
  budget = 270 * 60_000,
}) {
  const deadline = Date.now() + budget
  if (
    !authModes.has(authMode) ||
    typeof credential !== 'string' ||
    !credential.trim()
  ) {
    throw new Error(
      'A Vercel AI Gateway authentication mode and its credential are required.'
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
    (typeof model !== 'string' || !/^[\w.:/-]+$/u.test(model))
  ) {
    throw new Error('Invalid agent model override.')
  }
  if (
    !Array.isArray(targets) ||
    targets.length === 0 ||
    !Array.isArray(supportingPaths)
  ) {
    throw new Error('Expected selected targets and supporting paths.')
  }
  const selected = new Set()
  const normalizedTargets = targets.map((target) => {
    const path = normalizeUpgradePath(target?.path)
    if (!policies.has(target.policy) || selected.has(path)) {
      throw new Error(
        'Each selected path must have one supported upgrade policy.'
      )
    }
    selected.add(path)
    return { path, policy: target.policy }
  })
  const supporting = new Set()
  for (const value of supportingPaths) {
    const path = normalizeUpgradePath(value)
    if (supporting.has(path) || selected.has(path)) {
      throw new Error(
        'Supporting paths must be unique and separate from upgrade targets.'
      )
    }
    supporting.add(path)
  }

  root = await realpath(root)
  cliPath = await realpath(cliPath)
  artifactDirectory = resolve(artifactDirectory)
  const baseSha = (await git(root, ['rev-parse', 'HEAD'])).toString().trim()
  const index = { baseSha, candidates: [], outcomes: [] }
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'next-upgrade-')))
  // The base clone, handoffs and verification copies stay private to this
  // process; only candidate checkouts are handed to the agent user.
  const privateRoot = join(scratch, 'private')
  await mkdir(privateRoot, { mode: 0o700 })
  if (agentUser !== undefined) {
    // Only the agent user's group can pass through to its checkout.
    await sudo(['chgrp', agentUser, scratch], 'Sharing the scratch directory')
    await chmod(scratch, 0o710)
  }
  let hostedAgent
  try {
    const baseRoot = join(privateRoot, 'base')
    await checkout(root, baseRoot, baseSha)
    const files = new Set(
      (await git(baseRoot, ['ls-tree', '-r', '-z', '--name-only', baseSha]))
        .toString()
        .split('\0')
        .filter(Boolean)
    )
    const workspaceTargets = new Map()
    for (const target of normalizedTargets) {
      const workspaceRoot = nearestFile(files, target.path, 'pnpm-lock.yaml')
      const workspaceConfig = nearestFile(
        files,
        target.path,
        'pnpm-workspace.yaml'
      )
      if (
        workspaceRoot === null ||
        (workspaceConfig !== null && workspaceConfig !== workspaceRoot)
      ) {
        index.outcomes.push({ paths: [target.path], status: 'blocked' })
        continue
      }
      if (!workspaceTargets.has(workspaceRoot)) {
        workspaceTargets.set(workspaceRoot, [])
      }
      workspaceTargets.get(workspaceRoot).push(target)
    }

    const plans = []
    for (const [workspaceRoot, targets] of workspaceTargets) {
      try {
        const base = await readWorkspace(baseRoot, workspaceRoot)
        for (const group of planGroups({
          packages: base.packages,
          targets,
          supportingPaths: supporting,
        })) {
          plans.push({ base, group })
        }
      } catch (error) {
        console.error(
          error instanceof SupportError
            ? error.message
            : 'Could not read the pnpm workspace and its lockfile.'
        )
        index.outcomes.push(
          ...targets.map(({ path }) => ({
            paths: [path],
            status: 'failed',
            failureStage: 'preflight',
          }))
        )
      }
    }

    await mkdir(artifactDirectory, { recursive: true })
    for (const { base, group } of plans) {
      const { workspaceRoot } = base
      const paths = group.targets.map(({ path }) => path).sort()
      const outcome = { paths, status: 'blocked' }
      index.outcomes.push(outcome)
      // Paths and messages go only to the consumer's own workflow log.
      const explain = (message) =>
        console.error(`${paths.join(', ')}: ${message}`)
      if (!groupIsKnown(group, base)) {
        explain(
          'Blocked: every package that shares the Next.js catalog entry must be approved, and each must declare and lock one Next.js version.'
        )
        continue
      }

      let failureStage = 'assessment'
      try {
        const assessments = []
        for (const { path, policy } of group.targets) {
          assessments.push(
            await assess({
              root: baseRoot,
              cliPath,
              version: base.packages.get(path).version,
              policy,
            })
          )
        }
        const reasons = [
          ...new Set(assessments.map(({ reason }) => reason).filter(Boolean)),
        ].join(' ')
        if (assessments.some(({ status }) => status === 'unknown')) {
          outcome.status = 'failed'
          outcome.failureStage = 'assessment'
          explain(`Assessment failed. ${reasons}`)
          continue
        }
        if (assessments.every(({ status }) => status === 'unaffected')) {
          outcome.status = 'no_upgrade'
          explain(`No upgrade needed. ${reasons}`)
          continue
        }
        const { targetVersion } = assessments[0]
        if (
          !assessments.every(
            (assessment) =>
              assessment.status === 'ready' &&
              assessment.targetVersion === targetVersion
          )
        ) {
          explain(
            assessments.some(({ status }) => status === 'blocked')
              ? `Blocked by the upgrade policy. ${reasons}`
              : `Blocked: the selected policies do not agree on one target. ${reasons}`
          )
          continue
        }

        failureStage = 'preflight'
        // Skip a group's setup once the budget cannot cover an agent run, so the
        // job still uploads what it verified before its time limit.
        if (deadline - Date.now() < 30 * 60_000) {
          throw new Error(
            'The preparation time budget is exhausted. Later groups run on the next schedule.'
          )
        }
        const id = candidateKey(group)
        const candidateRoot = join(scratch, id)
        await checkout(root, candidateRoot, baseSha)
        const workspaceDirectory = join(candidateRoot, workspaceRoot)
        await frozenInstall(workspaceDirectory)
        await verifyInstalledVersions(candidateRoot, base.packages)
        if (
          (await git(candidateRoot, ['status', '--porcelain', '-z'])).length !==
          0
        ) {
          throw new Error(
            'The baseline install changed the candidate checkout.'
          )
        }

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
        const prompts = []
        // The CLI writes its guides here, outside the private directory, so
        // the agent user can read them.
        const guides = join(scratch, `${id}-guides`)
        for (const { path, policy } of group.targets) {
          const handoffPath = join(privateRoot, `${id}-${prompts.length}.json`)
          await run(
            process.execPath,
            [cliPath, 'upgrade', '.', `--agent=${policy}`],
            {
              cwd: join(candidateRoot, path),
              env: {
                ...commandEnv(),
                __NEXT_UPGRADE_EXPECTED_CLI_VERSION: cliVersion,
                __NEXT_AGENT_UPGRADE_CI_TARGET: targetVersion,
                __NEXT_AGENT_UPGRADE_CI_HANDOFF: handoffPath,
                __NEXT_AGENT_UPGRADE_CI_GUIDES: join(
                  guides,
                  String(prompts.length)
                ),
              },
              description: 'Pinned Next.js upgrade handoff',
            }
          )
          const handoff = parseJson(
            await readFile(handoffPath, 'utf8'),
            'Next.js upgrade handoff'
          )
          if (
            handoff?.targetVersion !== targetVersion ||
            typeof handoff.prompt !== 'string' ||
            !handoff.prompt.trim()
          ) {
            throw new Error(
              'Unsupported Next.js upgrade handoff or target mismatch.'
            )
          }
          prompts.push(handoff.prompt)
        }
        if (
          (await git(candidateRoot, ['status', '--porcelain', '-z'])).length !==
          0
        ) {
          throw new Error('The CLI handoff changed the candidate checkout.')
        }

        if (runAgent === undefined) {
          hostedAgent ??= createHostedAgent({
            authMode,
            credential,
            cliPath,
            model,
            agentUser,
          })
          await hostedAgent
        }

        failureStage = 'execution'
        const catalogGuide =
          group.catalog === null
            ? ''
            : `\nUpdate the Next.js entry of the ${group.catalog.name === null ? 'default' : JSON.stringify(group.catalog.name)} pnpm catalog in pnpm-workspace.yaml once. Preserve each package's catalog reference. Update the root pnpm lockfile and verify every selected app.`
        const prompt = `Upgrade Next.js to ${targetVersion} in the selected packages ${JSON.stringify(paths)}. Approved supporting packages are ${JSON.stringify(group.supportingPaths)}. Keep changes inside these packages and the shared dependency files required for this upgrade. Perform a frozen pnpm install in the pnpm workspace at ${JSON.stringify(workspaceDirectory)} and verify every selected app before finishing.${catalogGuide}\n\n${prompts.join('\n\n')}`
        // Leave time after the agent for verification and later uploads.
        const remaining = deadline - Date.now() - 20 * 60_000
        if (remaining < 10 * 60_000) {
          failureStage = 'preflight'
          throw new Error(
            'The preparation time budget is exhausted. Later groups run on the next schedule.'
          )
        }
        const task = {
          timeout: Math.min(agentTimeout, remaining),
          root: candidateRoot,
          guides,
          cwd: join(candidateRoot, group.targets[0].path),
          prompt,
        }
        const agent = runAgent ? undefined : await hostedAgent
        await (agent ? agent.run(task) : runAgent(task))

        failureStage = 'verification'
        // Stage the verified tree before installation so install scripts cannot add changes to the patch.
        const patchInputs = { baseSha, base, files, group, credential }
        const patch = await withSnapshot(
          {
            source: candidateRoot,
            destination: join(privateRoot, `${id}-verified`),
            baseRoot,
            baseSha,
          },
          async (verified) => {
            const updated = await readWorkspace(
              verified,
              workspaceRoot,
              base.members
            )
            verifyCandidate({ base, updated, group, targetVersion })
            return candidatePatch({ ...patchInputs, root: verified })
          }
        )
        await (agent
          ? agent.install(candidateRoot, workspaceDirectory)
          : frozenInstall(workspaceDirectory))
        const installedWorkspace = await readWorkspace(
          candidateRoot,
          workspaceRoot,
          base.members
        )
        verifyCandidate({
          base,
          updated: installedWorkspace,
          group,
          targetVersion,
        })
        await verifyInstalledVersions(
          candidateRoot,
          installedWorkspace.packages
        )
        const installedPatch = await withSnapshot(
          {
            source: candidateRoot,
            destination: join(privateRoot, `${id}-installed`),
            baseRoot,
            baseSha,
          },
          (installed) => candidatePatch({ ...patchInputs, root: installed })
        )
        if (!patch.equals(installedPatch)) {
          throw new Error('The frozen install changed the candidate patch.')
        }
        await writeFile(join(artifactDirectory, `${id}.patch`), patch)
        index.candidates.push({
          id,
          workspaceRoot,
          targets: group.targets.map(({ path, policy }) => ({
            path,
            policy,
            fromVersion: base.packages.get(path).version,
            targetVersion,
          })),
          supportingPaths: group.supportingPaths,
          catalog: group.catalog,
        })
        outcome.status = 'prepared'
      } catch (error) {
        // Errors from child processes are already reduced to fixed messages.
        explain(`Failed during ${failureStage}. ${error.message}`)
        outcome.status = 'failed'
        outcome.failureStage = failureStage
      }
    }
    await writeFile(
      join(artifactDirectory, 'index.json'),
      `${JSON.stringify(index, null, 2)}\n`
    )
    return index
  } finally {
    await hostedAgent?.then(
      (agent) => agent.dispose(),
      () => {}
    )
    await rm(scratch, { recursive: true, force: true })
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const env = process.env
  const credential = env.NEXT_UPGRADE_AGENT_CREDENTIAL
  delete env.NEXT_UPGRADE_AGENT_CREDENTIAL
  try {
    await prepareUpgradeCandidates({
      root: env.NEXT_UPGRADE_ROOT,
      artifactDirectory: env.NEXT_UPGRADE_ARTIFACT_DIR,
      targets: parseJson(env.NEXT_UPGRADE_TARGETS, 'NEXT_UPGRADE_TARGETS'),
      supportingPaths: parseJson(
        env.NEXT_UPGRADE_SUPPORTING_PATHS,
        'NEXT_UPGRADE_SUPPORTING_PATHS'
      ),
      cliPath: env.NEXT_UPGRADE_CLI_PATH,
      authMode: env.NEXT_UPGRADE_AUTH_MODE,
      credential,
      model: env.NEXT_UPGRADE_MODEL || undefined,
      agentUser: env.NEXT_UPGRADE_AGENT_USER || undefined,
    })
  } catch (error) {
    console.error(`Next.js upgrade preparation failed. ${error.message}`)
    process.exitCode = 1
  }
}
