// The hosted agent for a scheduled upgrade: Codex or Claude Code, run as a
// separate user, with the credential kept out of its reach where possible.
import { randomBytes } from 'node:crypto'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream'

import {
  commandEnv,
  parseJson,
  reclaim,
  run,
  showOutput,
  sudo,
  systemCommand,
} from './process.mjs'

// Each authentication mode, the agent CLI it runs, and, for an API key, where
// its proxy sends requests. The proxy adds the key, so the agent never holds
// it. A subscription token goes to Claude Code itself, the way Anthropic's own
// GitHub Action passes it, because only Claude Code may use it.
const providers = {
  'codex-openai-api-key': {
    command: 'codex',
    origin: 'https://api.openai.com',
    name: 'OpenAI',
    // The Responses API calls Codex makes. The app's commands can reach the
    // proxy, so nothing else the key could do, such as files, is forwarded.
    endpoints: [
      'POST /v1/responses',
      'POST /v1/responses/compact',
      'GET /v1/models',
    ],
    authorize(headers, credential) {
      headers.authorization = `Bearer ${credential}`
    },
  },
  'claude-anthropic-api-key': {
    command: 'claude',
    origin: 'https://api.anthropic.com',
    name: 'Anthropic',
    // The Messages API calls Claude Code makes, for the same reason.
    endpoints: [
      'POST /v1/messages',
      'POST /v1/messages/count_tokens',
      'GET /v1/models',
    ],
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

export function isAuthMode(authMode) {
  return typeof authMode === 'string' && Object.hasOwn(providers, authMode)
}

const verifiedMessage = 'NEXT_UPGRADE_VERIFIED'
// The Claude Code tools an upgrade uses: reading the guides, editing the app
// and running its install, build and checks.
const claudeTools = 'Bash,Read,Edit,Write,Glob,Grep'
// Upgrading, installing and verifying an app can take a while.
const agentTimeout = 90 * 60_000
// Forwards the agent's inference requests and adds the credential, so the
// agent and the processes it starts only ever hold a placeholder token, and
// that token reaches only the listed endpoints.
async function startAgentProxy({ origin, prefix, endpoints, authorize }) {
  const allowed = new Set(endpoints)
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
    if (!allowed.has(`${request.method} ${target.pathname}`)) {
      // Name the refused call, so a CLI that needs another endpoint shows up
      // in the run log.
      console.error(
        `The agent proxy refused ${request.method} ${target.pathname}.`
      )
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
        // A provider reset partway through a stream also ends the agent's
        // response, so the agent CLI does not wait for more.
        pipeline(reply, response, () => {})
      }
    )
    forwarded.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502)
      }
      response.end()
    })
    // An agent that stops waiting also stops the provider request.
    response.on('close', () => forwarded.destroy())
    pipeline(request, forwarded, () => {})
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

// Reads one secret variable from stdin, then starts the command with stdin
// closed, so the value is never part of a command line.
const readSecret = (name) =>
  `IFS= read -r ${name} && export ${name} && exec "$@" </dev/null`

// Runs a command as the agent user, which cannot read this process's
// environment or memory, or use sudo. Without a user, runs it directly.
// `secret` is one variable the command needs that must stay off every
// command line; it reaches the command through stdin.
function agentCommand(user, file, args, env, secret) {
  if (user === undefined) {
    return {
      file,
      args,
      env: secret ? { ...env, [secret.name]: secret.value } : env,
    }
  }
  const command = secret
    ? ['/bin/sh', '-c', readSecret(secret.name), 'sh', file, ...args]
    : [file, ...args]
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
      ...command,
    ],
    env: commandEnv(),
    input: secret ? `${secret.value}\n` : undefined,
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
        endpoints: provider.endpoints,
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
        // The scrub keeps the subscription token out of the commands Claude
        // Code runs, such as the app's install scripts, and with bubblewrap
        // runs them in their own PID namespace, where they cannot read Claude
        // Code's environment.
        env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = '1'
      } else {
        env.ANTHROPIC_BASE_URL = proxy.origin
        env.ANTHROPIC_API_KEY = proxy.token
      }
    }
    // The subscription token, read by Claude Code as its documented CI
    // credential. Only the agent run itself receives it.
    const secret =
      proxy === undefined
        ? { name: 'CLAUDE_CODE_OAUTH_TOKEN', value: credential }
        : undefined
    const asAgent = (file, args, options, withSecret) => {
      const wrapped = agentCommand(
        agentUser,
        file,
        args,
        env,
        withSecret ? secret : undefined
      )
      return run(wrapped.file, wrapped.args, {
        ...options,
        env: wrapped.env,
        input: wrapped.input,
      })
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
      if (secret !== undefined) {
        // Claude Code holds the subscription token itself, so the app's
        // scripts must not see its process. Check that bubblewrap can give
        // the agent user a PID namespace that hides this process.
        await asAgent(
          systemCommand('bwrap'),
          [
            '--ro-bind',
            '/',
            '/',
            '--dev',
            '/dev',
            '--proc',
            '/proc',
            '--unshare-pid',
            '--die-with-parent',
            '--',
            '/bin/sh',
            '-c',
            `test ! -d /proc/${process.pid}`,
          ],
          { cwd: home, description: 'Agent process isolation check' }
        ).catch(() => {
          throw new Error(
            'A Claude subscription token needs bubblewrap process isolation for the agent user, which is not available on this runner.'
          )
        })
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
        return asAgent(file, args, options, true)
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
        return await asAgent(file, args, options, true)
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
