import { spawn, type ChildProcess } from 'child_process'
import { once } from 'events'
import { cp, mkdtemp, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { findPort as getPort } from 'next-test-utils'

jest.setTimeout(120_000)

let directory: string
let child: ChildProcess | null = null
let output: string
const cli = require.resolve('next/dist/bin/next')
const preload = join(__dirname, 'cli-preload.cjs')

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'human-upgrade-cli-'))
  await cp(join(__dirname, 'fixture'), directory, { recursive: true })
  await symlink(
    join(__dirname, '../../../node_modules'),
    join(directory, 'node_modules'),
    'junction'
  )
  output = ''
})

afterEach(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const stopped = once(child, 'exit')
    child.kill('SIGTERM')
    await stopped
  }
  child = null
  await rm(directory, { recursive: true, force: true })
})

function start(command: 'dev' | 'build', port: number | undefined = undefined) {
  child = spawn(
    process.execPath,
    [
      '--require',
      preload,
      cli,
      command,
      directory,
      '--webpack',
      ...(port ? ['--port', String(port)] : []),
    ],
    {
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        ...(port ? { HUMAN_NUDGE_PORT: String(port) } : {}),
      },
      stdio: 'pipe',
    }
  )
  child.stdout!.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr!.on('data', (chunk) => {
    output += chunk.toString()
  })
  return child
}

async function waitForMenu(
  ready = () => output.includes('Skip until next version')
) {
  const process = child!
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(output)), 60_000)
    const onData = () => {
      if (ready()) finish(null)
    }
    const onExit = () => finish(new Error(output))
    const finish = (error: Error | null) => {
      clearTimeout(timeout)
      process.stdout!.removeListener('data', onData)
      process.stderr!.removeListener('data', onData)
      process.removeListener('exit', onExit)
      if (error) reject(error)
      else resolve()
    }
    process.stdout!.on('data', onData)
    process.stderr!.on('data', onData)
    process.once('exit', onExit)
    onData()
  })
}

it('keeps dev serving while prompting and stops it before handing off', async () => {
  const port = await getPort()
  const process = start('dev', port)
  await waitForMenu()
  expect(await (await fetch(`http://localhost:${port}`)).text()).toContain(
    'Human upgrade fixture'
  )
  const stopped = once(process, 'exit')
  process.stdin!.write('\r')
  expect((await stopped)[0]).toBe(23)
  expect(output.match(/UPGRADE_HANDOFF/g)).toHaveLength(1)
  expect(output).toContain('--ai=security')
})

it('keeps dev serving after Escape without prompting again on worker restart', async () => {
  const port = await getPort()
  const process = start('dev', port)
  await waitForMenu()
  process.stdin!.write('\x1b')
  expect(await (await fetch(`http://localhost:${port}`)).text()).toContain(
    'Human upgrade fixture'
  )
  expect(output).not.toContain('UPGRADE_HANDOFF')
  await writeFile(
    join(directory, 'next.config.js'),
    "module.exports = { experimental: { agenticAutoUpgrade: 'security' }, poweredByHeader: false }\n"
  )
  await waitForMenu(() => (output.match(/Ready in/g) || []).length === 2)
  expect(await (await fetch(`http://localhost:${port}`)).text()).toContain(
    'Human upgrade fixture'
  )
  expect(output.match(/Skip until next version/g)).toHaveLength(1)
})

it('cancels the command when Ctrl+C is pressed in the menu', async () => {
  const process = start('dev', await getPort())
  await waitForMenu()
  const stopped = once(process, 'exit')
  process.stdin!.write('\x03')
  await stopped
  expect(output).not.toContain('UPGRADE_HANDOFF')
})

it('hands off after a successful build and preserves the upgrade exit status', async () => {
  const process = start('build')
  await waitForMenu()
  expect(output).toContain('Route (pages)')
  const stopped = once(process, 'exit')
  process.stdin!.write('\r')
  expect((await stopped)[0]).toBe(23)
  expect(output).toContain('UPGRADE_HANDOFF')
})

it('does not prompt after a failed build', async () => {
  await writeFile(
    join(directory, 'pages/index.js'),
    "import missing from './missing'\nexport default missing\n"
  )
  const process = start('build')
  expect((await once(process, 'exit'))[0]).not.toBe(0)
  expect(output).not.toContain('Skip until next version')
  expect(output).not.toContain('UPGRADE_HANDOFF')
})
