import { constants } from 'fs'
import { access, stat, mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { delimiter, join, resolve } from 'path'
import type { Key } from 'readline'

import cliSelect from 'next/dist/compiled/cli-select'
import spawn from 'next/dist/compiled/cross-spawn'

import * as Log from '../../build/output/log'
import { getAgentName } from '../../telemetry/agent-name'
import type { AgentUpgradeHandoffMethod } from '../../telemetry/events/agent-upgrade'
import { bold, cyan, dim } from '../picocolors'
import { getHarnessModels, type UpgradeModel } from './model-discovery'
import { runChildProcess } from './run-child-process'

const CODEX_APPROVAL_ARGS = [
  '--sandbox',
  'workspace-write',
  '--ask-for-approval',
  'on-request',
] as const

type UpgradeHarness = {
  name: 'codex' | 'claude'
  path: string
}

type UpgradePrompt =
  | string
  | ((useWorktree: boolean | null) => string)
  | {
      ci: (context: {
        useWorktree: boolean | null
        harness: string | null
      }) => string
    }

function resolvePrompt(
  prompt: UpgradePrompt,
  useWorktree: boolean | null,
  harness?: string
): string {
  if (typeof prompt === 'object') {
    return prompt.ci({ useWorktree, harness: harness ?? null })
  }
  return typeof prompt === 'string' ? prompt : prompt(useWorktree)
}

async function chooseOption(
  question: string,
  values: Record<string, string>,
  defaultValue: number,
  firstPrompt = false
): Promise<string | null | undefined> {
  Log.bootstrap('')
  Log.bootstrap(`  ${question}`)
  Log.bootstrap(
    `  ${dim(`Use ↑/↓ to choose, Enter to confirm, or Esc to ${firstPrompt ? 'cancel' : 'go back'}.`)}\n`
  )

  let interrupted = false
  const onKeypress = (_text: string, key: Key) => {
    if (key.ctrl && key.name === 'c') {
      interrupted = true
    }
  }
  process.stdin.on('keypress', onKeypress)
  try {
    const { id } = await cliSelect({
      values,
      defaultValue,
      selected: cyan('❯'),
      unselected: ' ',
      indentation: 2,
      valueRenderer: (value: string, selected: boolean) =>
        selected ? cyan(bold(value)) : value,
    })
    if (typeof id === 'string') {
      Log.bootstrap(`  ${cyan('❯')} ${cyan(bold(values[id]))}`)
      return id
    }
    return undefined
  } catch (error) {
    if (error !== undefined) {
      throw error
    }
    return interrupted ? null : undefined
  } finally {
    process.stdin.removeListener('keypress', onKeypress)
  }
}

async function chooseWorktree(
  task: string
): Promise<boolean | null | undefined> {
  const choice = await chooseOption(
    `Open the ${task} in a separate Git worktree?`,
    { yes: 'Yes', no: 'No' },
    0
  )
  if (choice === null || choice === undefined) {
    return choice
  }
  if (choice === 'yes') {
    return true
  }
  if (choice === 'no') {
    return false
  }
  throw new Error(`Unknown worktree choice: ${choice}`)
}

function getHarnessDisplayName(name: UpgradeHarness['name']): string {
  return name === 'codex' ? 'Codex' : 'Claude Code'
}

function supportsCodexAutoReview(path: string): boolean {
  const result = spawn.sync(path, ['--help'], {
    encoding: 'utf8',
    timeout: 5000,
  })
  return result.status === 0 && /--approve-for-me\b/.test(result.stdout ?? '')
}

function getClaudePermissionSupport(path: string) {
  const result = spawn.sync(path, ['--help'], {
    encoding: 'utf8',
    timeout: 5000,
  })
  const permissionModeHelp =
    result.status === 0
      ? result.stdout?.match(
          /--permission-mode[^\n]*(?:\n[ \t]{8,}[^\n]*){0,4}/
        )?.[0]
      : null
  const choices = permissionModeHelp?.match(/\(choices:\s*([^)]+)\)/)?.[1]
  const supportedModes = new Set(choices?.match(/[A-Za-z]+/g) ?? [])

  return {
    auto: supportedModes.has('auto'),
    approvalMode: supportedModes.has('manual')
      ? 'manual'
      : supportedModes.has('default')
        ? 'default'
        : null,
  }
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
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            if (
              code === 'ENOENT' ||
              code === 'EACCES' ||
              code === 'ENOTDIR' ||
              code === 'ELOOP'
            ) {
              continue
            }
            throw new Error(`Could not inspect coding agent at ${file}.`, {
              cause: error,
            })
          }
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
  harnesses: UpgradeHarness[],
  previousName: UpgradeHarness['name'] | undefined
): Promise<UpgradeHarness | 'copy' | undefined> {
  const question =
    harnesses.length === 1
      ? `${getHarnessDisplayName(harnesses[0].name)} detected. Would you like to proceed?`
      : 'Multiple coding agents detected. Which one would you like to use?'

  const id = await chooseOption(
    question,
    {
      ...Object.fromEntries(
        harnesses.map(({ name }) => [
          name,
          `Continue with ${getHarnessDisplayName(name)}`,
        ])
      ),
      copy: 'Copy prompt for another coding agent',
    },
    Math.max(
      0,
      harnesses.findIndex(({ name }) => name === previousName)
    ),
    true
  )
  return id === 'copy' ? 'copy' : harnesses.find(({ name }) => name === id)
}

function copyUpgradePrompt(
  prompt: string,
  noHarness: boolean,
  task: string
): AgentUpgradeHandoffMethod {
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
          ? `No supported coding agent found. The ${task} prompt was copied to your clipboard.`
          : `${task === 'upgrade' ? 'Upgrade' : 'CI setup'} prompt copied. Paste it into your coding agent.`
      )
      return 'copied_prompt'
    }
  }

  Log.info(
    noHarness
      ? `No supported coding agent found. Copy this ${task} prompt:`
      : `Could not access the clipboard. Copy this ${task} prompt:`
  )
  Log.bootstrap(prompt)
  return 'printed_prompt'
}

async function launchHarness(
  harness: UpgradeHarness,
  prompt: string,
  directory: string,
  model: string | null,
  effort: string,
  permissionArgs: readonly string[],
  onSpawn: () => void
): Promise<number> {
  // Preserve multiline instructions when a Windows shell shim carries argv.
  let promptDirectory: string | null = null
  try {
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(harness.path)) {
      promptDirectory = await mkdtemp(join(tmpdir(), 'next-upgrade-prompt-'))
      const promptFile = join(promptDirectory, 'PROMPT.md')
      await writeFile(promptFile, prompt, 'utf8')
      prompt = `Read and follow the complete instructions in ${JSON.stringify(promptFile)}.`
    }

    const args = model === null ? [] : ['--model', model]
    if (effort !== 'default') {
      if (harness.name === 'codex') {
        args.push('-c', `model_reasoning_effort=${effort}`)
      } else {
        args.push('--effort', effort)
      }
    }

    // Package installs and upgrade verification need network access in the sandbox.
    if (harness.name === 'codex') {
      args.push('-c', 'sandbox_workspace_write.network_access=true')
    }

    args.push(...permissionArgs)
    args.push(prompt)
    return await runChildProcess(
      harness.path,
      args,
      { cwd: directory, stdio: 'inherit' },
      onSpawn
    )
  } finally {
    if (promptDirectory !== null) {
      try {
        await rm(promptDirectory, { recursive: true, force: true })
      } catch {
        Log.warn('Could not remove the temporary coding agent prompt.')
      }
    }
  }
}

export async function handoffUpgrade(
  prompt: UpgradePrompt,
  directory: string,
  onHandoff:
    | ((
        method: AgentUpgradeHandoffMethod,
        selectedAgentProduct: string | null
      ) => void)
    | null,
  task?: 'ci'
): Promise<'handed_off' | 'cancelled' | 'failed'> {
  const taskName = task === 'ci' ? 'CI setup' : 'upgrade'
  // Existing agents keep their session and permissions.
  const existingAgent = await getAgentName()
  if (existingAgent) {
    Log.bootstrap(resolvePrompt(prompt, null, existingAgent))
    onHandoff?.('existing_agent', existingAgent)
    return 'handed_off'
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    Log.info(`Copy this ${taskName} prompt into your coding agent:`)
    Log.bootstrap(resolvePrompt(prompt, null))
    onHandoff?.('printed_prompt', null)
    return 'handed_off'
  }

  Log.info(dim('Looking for coding agents...'))
  const installed = await findHarnesses()

  if (installed.length === 0) {
    const method = copyUpgradePrompt(
      resolvePrompt(prompt, null),
      true,
      taskName
    )
    onHandoff?.(method, null)
    return 'handed_off'
  }

  const discoveryController = new AbortController()
  const modelCatalogs = new Map(
    installed.map(({ name, path }) => [
      name,
      getHarnessModels(name, path, directory, discoveryController.signal),
    ])
  )
  const stopDiscovery = async () => {
    discoveryController.abort()
    await Promise.all(modelCatalogs.values())
  }

  try {
    let stage: 'harness' | 'model' | 'effort' | 'permission' | 'worktree' =
      'harness'
    let harness: UpgradeHarness | undefined
    let model: UpgradeModel | undefined
    let effort: string | undefined
    let autoPermissionArgs: string[] | null = null
    let approvalPermissionArgs: string[] = []
    let permissionArgs: string[] = []
    let useAuto = true
    let useWorktree = true
    const previousModelStage = () =>
      model ? (model.efforts.length > 0 ? 'effort' : 'model') : 'harness'
    let codexAutoReview: boolean | undefined
    let claudePermissionSupport:
      | ReturnType<typeof getClaudePermissionSupport>
      | undefined

    while (true) {
      if (stage === 'harness') {
        const choice = await chooseHarness(installed, harness?.name)
        if (choice === 'copy') {
          const method = copyUpgradePrompt(
            resolvePrompt(prompt, null),
            false,
            taskName
          )
          onHandoff?.(method, null)
          return 'handed_off'
        }
        if (!choice) {
          break
        }
        harness = choice
        stage = 'model'
      } else if (stage === 'model') {
        const models = await modelCatalogs.get(harness!.name)!
        if (models === null) {
          break
        }
        if (models.length === 0) {
          model = undefined
          effort = 'default'
          stage = 'effort'
          continue
        }
        const selectedModelId = model?.id
        const previousModelId = models.some(({ id }) => id === selectedModelId)
          ? selectedModelId
          : undefined
        const modelId = await chooseOption(
          `Which ${getHarnessDisplayName(harness!.name)} model should run the ${taskName}?`,
          Object.fromEntries(
            models.map(({ id, label, description }) => [
              id,
              description ? `${label} — ${description}` : label,
            ])
          ),
          Math.max(
            0,
            models.findIndex(({ id, isDefault }) =>
              previousModelId ? id === previousModelId : isDefault
            )
          )
        )
        if (modelId === null) {
          break
        }
        if (modelId === undefined) {
          stage = 'harness'
          continue
        }
        model = models.find(({ id }) => id === modelId)
        if (!model) {
          throw new Error(`Unknown upgrade model: ${modelId}`)
        }
        if (!model.efforts.includes(effort ?? 'default')) {
          effort = 'default'
        }
        stage = 'effort'
      } else if (stage === 'effort') {
        if (model && model.efforts.length > 0) {
          const efforts = ['default', ...model.efforts]
          const previousEffortIndex = efforts.indexOf(effort ?? 'default')
          const selectedEffort = await chooseOption(
            `Which reasoning effort should the ${taskName} use?`,
            Object.fromEntries(
              efforts.map((value) => [
                value,
                value === 'default' ? 'Model default' : value,
              ])
            ),
            Math.max(0, previousEffortIndex)
          )
          if (selectedEffort === null) {
            break
          }
          if (selectedEffort === undefined) {
            stage = 'model'
            continue
          }
          if (!efforts.includes(selectedEffort)) {
            throw new Error(`Unknown upgrade effort: ${selectedEffort}`)
          }
          effort = selectedEffort
        }
        if (harness!.name === 'codex') {
          codexAutoReview ??= supportsCodexAutoReview(harness!.path)
          autoPermissionArgs = codexAutoReview ? ['--approve-for-me'] : null
          approvalPermissionArgs = [...CODEX_APPROVAL_ARGS]
        } else {
          const { auto, approvalMode } = (claudePermissionSupport ??=
            getClaudePermissionSupport(harness!.path))
          if (!approvalMode) {
            Log.error('Could not determine a supported Claude approval mode.')
            process.exitCode = 1
            return 'failed'
          }
          autoPermissionArgs = auto ? ['--permission-mode', 'auto'] : null
          approvalPermissionArgs = ['--permission-mode', approvalMode]
        }
        if (autoPermissionArgs) {
          stage = 'permission'
        } else {
          Log.info(
            dim('Auto permission mode is unavailable; using approval requests.')
          )
          permissionArgs = approvalPermissionArgs
          stage = 'worktree'
        }
      } else if (stage === 'permission') {
        const permissionChoice = await chooseOption(
          `Use Auto permission mode for ${getHarnessDisplayName(harness!.name)}?`,
          { yes: 'Yes', no: 'No, ask for approval' },
          useAuto ? 0 : 1
        )
        if (permissionChoice === null) {
          break
        }
        if (permissionChoice === undefined) {
          stage = previousModelStage()
          continue
        }
        useAuto = permissionChoice === 'yes'
        permissionArgs = useAuto ? autoPermissionArgs! : approvalPermissionArgs
        stage = 'worktree'
      } else {
        const choice = await chooseWorktree(taskName)
        if (choice === null) {
          break
        }
        if (choice === undefined) {
          stage = autoPermissionArgs ? 'permission' : previousModelStage()
          continue
        }
        useWorktree = choice
        Log.bootstrap(
          `  Continuing with ${cyan(bold(getHarnessDisplayName(harness!.name)))}...\n`
        )
        // Capture the selected agent before the launch callback runs.
        const agentProduct = harness!.name
        await stopDiscovery()

        try {
          process.exitCode = await launchHarness(
            harness!,
            resolvePrompt(prompt, useWorktree, agentProduct),
            directory,
            model?.id ?? null,
            effort!,
            permissionArgs,
            () => onHandoff?.('launched_agent', agentProduct)
          )
        } catch {
          Log.error(`Could not start ${getHarnessDisplayName(harness!.name)}.`)
          process.exitCode = 1
          return 'failed'
        }
        return 'handed_off'
      }
    }

    Log.bootstrap(
      `  ${dim(task === 'ci' ? 'CI setup cancelled.' : 'Upgrade cancelled.')}\n`
    )
    process.exitCode = 1
    return 'cancelled'
  } finally {
    await stopDiscovery()
  }
}
