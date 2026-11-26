// Child processes for the scheduled upgrade scripts: a fixed environment,
// system commands from fixed directories, and output without credentials.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export function commandEnv() {
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
export function redact(buffer, secret) {
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
export function showOutput({ stdout, stderr }, secret) {
  const text = redact(stdout, secret) + redact(stderr, secret)
  console.error(text.split('\n').slice(-40).join('\n'))
}

export async function run(
  file,
  args,
  { cwd, env, description, timeout = 600_000, secret, input }
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
    pending.child.stdin?.end(input)
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
export function systemPath() {
  return process.env.NEXT_UPGRADE_SYSTEM_PATH || '/usr/bin:/bin'
}

export function systemCommand(name) {
  for (const directory of systemPath().split(':')) {
    if (existsSync(join(directory, name))) {
      return join(directory, name)
    }
  }
  return name
}

export function parseJson(value, description) {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`Invalid ${description} JSON.`)
  }
}

export function sudo(args, description) {
  return run(systemCommand('sudo'), ['-n', ...args], {
    env: { ...commandEnv(), PATH: systemPath() },
    description,
  })
}

// Stops everything the agent user started and returns its files to the runner.
export async function reclaim(user, paths) {
  await sudo(['pkill', '-KILL', '-u', user], 'Stopping agent processes').catch(
    () => {}
  )
  const owner = `${process.getuid()}:${process.getgid()}`
  for (const path of paths) {
    await sudo(['chown', '-R', owner, path], 'Reclaiming agent files')
  }
}
