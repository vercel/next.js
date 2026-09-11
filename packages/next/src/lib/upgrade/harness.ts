import { access, stat } from 'fs/promises'
import { constants } from 'fs'
import { delimiter, join } from 'path'
import { constants as osConstants } from 'os'
import cliSelect from 'next/dist/compiled/cli-select'
import spawn from 'next/dist/compiled/cross-spawn'
import { getAgentName } from '../../telemetry/agent-name'
import { bold, cyan, dim } from '../picocolors'
import { UPGRADE_MODELS } from './models'

type UpgradeHarness = 'codex' | 'claude'
type HarnessChoice =
  | { kind: 'handoff' }
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

  if (installed.length > 0 && tty) {
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
): Promise<UpgradeHarness | 'print' | undefined> {
  console.log('  How would you like to continue?')
  console.log(`  ${dim('Use ↑/↓ to choose, then press Enter.')}\n`)

  try {
    const { id } = await cliSelect({
      values: {
        ...Object.fromEntries(
          harnesses.map((name) => [
            name,
            name === 'codex' ? 'Open Codex' : 'Open Claude Code',
          ])
        ),
        print: 'Print upgrade prompt',
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
    return id === 'print' ? 'print' : harnesses.find((name) => name === id)
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
  return new Promise((resolve, reject) => {
    const child = spawn(harness, ['--model', UPGRADE_MODELS[harness], prompt], {
      cwd: directory,
      stdio: 'inherit',
    })
    const onInterrupt = () => child.kill('SIGINT')
    const onTerminate = () => child.kill('SIGTERM')
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    const cleanup = () => {
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

  // Let the selected agent take over the terminal with its existing permissions.
  const harness = await chooseHarness(choice.harnesses)

  if (harness === 'print') {
    console.log(prompt)
    return
  }

  if (!harness) {
    console.log(`  ${dim('Upgrade cancelled.')}\n`)
    process.exitCode = 1
    return
  }

  console.log(
    `  Opening ${cyan(bold(harness === 'codex' ? 'Codex' : 'Claude Code'))}…\n`
  )
  process.exitCode = await launchHarness(harness, prompt, directory)
}
