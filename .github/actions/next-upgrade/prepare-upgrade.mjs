import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
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
import { basename, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import semver from 'semver'

const exec = promisify(execFile)
const policies = new Set(['security', 'latest'])
// Each authentication mode, the agent CLI it runs, and, for an API key, where
// its proxy sends requests. The proxy adds the key, so the agent never holds
// it. A subscription token goes to Claude Code itself, the way Anthropic's own
// GitHub Action passes it, because only Claude Code may use it.
const providers = {
  'codex-openai-api-key': {
    command: 'codex',
    origin: 'https://api.openai.com',
    name: 'OpenAI',
    authorize(headers, credential) {
      headers.authorization = `Bearer ${credential}`
    },
  },
  'claude-anthropic-api-key': {
    command: 'claude',
    origin: 'https://api.anthropic.com',
    name: 'Anthropic',
    authorize(headers, credential) {
      headers['x-api-key'] = credential
      headers['anthropic-version'] ??= '2023-06-01'
    },
  },
  'claude-subscription': {
    command: 'claude',
  },
}

// Lists the provider's models, which uses no tokens, so a rejected key fails
// before the agent is set up.
async function checkApiKey(provider, origin, credential) {
  const headers = {}
  provider.authorize(headers, credential)
  let response
  try {
    response = await fetch(new URL('/v1/models', origin), { headers })
  } catch (error) {
    throw new Error(`Could not reach ${provider.name} to check the API key.`, {
      cause: error,
    })
  }
  await response.body?.cancel()
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `${provider.name} rejected the API key in NEXT_UPGRADE_AGENT_CREDENTIAL (HTTP ${response.status}).`
    )
  }
  if (!response.ok) {
    throw new Error(
      `${provider.name} did not accept the API key check (HTTP ${response.status}).`
    )
  }
}

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

// On hosted runners the agent user can write to directories early in PATH,
// such as the Node.js tool cache, so this process runs Git and sudo from
// their system location with a fixed PATH.
// Tests point NEXT_UPGRADE_SYSTEM_PATH at stand-in commands; the workflow
// never sets it.
function systemPath() {
  return process.env.NEXT_UPGRADE_SYSTEM_PATH || '/usr/bin:/bin'
}

function systemCommand(name) {
  for (const directory of systemPath().split(':')) {
    if (existsSync(join(directory, name))) {
      return join(directory, name)
    }
  }
  return name
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

const verifiedMessage = 'NEXT_UPGRADE_VERIFIED'
// The Claude Code tools an upgrade uses: reading the guides, editing the app
// and running its install, build and checks.
const claudeTools = 'Bash,Read,Edit,Write,Glob,Grep'
// Upgrading, installing and verifying an app can take a while.
const agentTimeout = 90 * 60_000
// Forwards the agent's API requests and adds the credential, so the agent and
// the processes it starts only ever hold a placeholder token.
async function startAgentProxy({ origin, prefix, authorize }) {
  const token = `next-upgrade-${randomBytes(24).toString('hex')}`
  const upstream = new URL(origin)
  const send = upstream.protocol === 'https:' ? httpsRequest : httpRequest
  const server = createServer((request, response) => {
    const { authorization, 'x-api-key': apiKey, ...headers } = request.headers
    // Check the path the request reaches after `..` segments are resolved.
    const target = new URL(request.url, upstream)
    if (
      !request.url.startsWith(`${prefix}/`) ||
      target.origin !== upstream.origin ||
      !target.pathname.startsWith(`${prefix}/`) ||
      (authorization !== `Bearer ${token}` && apiKey !== token)
    ) {
      request.resume()
      response.writeHead(403).end()
      return
    }
    delete headers.host
    delete headers.connection
    delete headers['keep-alive']
    authorize(headers)
    const forwarded = send(
      target,
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
  const local = `http://127.0.0.1:${server.address().port}`
  return {
    token,
    origin: local,
    url: `${local}${prefix}`,
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
    file: systemCommand('sudo'),
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
  return run(systemCommand('sudo'), ['-n', ...args], {
    env: { ...commandEnv(), PATH: systemPath() },
    description,
  })
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

// Configure the selected agent once in an isolated home. An API key stays in
// this process; the agent reaches the fixed provider API through a local proxy
// with a placeholder token.
export async function createHostedAgent({
  authMode,
  credential,
  cliPath,
  model,
  effort,
  agentUser,
  origin,
}) {
  const home = await mkdtemp(join(tmpdir(), 'next-upgrade-agent-'))
  let proxy
  try {
    const provider = providers[authMode]
    const { command } = provider
    const codex = command === 'codex'
    const env = {
      ...commandEnv(),
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      GIT_TERMINAL_PROMPT: '0',
    }
    if (provider.origin !== undefined) {
      const upstream = origin ?? provider.origin
      await checkApiKey(provider, upstream, credential)
      proxy = await startAgentProxy({
        origin: upstream,
        prefix: '/v1',
        authorize: (headers) => provider.authorize(headers, credential),
      })
    }
    if (codex) {
      env.CODEX_HOME = join(home, '.codex')
      env.NEXT_UPGRADE_PROXY_TOKEN = proxy.token
      await mkdir(env.CODEX_HOME)
      await writeFile(
        join(env.CODEX_HOME, 'config.toml'),
        `model_provider = "next_upgrade"
approval_policy = "never"
[model_providers.next_upgrade]
name = "OpenAI"
base_url = "${proxy.url}"
env_key = "NEXT_UPGRADE_PROXY_TOKEN"
wire_api = "responses"
[sandbox_workspace_write]
network_access = true
[shell_environment_policy]
exclude = ["NEXT_UPGRADE_PROXY_TOKEN"]
`
      )
    } else {
      env.CLAUDE_CONFIG_DIR = join(home, '.claude')
      env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
      if (proxy === undefined) {
        // The subscription token, read by Claude Code as its documented CI
        // credential. Nothing set here outranks it. The scrub keeps it out of
        // the commands Claude Code runs, such as the app's install scripts.
        env.CLAUDE_CODE_OAUTH_TOKEN = credential
        env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = '1'
      } else {
        env.ANTHROPIC_BASE_URL = proxy.origin
        env.ANTHROPIC_API_KEY = proxy.token
      }
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
    // The same reasoning effort flags `next upgrade --agent` passes.
    if (effort !== undefined) {
      modelArgs.push(
        ...(codex
          ? ['-c', `model_reasoning_effort=${effort}`]
          : ['--effort', effort])
      )
    }

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
            // With the subprocess scrub on, Claude Code ignores the permission
            // mode, so the tools the upgrade needs are allowed by name.
            '--allowedTools',
            claudeTools,
            ...paths.flatMap((path) => ['--add-dir', path]),
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
      async dispose() {
        await proxy?.close()
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
    !Object.hasOwn(providers, authMode) ||
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
    (typeof model !== 'string' || !/^[\w.:/-]+$/u.test(model))
  ) {
    throw new Error('Invalid agent model override.')
  }
  if (
    effort !== undefined &&
    (typeof effort !== 'string' || !/^[a-z]+$/u.test(effort))
  ) {
    throw new Error('Invalid agent reasoning effort.')
  }
  if (!policies.has(policy)) {
    throw new Error('Use the security or latest upgrade policy.')
  }
  const path = normalizeUpgradePath(appPath)

  root = await realpath(root)
  cliPath = await realpath(cliPath)
  artifactDirectory = resolve(artifactDirectory)
  const baseSha = (await git(root, ['rev-parse', 'HEAD'])).toString().trim()
  const outcome = { paths: [path], status: 'blocked' }
  const index = { baseSha, candidates: [], outcomes: [outcome] }
  // Paths and messages go only to the consumer's own workflow log.
  const explain = (message) => console.error(`${path}: ${message}`)
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'next-upgrade-')))
  // The base clone, handoff and snapshot stay private to this process; only
  // the candidate checkout and guides are handed to the agent user.
  const privateRoot = join(scratch, 'private')
  await mkdir(privateRoot, { mode: 0o700 })
  if (agentUser !== undefined) {
    // Only the agent user's group can pass through to its checkout.
    await sudo(['chgrp', agentUser, scratch], 'Sharing the scratch directory')
    await chmod(scratch, 0o710)
  }
  let agent
  let failureStage = 'preflight'
  try {
    await mkdir(artifactDirectory, { recursive: true })
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

    const id = candidateKey({ path, policy })
    const candidateRoot = join(scratch, id)
    const appDirectory = join(candidateRoot, path)
    await checkout(root, candidateRoot, baseSha)
    // The CLI reads the installed Next.js version, as for a local
    // `next upgrade --agent`. Scripts stay off outside the agent's sandbox.
    await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: appDirectory,
      description: 'Dependency install',
    })

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

    failureStage = 'assessment'
    const handoffPath = join(privateRoot, 'handoff.json')
    // The CLI writes its guides here, outside the private directory, so the
    // agent user can read them.
    const guides = join(scratch, `${id}-guides`)
    await run(
      process.execPath,
      [cliPath, 'upgrade', '.', `--agent=${policy}`],
      {
        cwd: appDirectory,
        env: {
          ...commandEnv(),
          __NEXT_UPGRADE_EXPECTED_CLI_VERSION: cliVersion,
          __NEXT_AGENT_UPGRADE_CI_HANDOFF: handoffPath,
          __NEXT_AGENT_UPGRADE_CI_GUIDES: guides,
        },
        description: 'Pinned Next.js upgrade handoff',
      }
    )
    const handoff = readHandoff(await readFile(handoffPath, 'utf8'))
    if (handoff.status === 'unaffected') {
      outcome.status = 'no_upgrade'
      explain(`No upgrade needed. ${handoff.reason}`)
      return index
    }
    if (handoff.status === 'blocked') {
      explain(`Blocked by the upgrade policy. ${handoff.reason}`)
      return index
    }
    if (handoff.status === 'unknown') {
      throw new Error(handoff.reason)
    }
    if (
      (await git(candidateRoot, ['status', '--porcelain', '-z'])).length !== 0
    ) {
      throw new Error('The CLI handoff changed the candidate checkout.')
    }

    failureStage = 'execution'
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

    failureStage = 'packaging'
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
    explain(`Failed during ${failureStage}. ${error.message}`)
    outcome.status = 'failed'
    outcome.failureStage = failureStage
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

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const env = process.env
  const credential = env.NEXT_UPGRADE_AGENT_CREDENTIAL
  delete env.NEXT_UPGRADE_AGENT_CREDENTIAL
  try {
    // Publication reports a failed outcome, so preparation itself succeeds.
    await prepareUpgradeCandidate({
      root: env.NEXT_UPGRADE_ROOT,
      artifactDirectory: env.NEXT_UPGRADE_ARTIFACT_DIR,
      appPath: env.NEXT_UPGRADE_APP_PATH,
      policy: env.NEXT_UPGRADE_POLICY,
      cliPath: env.NEXT_UPGRADE_CLI_PATH,
      authMode: env.NEXT_UPGRADE_AUTH_MODE,
      credential,
      model: env.NEXT_UPGRADE_MODEL || undefined,
      effort: env.NEXT_UPGRADE_EFFORT || undefined,
      agentUser: env.NEXT_UPGRADE_AGENT_USER || undefined,
    })
  } catch (error) {
    console.error(`Next.js upgrade preparation failed. ${error.message}`)
    process.exitCode = 1
  }
}
