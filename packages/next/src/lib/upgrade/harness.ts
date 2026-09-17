import { constants } from 'fs'
import { access, stat } from 'fs/promises'
import { delimiter, resolve } from 'path'

import cliSelect from 'next/dist/compiled/cli-select'
import spawn from 'next/dist/compiled/cross-spawn'

import * as Log from '../../build/output/log'
import { getAgentName } from '../../telemetry/agent-name'
import { bold, cyan, dim } from '../picocolors'
import { runChildProcess } from './run-child-process'

// Model defaults for newly launched sessions; existing agents keep their model.
const UPGRADE_MODELS = {
  codex: 'gpt-5.6-terra',
  claude: 'sonnet',
} as const

type UpgradeHarness = {
  name: keyof typeof UPGRADE_MODELS
  path: string
}

function getHarnessDisplayName(name: UpgradeHarness['name']): string {
  return name === 'codex' ? 'Codex' : 'Claude Code'
}

async function findHarnesses(): Promise<UpgradeHarness[]> {
  const names: UpgradeHarness['name'][] = ['codex', 'claude']
  const directories = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
          .split(';')
          .filter(Boolean)
      : ['']

  // Probe agents independently, preserving menu order and each detected path.
  const installed = await Promise.all(
    names.map(async (name): Promise<UpgradeHarness | null> => {
      for (const directory of directories) {
        for (const extension of extensions) {
          const file = resolve(directory, `${name}${extension}`)

          try {
            await access(
              file,
              process.platform === 'win32' ? constants.F_OK : constants.X_OK
            )

            if ((await stat(file)).isFile()) {
              return { name, path: file }
            }
          } catch {}
        }
      }

      return null
    })
  )

  return installed.filter(
    (harness): harness is UpgradeHarness => harness !== null
  )
}

async function chooseHarness(
  harnesses: UpgradeHarness[]
): Promise<UpgradeHarness | 'copy' | undefined> {
  const question =
    harnesses.length === 1
      ? `${getHarnessDisplayName(harnesses[0].name)} detected. Would you like to proceed?`
      : 'Multiple coding agents detected. Which one would you like to use?'

  Log.bootstrap('')
  Log.bootstrap(`  ${question}`)
  Log.bootstrap(`  ${dim('Use ↑/↓ to choose, then press Enter.')}\n`)

  try {
    const { id } = await cliSelect({
      values: {
        ...Object.fromEntries(
          harnesses.map(({ name }) => [
            name,
            `Continue with ${getHarnessDisplayName(name)}`,
          ])
        ),
        copy: 'Copy prompt for another coding agent',
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
    return id === 'copy' ? 'copy' : harnesses.find(({ name }) => name === id)
  } catch (error) {
    // cli-select rejects without an error when Escape or Ctrl+C cancels the menu.
    if (error) {
      throw error
    }

    return undefined
  }
}

function copyUpgradePrompt(prompt: string, noHarness = false): void {
  const commands =
    process.platform === 'darwin'
      ? [['pbcopy']]
      : process.platform === 'win32'
        ? [['clip.exe']]
        : [
            ['wl-copy'],
            ['xclip', '-selection', 'clipboard'],
            ['xsel', '--clipboard', '--input'],
          ]

  for (const [command, ...args] of commands) {
    const result = spawn.sync(command, args, {
      input:
        process.platform === 'win32' ? Buffer.from(prompt, 'utf16le') : prompt,
      stdio: ['pipe', 'ignore', 'ignore'],
      timeout: 1000,
      windowsHide: true,
    })

    if (!result.error && result.status === 0) {
      Log.info(
        noHarness
          ? 'No supported coding agent found. The upgrade prompt was copied to your clipboard.'
          : 'Upgrade prompt copied. Paste it into your coding agent.'
      )
      return
    }
  }

  Log.info(
    noHarness
      ? 'No supported coding agent found. Copy this upgrade prompt:'
      : 'Could not access the clipboard. Copy this upgrade prompt:'
  )
  Log.bootstrap(prompt)
}

function launchHarness(
  harness: UpgradeHarness,
  prompt: string,
  directory: string
): Promise<number> {
  // Windows shell shims cannot carry literal line breaks in an argument.
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(harness.path)) {
    prompt = prompt.replace(/[\r\n]+/g, ' ')
  }

  return runChildProcess(
    harness.path,
    ['--model', UPGRADE_MODELS[harness.name], prompt],
    { cwd: directory, stdio: 'inherit' }
  )
}

export async function handoffUpgrade(
  prompt: string,
  directory: string
): Promise<void> {
  // Existing agents keep their session, model and permissions.
  if (await getAgentName()) {
    Log.bootstrap(prompt)
    return
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    Log.info('Copy this upgrade prompt into your coding agent:')
    Log.bootstrap(prompt)
    return
  }

  Log.info(dim('Looking for coding agents...'))
  const installed = await findHarnesses()

  if (installed.length === 0) {
    copyUpgradePrompt(prompt, true)
    return
  }

  // Let the selected agent take over the terminal with its existing permissions.
  const harness = await chooseHarness(installed)

  if (harness === 'copy') {
    copyUpgradePrompt(prompt)
    return
  }

  if (!harness) {
    Log.bootstrap(`  ${dim('Upgrade cancelled.')}\n`)
    process.exitCode = 1
    return
  }

  Log.bootstrap(
    `  Continuing with ${cyan(bold(getHarnessDisplayName(harness.name)))}...\n`
  )
  try {
    process.exitCode = await launchHarness(harness, prompt, directory)
  } catch {
    Log.error(`Could not start ${getHarnessDisplayName(harness.name)}.`)
    process.exitCode = 1
  }
}
