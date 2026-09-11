import { closeSync, mkdtempSync, openSync } from 'fs'
import { readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { setTimeout as delay } from 'timers/promises'
import spawn from 'next/dist/compiled/cross-spawn'
import { printUpgradeReceipt } from './receipt'
import { UPGRADE_MODELS } from './models'

const STARTUP_TIMEOUT = 30_000

export async function launchCodex(
  prompt: string,
  directory: string
): Promise<number> {
  const logs = mkdtempSync(join(tmpdir(), 'next-upgrade-codex-'))
  const eventsPath = join(logs, 'events.jsonl')
  const stderrPath = join(logs, 'stderr.log')
  const stdout = openSync(eventsPath, 'wx', 0o600)
  let stderr: number | undefined
  let child: ReturnType<typeof spawn>
  try {
    stderr = openSync(stderrPath, 'wx', 0o600)
    // File-backed stdio lets Codex keep writing after Next exits. A stdout pipe
    // owned by Next would break when the launching terminal goes away.
    child = spawn(
      'codex',
      [
        'exec',
        '--json',
        '--model',
        UPGRADE_MODELS.codex.cli,
        '--cd',
        directory,
        prompt,
      ],
      {
        cwd: directory,
        detached: true,
        stdio: ['ignore', stdout, stderr],
      }
    )
  } finally {
    closeSync(stdout)
    if (stderr !== undefined) closeSync(stderr)
  }

  let exited: { code: number | null; signal: NodeJS.Signals | null } | undefined
  child.once('exit', (code, signal) => {
    exited = { code, signal }
  })
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
  child.unref()

  const stop =
    process.platform === 'win32'
      ? `taskkill /PID ${child.pid} /T`
      : `kill -TERM -- -${child.pid}`
  const recovery = `Process: ${child.pid}\nEvents: ${eventsPath}\nErrors: ${stderrPath}\nStop: ${stop}\nInspect the logs before retrying.`

  // Only wait for the persisted session ID, not the migration. Never retry a
  // launch after a timeout: the detached process may still be doing the work.
  const deadline = Date.now() + STARTUP_TIMEOUT
  let offset = 0
  try {
    while (true) {
      const events = await readFile(eventsPath, 'utf8')
      const end = events.lastIndexOf('\n') + 1
      const lines = events.slice(offset, end).split('\n').filter(Boolean)
      offset = end
      for (const line of lines) {
        const event = JSON.parse(line)
        if (
          event.type === 'thread.started' &&
          typeof event.thread_id === 'string' &&
          /^[a-zA-Z0-9_-]+$/.test(event.thread_id)
        ) {
          if (exited && (exited.code !== 0 || exited.signal)) break
          printUpgradeReceipt({
            agent: 'Codex',
            session: event.thread_id,
            // Editor terminals may treat custom URL schemes as file paths.
            // Use macOS's URL handler explicitly instead of relying on clicks.
            open:
              process.platform === 'darwin'
                ? `open "codex://threads/${event.thread_id}"`
                : `codex://threads/${event.thread_id}`,
            logs: eventsPath,
            errors: stderrPath,
            stop,
            resume: `${process.platform === 'win32' ? '' : 'command '}codex resume ${event.thread_id}`,
            exited: Boolean(exited),
          })
          return 0
        }
      }
      if (exited) {
        const detail = (await readFile(stderrPath, 'utf8'))
          .trim()
          .slice(-16_384)
        throw new Error(
          `Codex exited before startup was confirmed (exit code ${exited.code}${exited.signal ? `, signal ${exited.signal}` : ''}).\n${detail}`
        )
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Codex process ${child.pid} is still running, but no session ID was received within 30 seconds.\nThe background process was not stopped.`
        )
      }
      await delay(100)
    }
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : error}\n${recovery}`
    )
  }
}
