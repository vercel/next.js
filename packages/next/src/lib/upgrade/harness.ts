import { access, stat } from 'fs/promises'
import { constants } from 'fs'
import { delimiter, join } from 'path'
import { constants as osConstants } from 'os'
import { createInterface } from 'readline'
import { stripVTControlCharacters } from 'util'
import cliSelect from 'next/dist/compiled/cli-select'
import spawn from 'next/dist/compiled/cross-spawn'
import { getAgentName } from '../../telemetry/agent-name'
import { launchCodex } from './codex'
import { bold, cyan, dim } from '../picocolors'
import { printUpgradeReceipt } from './receipt'
import { UPGRADE_MODELS } from './models'

type UpgradeHarness = 'codex' | 'claude'
type HarnessChoice =
  | { kind: 'handoff' }
  | { kind: 'launch'; harness: UpgradeHarness }
  | { kind: 'choose'; harnesses: UpgradeHarness[] }
  | { kind: 'fallback'; reason: string }

function selectHarness(
  active: string | null,
  installed: UpgradeHarness[],
  tty: boolean
): HarnessChoice {
  if (active === 'codex' || active === 'claude' || active === 'claude-code') {
    return {
      kind: 'handoff',
    }
  }

  if (active) {
    return {
      kind: 'fallback',
      reason: `The active harness (${active}) is not supported. Continue in Codex or Claude Code.`,
    }
  }

  if (installed.length === 1) {
    return { kind: 'launch', harness: installed[0] }
  }

  if (installed.length > 1 && tty) {
    return { kind: 'choose', harnesses: installed }
  }

  return {
    kind: 'fallback',
    reason: installed.length
      ? 'Choose Codex or Claude Code in an interactive terminal.'
      : 'Install or open Codex or Claude Code, then follow the printed instructions.',
  }
}

async function findHarnesses(): Promise<UpgradeHarness[]> {
  const names: UpgradeHarness[] = ['codex', 'claude']
  const directories = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
      : ['']
  const installed: UpgradeHarness[] = []

  for (const name of names) {
    let found = false

    for (const directory of directories) {
      for (const extension of extensions) {
        const file = join(directory, `${name}${extension}`)

        try {
          await access(
            file,
            process.platform === 'win32' ? constants.F_OK : constants.X_OK
          )

          if ((await stat(file)).isFile()) {
            found = true
          }
        } catch {}

        if (found) {
          break
        }
      }

      if (found) {
        break
      }
    }

    if (found) {
      installed.push(name)
    }
  }

  return installed
}

async function chooseHarness(
  harnesses: UpgradeHarness[]
): Promise<UpgradeHarness | undefined> {
  console.log('  Choose an upgrade agent.')
  console.log(`  ${dim('Use ↑/↓ to choose, then press Enter.')}\n`)

  try {
    const { id } = await cliSelect({
      values: {
        ...Object.fromEntries(
          harnesses.map((name) => [
            name,
            name === 'codex' ? 'Codex' : 'Claude Code',
          ])
        ),
        cancel: 'Cancel',
      },
      // cli-select indexes rows numerically, even when values is an object.
      defaultValue: 0,
      selected: cyan('❯'),
      unselected: ' ',
      indentation: 2,
      valueRenderer: (value: string, selected: boolean) =>
        selected ? cyan(bold(value)) : value,
    })
    return harnesses.find((name) => name === id)
  } catch (error) {
    // cli-select rejects without an error when Escape or Ctrl+C cancels the menu.
    if (error) {
      throw error
    }

    return undefined
  }
}

function launchHarness(
  harness: UpgradeHarness,
  prompt: string,
  directory: string
): Promise<number> {
  if (harness === 'codex') {
    return launchCodex(prompt, directory)
  }

  return new Promise((resolve, reject) => {
    // Claude owns the background worker and prints its ID and attach/logs/stop
    // commands. Only wait for this launcher, not for the upgrade to finish.
    const child = spawn(
      harness,
      ['--bg', '--model', UPGRADE_MODELS.claude, prompt],
      {
        cwd: directory,
        stdio: ['inherit', 'pipe', 'inherit'],
      }
    )
    // These commands are pasted into the user's shell, where aliases can add
    // flags that make Claude treat a management command as a new prompt.
    const output = child.stdout
      ? createInterface({ input: child.stdout })
      : undefined
    let session: string | undefined
    const nativeReceipt: string[] = []
    const printNativeLine = (line: string) => {
      console.log(
        process.platform === 'win32'
          ? line
          : line.replace(
              /^(\s*)claude (?=(?:agents|attach|logs|stop)\b)/,
              '$1command claude '
            )
      )
    }
    output?.on('line', (line) => {
      const plain = stripVTControlCharacters(line)
      const started = /^\s*backgrounded\s*·\s*([a-f0-9-]+)(?:\s|$)/i.exec(plain)

      if (started) {
        session = started[1]
        nativeReceipt.push(line)
        return
      }

      if (
        session &&
        /^\s*claude (?:agents|attach|logs|stop)\b/.test(plain)
      ) {
        nativeReceipt.push(line)
        return
      }

      if (/^\s*Starting background service(?:…|\.\.\.)\s*$/.test(plain)) {
        return
      }

      printNativeLine(line)
    })
    const onInterrupt = () => child.kill('SIGINT')
    const onTerminate = () => child.kill('SIGTERM')
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    const cleanup = () => {
      output?.close()
      process.removeListener('SIGINT', onInterrupt)
      process.removeListener('SIGTERM', onTerminate)
    }
    child.once('error', (error: Error) => {
      cleanup()
      reject(error)
    })
    child.once(
      'close',
      (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup()

        if (code === 0 && !signal && session) {
          const command = `${process.platform === 'win32' ? '' : 'command '}claude`
          printUpgradeReceipt({
            agent: 'Claude Code',
            session,
            open: `${command} attach ${session}`,
            logs: `${command} logs ${session}`,
            stop: `${command} stop ${session}`,
            errors: null,
            resume: null,
            exited: false,
          })
        } else {
          for (const line of nativeReceipt) {
            printNativeLine(line)
          }
        }

        resolve(code ?? (signal ? 128 + (osConstants.signals[signal] ?? 1) : 1))
      }
    )
  })
}

export async function handoffUpgrade(
  prompt: string,
  directory: string,
  versions: { current: string; target: string }
): Promise<void> {
  const active = await getAgentName()
  const choice = selectHarness(
    active,
    active ? [] : await findHarnesses(),
    Boolean(process.stdin.isTTY && process.stdout.isTTY)
  )

  // When an agent invoked the CLI, return instructions to that session instead
  // of starting another agent with separate permissions and conversation state.
  if (choice.kind === 'handoff') {
    console.log(prompt)
    return
  }

  if (choice.kind === 'fallback') {
    console.log(choice.reason)
    console.log(prompt)
    process.exitCode = 1
    return
  }

  console.log(
    `\n  ${bold('Next.js security update available!')} ${dim(versions.current)} → ${cyan(bold(versions.target))}\n`
  )

  // A human invocation selects an installed harness; that harness owns the
  // background task and its lifecycle after Next finishes the handoff.
  const harness =
    choice.kind === 'choose'
      ? await chooseHarness(choice.harnesses)
      : choice.harness

  if (!harness) {
    console.log(`  ${dim('Upgrade cancelled.')}\n`)
    process.exitCode = 1
    return
  }

  console.log(
    `  Starting ${cyan(bold(harness === 'codex' ? 'Codex' : 'Claude Code'))} in the background…\n`
  )
  process.exitCode = await launchHarness(harness, prompt, directory)
}
