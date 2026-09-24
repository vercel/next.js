import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { killApp, retry } from 'next-test-utils'

// Real CLI parent, scripted worker, simulated prompt/agent.
// These tests check both commands' handoff decisions without a compiler.
describe('upgrade decisions with a simulated worker', () => {
  let directory: string
  let child: ChildProcess | null = null
  let closed: Promise<unknown> | null = null
  let output: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'next-upgrade-worker-'))
    await mkdir(join(directory, 'pages'))
    await writeFile(join(directory, 'package.json'), '{}')
    output = ''
  })

  afterEach(async () => {
    if (child?.exitCode === null && child.signalCode === null) {
      await killApp(child)
    }
    await closed
    child = null
    await rm(directory, { recursive: true, force: true })
  })

  async function startWithFakeWorker(
    mode: string,
    command: 'dev' | 'build' = 'dev'
  ) {
    child = spawn(
      process.execPath,
      [
        resolve(
          __dirname,
          '../../development/upgrade-terminal/fixtures/driver.cjs'
        ),
        ...(command === 'dev' ? ['--port', '0'] : []),
      ],
      {
        cwd: directory,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          NEXT_TELEMETRY_DISABLED: '1',
          NEXT_EXIT_TIMEOUT_MS: '1000',
          UPGRADE_TEST_WORKER: join(
            __dirname,
            `fixtures/${command === 'build' ? 'build-worker' : 'worker'}.cjs`
          ),
          UPGRADE_TEST_MODE: mode,
          UPGRADE_TEST_COMMAND: command,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    )
    closed = once(child, 'close')
    child.stdout!.on('data', (chunk) => (output += chunk.toString()))
    child.stderr!.on('data', (chunk) => (output += chunk.toString()))
    await retry(() => {
      expect(output).toContain(
        mode === 'no-policy' ? 'BUILD_STARTED' : 'MENU_OPEN'
      )
    })
  }

  it('drains final worker output before handoff', async () => {
    // On POSIX, a descendant also keeps stdout open after the worker exits.
    // Windows does not reliably keep that pipe open for this descendant.
    await startWithFakeWorker('descendant')
    child!.stdin!.write('update\n')
    await closed
    expect(child!.exitCode).toBe(0)
    expect(output).toContain('WORKER_FINAL_OUTPUT')
    expect(output.indexOf('UPGRADE_HANDOFF')).toBeGreaterThan(
      output.indexOf('WORKER_FINAL_OUTPUT')
    )
    if (process.platform !== 'win32') {
      expect(output).toContain('DESCENDANT_DONE')
      expect(output.indexOf('UPGRADE_HANDOFF')).toBeGreaterThan(
        output.indexOf('DESCENDANT_DONE')
      )
    }
    expect(output.match(/UPGRADE_HANDOFF/g)).toHaveLength(1)
  })

  it.each(['failure', 'timeout'])(
    'refuses an upgrade after cleanup %s',
    async (mode) => {
      // failure reports unsuccessful cleanup; timeout never acknowledges it.
      // Neither case may reach the upgrade command.
      await startWithFakeWorker(mode)
      child!.stdin!.write('update\n')
      await closed
      expect(child!.exitCode).toBe(1)
      expect(output).toContain('The upgrade was not started.')
      expect(output.includes('UPGRADE_HANDOFF')).toBe(false)
    }
  )

  it('aborts the offer on restart and forwards the replacement worker output', async () => {
    await startWithFakeWorker('restart')
    // Request a worker restart while the prompt is waiting for a choice.
    await writeFile(join(directory, 'restart'), '')
    await retry(() => {
      expect(output.match(/WORKER_STARTED:/g)).toHaveLength(2)
    })
    // The replacement worker can log, and the old offer is closed, not repeated.
    expect(output).toContain('MENU_CLOSED')
    expect(output.match(/MENU_OPEN/g)).toHaveLength(1)
    expect(child!.exitCode).toBe(null)
  })

  it('logs pressure dismissal once after closing the menu and forwards later output', async () => {
    await startWithFakeWorker('pressure')
    // Trigger 1 MiB of logs while the prompt is waiting for a choice.
    await writeFile(join(directory, 'pressure'), '')
    await retry(() => {
      expect(output.includes('WORKER_AFTER_PRESSURE')).toBe(true)
      expect(output.includes('Upgrade prompt closed because')).toBe(true)
    })
    // Expect one warning after the prompt closes, with the worker still running.
    expect(output.match(/Upgrade prompt closed because/g)).toHaveLength(1)
    expect(output).toContain('buffered dev output reached 1 MiB.')
    expect(output.indexOf('Upgrade prompt closed because')).toBeGreaterThan(
      output.indexOf('MENU_CLOSED')
    )
    expect(output.includes('UPGRADE_HANDOFF')).toBe(false)
    expect(child!.exitCode).toBe(null)
  })

  it('keeps building under the menu and replays output on Skip', async () => {
    await startWithFakeWorker('skip', 'build')
    await writeFile(join(directory, 'progress'), '')
    await retry(async () => {
      await import('node:fs/promises').then(({ access }) =>
        access(join(directory, 'progress-done'))
      )
    })
    expect(output.includes('BUILD_PROGRESS')).toBe(false)
    child!.stdin!.write('skip\n')
    await retry(() => expect(output).toContain('BUILD_PROGRESS'))
    await writeFile(join(directory, 'finish'), '')
    await closed
    expect(child!.exitCode).toBe(0)
    expect(output).toContain('BUILD_FINISHED')
    expect(output.includes('UPGRADE_HANDOFF')).toBe(false)
  })

  it('forwards build output immediately when no upgrade is configured', async () => {
    await startWithFakeWorker('no-policy', 'build')
    await writeFile(join(directory, 'progress'), '')
    await retry(() => expect(output).toContain('BUILD_PROGRESS'))
    await writeFile(join(directory, 'finish'), '')
    await closed
    expect(child!.exitCode).toBe(0)
    expect(output.includes('MENU_OPEN')).toBe(false)
    expect(output.includes('UPGRADE_HANDOFF')).toBe(false)
  })

  it('stops the build and drains its final output before Upgrade', async () => {
    await startWithFakeWorker('upgrade', 'build')
    child!.stdin!.write('update\n')
    await closed
    expect(child!.exitCode).toBe(0)
    expect(output).toContain('BUILD_FINAL_OUTPUT')
    expect(output.indexOf('UPGRADE_HANDOFF')).toBeGreaterThan(
      output.indexOf('BUILD_FINAL_OUTPUT')
    )
  })

  it('does not upgrade if the build refuses to stop', async () => {
    await startWithFakeWorker('timeout', 'build')
    child!.stdin!.write('update\n')
    await closed
    expect(child!.exitCode).toBe(1)
    expect(output).toContain('Build shutdown timed out.')
    expect(output.includes('UPGRADE_HANDOFF')).toBe(false)
  })
})
