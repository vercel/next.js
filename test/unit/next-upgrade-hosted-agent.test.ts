import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const sourceRoot = resolve(__dirname, '../..')
const actionRoot = join(sourceRoot, '.github/actions/next-upgrade')
// Each agent run starts a few local processes.
const prepareTimeout = 600_000

function runScript<T>(script: string, input: unknown, cwd: string): T {
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script, JSON.stringify(input)],
    { cwd, encoding: 'utf8', timeout: prepareTimeout }
  )
  return JSON.parse(output.trimEnd().split('\n').pop()!) as T
}

// A stand-in sudo that records each call, runs commands as the agent user
// without switching users, and refuses the agent user's own sudo.
function writeFakeSudo(directory: string, { allowAgentSudo = false } = {}) {
  const log = join(directory, 'sudo.log')
  writeFileSync(
    join(directory, 'sudo'),
    `#!/bin/sh
{ printf '%s' "$*" | tr '\\n' ' '; echo; } >> "${log}"
[ "$1" = -n ] && shift
case "$1" in
  -u)
    shift 3
    # The same user can read its own /proc entries, so answer the
    # isolation probe the way a separate user without sudo would.
    case "$*" in
      *environ*) echo '{"environ":false,"sudo":${allowAgentSudo}}'; exit 0 ;;
    esac
    exec "$@" ;;
  chown|chgrp|pkill) exit 0 ;;
esac
exit 2
`,
    { mode: 0o700 }
  )
  return () => readFileSync(log, 'utf8').split('\n').filter(Boolean)
}

const builtNext = require.resolve('next/dist/bin/next')

// A stand-in agent CLI that answers model discovery and records each run.
function writeFakeAgent(
  directory: string,
  name: 'codex' | 'claude',
  {
    models,
    exitEarly = false,
    unverified = false,
    hang = false,
  }: {
    models: unknown[]
    exitEarly?: boolean
    unverified?: boolean
    hang?: boolean
  }
) {
  const script = join(directory, `${name}-agent.cjs`)
  const report = join(directory, `${name}-runs.jsonl`)
  writeFileSync(
    script,
    `const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const args = process.argv.slice(2)
const { env } = process
const models = ${JSON.stringify(models)}
const discovery = args[0] === 'app-server' || args.includes('stream-json')
if (discovery) {
  if (${exitEarly}) process.exit(1)
  const lines = readline.createInterface({ input: process.stdin })
  lines.on('line', (line) => {
    const message = JSON.parse(line)
    if (message.method === 'initialize') {
      console.log(JSON.stringify({ id: message.id, result: {} }))
    } else if (message.method === 'model/list') {
      console.log(JSON.stringify({ id: message.id, result: { data: models, nextCursor: null } }))
    } else if (message.type === 'control_request') {
      console.log(JSON.stringify({ type: 'control_response', response: { request_id: message.request_id, subtype: 'success', response: { models } } }))
    }
  })
  return
}
// Like codex exec, wait for stdin to close before working.
process.stdin.resume()
process.stdin.on('end', async () => {
const config = env.CODEX_HOME
  ? fs.readFileSync(path.join(env.CODEX_HOME, 'config.toml'), 'utf8')
  : null
const keys = ['NEXT_UPGRADE_PROXY_TOKEN', 'AI_GATEWAY_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']
const token = env.NEXT_UPGRADE_PROXY_TOKEN || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY
const endpoint = config
  ? config.match(/base_url = "([^"]+)"/)[1] + '/responses'
  : env.ANTHROPIC_BASE_URL + '/v1/messages'
// Like the CLIs: Codex and a Claude token send a bearer, a Claude API key
// sends x-api-key, and Claude Code names its own beta features.
const headers = config
  ? { authorization: 'Bearer ' + token }
  : {
      ...(env.ANTHROPIC_API_KEY
        ? { 'x-api-key': token }
        : { authorization: 'Bearer ' + token }),
      'anthropic-beta': 'claude-code-20250219',
    }
// Call the API the way the agent CLI would, then without the token.
const reply = await fetch(endpoint, { method: 'POST', headers, body: '{}' }).then(
  (response) => response.text()
)
const unauthorized = await fetch(endpoint, { method: 'POST', body: '{}' }).then(
  (response) => response.status
)
// A provider API that is not inference, such as files, with the token.
const files = await fetch(new URL('/v1/files', endpoint), { headers }).then(
  (response) => response.status
)
// A path that leaves /v1 once its .. segment is resolved. fetch would resolve
// it before sending, so send the raw path.
const escaped = await new Promise((resolve, reject) => {
  const url = new URL(endpoint)
  require('node:http')
    .request(
      { host: url.hostname, port: url.port, method: 'POST', path: '/v1/../outside', headers },
      (response) => {
        response.resume()
        resolve(response.statusCode)
      }
    )
    .on('error', reject)
    .end('{}')
})
fs.appendFileSync(${JSON.stringify(report)}, JSON.stringify({
  args,
  keys: keys.filter((key) => env[key] === 'fixture-key'),
  conflictingKeys: keys.filter((key) => env[key] === 'stale-key'),
  emptyKeys: keys.filter((key) => env[key] === ''),
  telemetryDisabled: env.NEXT_TELEMETRY_DISABLED,
  config,
  endpoint,
  reply,
  unauthorized,
  files,
  escaped,
  anthropicBase: env.ANTHROPIC_BASE_URL ?? null,
  nonessentialTraffic: env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? null,
  leakedHeader: env.ANTHROPIC_CUSTOM_HEADERS ?? null,
  environment: JSON.stringify(env),
}) + '\\n')
if (${hang}) {
  // Print part of the key, then stall past the time limit.
  process.stdout.write('Using key ' + token.slice(0, 9))
  setTimeout(() => {}, 60_000)
} else if (${unverified}) {
  console.log('The build failed while using ' + token)
} else if (args.includes('--output-last-message')) {
  fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], 'NEXT_UPGRADE_VERIFIED')
} else {
  console.log(JSON.stringify({ is_error: false, result: 'NEXT_UPGRADE_VERIFIED' }))
}
})`
  )
  const wrapper = process.platform === 'win32' ? `${name}.cmd` : name
  writeFileSync(
    join(directory, wrapper),
    process.platform === 'win32'
      ? `@"${process.execPath}" "${script}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,
    { mode: 0o700 }
  )
  return () =>
    readFileSync(report, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
}

type UpstreamRequest = {
  method: string
  url: string
  authorization: string | null
  apiKey: string | null
  beta: string | null
}

function runHostedAgent(
  directory: string,
  authMode: string,
  model?: string,
  timeout?: number,
  agentUser?: string,
  runs = 1,
  effort?: string,
  credential = 'fixture-key'
): { model: string | null; upstream: UpstreamRequest[] } {
  const guides = join(directory, 'guides')
  mkdirSync(guides, { recursive: true })
  const script = `
import { createServer } from 'node:http'
import { delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'
const { modulePath, root, guides, authMode, cliPath, model, effort, timeout, agentUser, runs, credential } = JSON.parse(process.argv[1])
const { createHostedAgent } = await import(pathToFileURL(modulePath).href)
// A stand-in provider API that records what reached it.
const upstream = []
const server = createServer((request, response) => {
  upstream.push({
    method: request.method,
    url: request.url,
    authorization: request.headers.authorization ?? null,
    apiKey: request.headers['x-api-key'] ?? null,
    beta: request.headers['anthropic-beta'] ?? null,
  })
  request.resume()
  const key = request.headers.authorization ?? request.headers['x-api-key'] ?? ''
  if (key.includes('rejected-key')) {
    response.writeHead(401).end()
    return
  }
  // A provider that resets the connection partway through a streamed reply.
  if (key.includes('reset-key') && request.url !== '/v1/models') {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write('data: partial\\n\\n')
    setTimeout(() => response.socket.destroy(), 50)
    return
  }
  response.end(request.url === '/v1/models' ? '{"data":[]}' : 'upstream reply')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
Object.assign(process.env, {
  PATH: root + delimiter + process.env.PATH,
  NEXT_UPGRADE_SYSTEM_PATH: root + delimiter + '/usr/bin:/bin',
  OPENAI_API_KEY: 'stale-key',
  AI_GATEWAY_API_KEY: 'stale-key',
  ANTHROPIC_API_KEY: 'stale-key',
  ANTHROPIC_AUTH_TOKEN: 'stale-key',
  ANTHROPIC_BASE_URL: 'https://example.invalid',
  ANTHROPIC_CUSTOM_HEADERS: 'X-Example: stale-header',
  NEXT_TELEMETRY_DISABLED: '1',
})
let agent
try {
  agent = await createHostedAgent({
    authMode,
    credential,
    cliPath,
    model,
    effort,
    agentUser,
    origin: 'http://127.0.0.1:' + server.address().port,
  })
  for (let run = 0; run < runs; run++) {
    await agent.run({ root, guides, cwd: root, prompt: 'Verify the fixture', timeout })
  }
} finally {
  await agent?.dispose()
  server.close()
}
console.log(JSON.stringify({ model: agent.model, upstream }))
`
  return runScript(
    script,
    {
      modulePath: join(actionRoot, 'hosted-agent.mjs'),
      root: directory,
      guides,
      authMode,
      cliPath: builtNext,
      model,
      effort,
      timeout,
      agentUser,
      runs,
      credential,
    },
    directory
  )
}

// The workflow only runs on Linux runners.
// @force-gate !windows
describe('scheduled upgrade agent authentication', () => {
  let directory: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'next-upgrade-auth-'))
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it.each([
    {
      authMode: 'codex-openai-api-key',
      name: 'codex',
      keyName: 'NEXT_UPGRADE_PROXY_TOKEN',
      emptyKeys: [],
      path: '/v1/responses',
      // OpenAI takes the key as a bearer.
      upstream: {
        authorization: 'Bearer fixture-key',
        apiKey: null,
        beta: null,
      },
    },
    {
      authMode: 'claude-anthropic-api-key',
      name: 'claude',
      keyName: 'ANTHROPIC_API_KEY',
      emptyKeys: [],
      path: '/v1/messages',
      // Anthropic takes an API key as x-api-key.
      upstream: {
        authorization: null,
        apiKey: 'fixture-key',
        beta: 'claude-code-20250219',
      },
    },
  ] as const)(
    'routes $authMode to the provider API without giving the agent the credential',
    ({ authMode, name, keyName, emptyKeys, path, upstream }) => {
      const runs = writeFakeAgent(directory, name, { models: [] })
      const result = runHostedAgent(directory, authMode, 'fixture/model')
      expect(result.model).toBe('fixture/model')
      // The key is checked by listing models, then only the authorized
      // request inside /v1 reaches the provider, with the key in place of the
      // placeholder.
      expect(result.upstream).toEqual([
        { method: 'GET', url: '/v1/models', ...upstream, beta: null },
        { method: 'POST', url: path, ...upstream },
      ])
      expect(JSON.stringify(result.upstream)).not.toContain('next-upgrade-')
      const [report] = runs()
      expect(report).toMatchObject({
        keys: [],
        conflictingKeys: [],
        emptyKeys,
        leakedHeader: null,
        telemetryDisabled: '1',
        reply: 'upstream reply',
        unauthorized: 403,
        // The token reaches only the inference endpoints the CLI uses.
        files: 403,
        // A path that resolves outside /v1 is refused.
        escaped: 403,
      })
      expect(report.environment).not.toContain('fixture-key')
      expect(report.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
      expect(report.endpoint.replace(/^http:\/\/[^/]+/, '')).toBe(path)
      expect(report.args).toEqual(
        expect.arrayContaining(['--model', 'fixture/model'])
      )
      if (name === 'codex') {
        expect(report.config).toContain('name = "OpenAI"')
        expect(report.config).toMatch(
          /base_url = "http:\/\/127\.0\.0\.1:\d+\/v1"/
        )
        expect(report.config).toContain('env_key = "NEXT_UPGRADE_PROXY_TOKEN"')
        expect(report.config).toContain('wire_api = "responses"')
        expect(report.config).not.toContain('fixture-key')
        expect(report.anthropicBase).toBeNull()
      } else {
        // Claude Code adds /v1 itself.
        expect(report.anthropicBase).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
        expect(report.nonessentialTraffic).toBe('1')
      }
      expect(report.environment).toContain(`"${keyName}":"next-upgrade-`)
    }
  )

  it.each([
    ['codex', 'codex-openai-api-key', 'OpenAI'],
    ['claude', 'claude-anthropic-api-key', 'Anthropic'],
  ] as const)(
    'stops before running %s when the provider rejects the key',
    (name, authMode, provider) => {
      writeFakeAgent(directory, name, { models: [] })
      let stderr = ''
      try {
        runHostedAgent(
          directory,
          authMode,
          'fixture/model',
          undefined,
          undefined,
          1,
          undefined,
          'rejected-key'
        )
      } catch (error) {
        stderr = String((error as { stderr?: unknown }).stderr)
      }
      expect(stderr).toContain(
        `${provider} rejected the API key in NEXT_UPGRADE_AGENT_CREDENTIAL (HTTP 401).`
      )
      expect(stderr).not.toContain('rejected-key')
      expect(existsSync(join(directory, `${name}-runs.jsonl`))).toBe(false)
    }
  )

  it.each([
    ['codex', 'codex-openai-api-key', ['-c', 'model_reasoning_effort=high']],
    ['claude', 'claude-anthropic-api-key', ['--effort', 'high']],
  ] as const)(
    'passes the chosen reasoning effort to %s like next upgrade --agent',
    (name, authMode, effortArgs) => {
      const runs = writeFakeAgent(directory, name, { models: [] })
      runHostedAgent(
        directory,
        authMode,
        'fixture/model',
        undefined,
        undefined,
        1,
        'high'
      )
      const [report] = runs()
      expect(report.args).toEqual(
        expect.arrayContaining(['--model', 'fixture/model', ...effortArgs])
      )
    }
  )

  it.each(['codex', 'claude'] as const)(
    'leaves %s at the model default effort without an effort',
    (name) => {
      const runs = writeFakeAgent(directory, name, { models: [] })
      runHostedAgent(
        directory,
        name === 'codex' ? 'codex-openai-api-key' : 'claude-anthropic-api-key',
        'fixture/model'
      )
      const [{ args }] = runs()
      expect(args).not.toContain('--effort')
      expect(args.join(' ')).not.toContain('model_reasoning_effort')
    }
  )

  it.each([
    ['codex', 'codex-openai-api-key'],
    ['claude', 'claude-anthropic-api-key'],
  ] as const)(
    'runs %s (%s) as the agent user and takes the checkout back',
    (name, authMode) => {
      const runs = writeFakeAgent(directory, name, { models: [] })
      const calls = writeFakeSudo(directory)
      const result = runHostedAgent(
        directory,
        authMode,
        'fixture/model',
        undefined,
        'next-upgrade-agent'
      )
      expect(result.upstream).toHaveLength(2)
      const [report] = runs()
      const log = calls()
      const agent = log.findIndex((call) =>
        new RegExp(`^-n -u next-upgrade-agent -- env -i .* ${name} `).test(call)
      )
      expect(agent).toBeGreaterThan(-1)
      // No credential is ever part of a command line.
      expect(log.join('\n')).not.toContain('fixture-key')
      expect(report.environment).not.toContain('fixture-key')
      // The probe ran first and found no access.
      expect(log.slice(0, agent).join('\n')).toContain(
        '-n -u next-upgrade-agent -- env -i'
      )
      // The checkout and the guides go to the agent user.
      for (const path of [directory, join(directory, 'guides')]) {
        expect(log).toContain(
          `-n chown -R next-upgrade-agent:${process.getgid()} ${path}`
        )
      }
      const after = log.slice(agent + 1)
      expect(after[0]).toBe('-n pkill -KILL -u next-upgrade-agent')
      // The checkout returns to the runner once the agent is disposed.
      expect(
        after.some(
          (call) =>
            /^-n chown -R \d+:\d+ /.test(call) && call.endsWith(` ${directory}`)
        )
      ).toBe(true)
    }
  )

  it('gives each Codex run its own reply file in the agent home', () => {
    // The agent user owns the home after the first run, so the runner cannot
    // remove or reuse a previous reply there.
    const runs = writeFakeAgent(directory, 'codex', { models: [] })
    writeFakeSudo(directory)
    runHostedAgent(
      directory,
      'codex-openai-api-key',
      'fixture/model',
      undefined,
      'next-upgrade-agent',
      2
    )
    const replies = runs().map(
      ({ args }: { args: string[] }) =>
        args[args.indexOf('--output-last-message') + 1]
    )
    expect(replies).toHaveLength(2)
    expect(new Set(replies).size).toBe(2)
  })

  it('stops when the agent user can use sudo', () => {
    writeFakeAgent(directory, 'codex', { models: [] })
    writeFakeSudo(directory, { allowAgentSudo: true })
    let stderr = ''
    try {
      runHostedAgent(
        directory,
        'codex-openai-api-key',
        'fixture/model',
        undefined,
        'next-upgrade-agent'
      )
    } catch (error) {
      stderr = String((error as { stderr?: unknown }).stderr)
    }
    expect(stderr).toContain(
      'The agent user can read the preparation process or use sudo.'
    )
  })

  it.each([
    [
      'codex',
      'codex-openai-api-key',
      [
        { model: 'gpt-fast', displayName: 'Fast' },
        { model: 'gpt-default', displayName: 'Default', isDefault: true },
      ],
      'gpt-default',
    ],
    [
      'claude',
      'claude-anthropic-api-key',
      [{ value: 'opus' }, { value: 'default' }],
      'default',
    ],
    ['codex', 'codex-openai-api-key', [], null],
  ] as const)(
    'chooses the %s default model like next upgrade --agent',
    (name, authMode, models, expected) => {
      const runs = writeFakeAgent(directory, name, { models: [...models] })
      expect(runHostedAgent(directory, authMode).model).toBe(expected)
      const [{ args }] = runs()
      if (expected === null) {
        expect(args).not.toContain('--model')
      } else {
        expect(args).toEqual(expect.arrayContaining(['--model', expected]))
      }
      expect(args.join(' ')).not.toMatch(/effort/)
    }
  )

  it.each([
    ['codex', 'codex-openai-api-key'],
    ['claude', 'claude-anthropic-api-key'],
  ] as const)(
    'fails preflight when %s model discovery fails instead of guessing',
    (name, authMode) => {
      const runs = writeFakeAgent(directory, name, {
        models: [],
        exitEarly: true,
      })
      expect(() => runHostedAgent(directory, authMode)).toThrow()
      expect(() => runs()).toThrow()
    }
  )

  it.each([
    ['codex', 'codex-openai-api-key'],
    ['claude', 'claude-anthropic-api-key'],
  ] as const)(
    'shows an unverified %s (%s) result without the key',
    (name, authMode) => {
      writeFakeAgent(directory, name, { models: [], unverified: true })
      let stderr = ''
      try {
        runHostedAgent(directory, authMode, 'fixture/model')
      } catch (error) {
        stderr = String((error as { stderr?: unknown }).stderr)
      }
      expect(stderr).toContain('The build failed while using next-upgrade-')
      expect(stderr).not.toContain('fixture-key')
    }
  )

  it('ends the agent request when the provider resets the connection', () => {
    writeFakeAgent(directory, 'codex', { models: [] })
    let failure = { stderr: '' }
    const started = Date.now()
    try {
      runHostedAgent(
        directory,
        'codex-openai-api-key',
        'fixture/model',
        20_000,
        undefined,
        1,
        undefined,
        'reset-key'
      )
    } catch (error) {
      failure = error as typeof failure
    }
    // The agent sees the reset instead of waiting for the run time limit.
    expect(String(failure.stderr)).toContain(
      'Codex upgrade and verification failed.'
    )
    expect(Date.now() - started).toBeLessThan(15_000)
  })

  it('reports a timeout without the key', () => {
    writeFakeAgent(directory, 'codex', { models: [], hang: true })
    let failure = { message: '', stderr: '' }
    try {
      runHostedAgent(directory, 'codex-openai-api-key', 'fixture/model', 1000)
    } catch (error) {
      failure = error as typeof failure
    }
    expect(String(failure.stderr)).toContain('Using key next-upgr')
    expect(String(failure.stderr)).not.toContain('fixture-k')
    expect(String(failure.stderr)).toContain(
      'Codex upgrade and verification timed out.'
    )
  })
})
