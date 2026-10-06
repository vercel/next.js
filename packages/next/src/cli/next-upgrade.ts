import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join, resolve as resolvePath } from 'path'
import { major, prerelease, valid } from 'next/dist/compiled/semver'
import * as Log from '../build/output/log'
import createSpinner from '../build/spinner'
import { findDir } from '../lib/find-pages-dir'
import { getProjectDir } from '../lib/get-project-dir'
import { warnMissingReactDependencies } from '../lib/warn-missing-react-dependencies'
import { getNpxCommand } from '../lib/helpers/get-npx-command'
import { interopDefault } from '../lib/interop-default'
import { dim } from '../lib/picocolors'
import type { UpgradeDocument } from '../lib/upgrade/future-defaults'
import { runChildProcess } from '../lib/upgrade/run-child-process'
import { getAgentName } from '../telemetry/agent-name'
import {
  eventAgentUpgradeAgentResult,
  eventAgentUpgradeCLIResult,
  eventAgentUpgradeRunStarted,
  type AgentUpgradeCLIResult,
  type AgentUpgradeHandoffMethod,
  type AgentUpgradePolicy,
} from '../telemetry/events/agent-upgrade'
import { Telemetry } from '../telemetry/storage'
import loadConfig from '../server/config'
import { normalizeConfig } from '../server/config-shared'
import { PHASE_PRODUCTION_BUILD } from '../shared/lib/constants'

type NextUpgradeOptions = {
  revision: string
  verbose: boolean
  agent: boolean | string | undefined
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CODEMOD_COMMAND_PLACEHOLDER = '<codemod-command>'
const SKILLS_CLI_VERSION = '1.5.26'

type PrepareUpgradeDocumentInput = {
  directory: string
  runDirectory: string
  bundledDocs: string
  nextVersion: string
  document: UpgradeDocument
}

async function prepareUpgradeDocument(
  input: PrepareUpgradeDocumentInput
): Promise<string> {
  if (input.document.startsWith('docs/')) {
    const path = input.document.slice('docs/'.length)
    const destination = join(input.runDirectory, input.document)
    await mkdir(dirname(destination), { recursive: true })
    await cp(join(input.bundledDocs, path), destination)
    return destination
  }

  const match = /^skills\/(.+)\/SKILL\.md$/.exec(input.document)
  if (!match) {
    throw new Error(`Unsupported upgrade document ${input.document}.`)
  }

  return prepareUpgradeSkill(input, match[1])
}

async function prepareUpgradeSkill(
  input: PrepareUpgradeDocumentInput,
  skill: string
): Promise<string> {
  const spawnCommand =
    require('next/dist/compiled/cross-spawn') as typeof import('next/dist/compiled/cross-spawn')
  const [command, ...runnerArgs] = getNpxCommand(input.directory).split(' ')
  const source =
    `https://github.com/vercel/next.js/tree/v${input.nextVersion}/skills/` +
    skill
  const args = [...runnerArgs, `skills@${SKILLS_CLI_VERSION}`, 'use', source]
  const skillDirectory = join(input.runDirectory, 'skills', skill)
  const instructionsPath = join(skillDirectory, 'PROMPT.md')

  await mkdir(skillDirectory, { recursive: true })

  try {
    const instructions = await new Promise<string>((resolve, reject) => {
      const child = spawnCommand(command, args, {
        cwd: input.directory,
        env: {
          ...process.env,
          TEMP: skillDirectory,
          TMP: skillDirectory,
          TMPDIR: skillDirectory,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')

      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk
      })
      child.once('error', reject)
      child.once('close', (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `Could not prepare ${input.document}: ${stderr.trim() || `exit code ${code ?? 'unknown'}`}`
            )
          )
          return
        }

        if (!stdout.trim()) {
          reject(new Error(`${input.document} returned no instructions.`))
          return
        }

        resolve(stdout)
      })
    })

    await writeFile(instructionsPath, instructions)
    return instructionsPath
  } catch (error) {
    await rm(skillDirectory, { recursive: true, force: true })
    throw error
  }
}

async function loadAgentUpgradeConfig(directory: string) {
  // Read and normalize the app's config without validating legacy options
  // against the current Next.js schema.
  const rawConfig = await loadConfig(PHASE_PRODUCTION_BUILD, directory, {
    rawConfig: true,
  })
  return normalizeConfig(PHASE_PRODUCTION_BUILD, interopDefault(rawConfig))
}

async function resolveCanaryVersion(): Promise<string> {
  try {
    const response = await fetch('https://registry.npmjs.org/next/canary', {
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
      redirect: 'error',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const { version } = await response.json()
    if (typeof version !== 'string' || valid(version) !== version) {
      throw new Error('Invalid canary version')
    }

    return version
  } catch (error) {
    throw new Error('Could not fetch the latest Next.js canary from npm.', {
      cause: error,
    })
  }
}

export async function spawnNextUpgrade(
  directory: string | undefined,
  options: NextUpgradeOptions,
  nudgeSource: { id: string; recipient: 'human' | 'agent' } | null
) {
  let baseDir = resolvePath(directory || '.')

  if (options.agent) {
    // Match dev/build's telemetry storage, including custom output directories in CI.
    // Retain config errors until after recording the invocation so failed runs still count.
    let distDir = '.next'
    let configuredPolicy: unknown = null
    let configError: unknown = null
    try {
      baseDir = getProjectDir(directory, false)
      warnMissingReactDependencies(baseDir)
      const config = await loadAgentUpgradeConfig(baseDir)
      distDir = config.distDir || '.next'
      configuredPolicy = config.experimental?.agentUpgrade
    } catch (error) {
      configError = error
    }

    // Count agent invocations even when resolving the directory or config fails.
    const telemetry = new Telemetry({
      distDir: join(baseDir, distDir),
      skipNotify: true,
    })

    // The parent records attribution; canary only needs its run ID to report results.
    // Remove it before launching an agent so later upgrades start their own runs.
    const inheritedRunId = process.env.__NEXT_AGENT_UPGRADE_RUN_ID
    delete process.env.__NEXT_AGENT_UPGRADE_RUN_ID
    const invalidRunId =
      inheritedRunId !== undefined && !UUID_PATTERN.test(inheritedRunId)
    const invalidNudgeId =
      nudgeSource !== null && !UUID_PATTERN.test(nudgeSource.id)

    const runId =
      inheritedRunId && !invalidRunId ? inheritedRunId : randomUUID()

    let resolvedPolicy: AgentUpgradePolicy | null = null
    let failureStage: 'cli' | 'metadata' | 'guide' | 'handoff' = 'cli'
    let cliResultRecorded = false

    // Preparation and handoff can both fail; record only the first terminal result.
    const recordCLIResult = (
      result: AgentUpgradeCLIResult,
      handoffMethod: AgentUpgradeHandoffMethod | null,
      selectedAgentProduct: string | null
    ) => {
      if (cliResultRecorded) {
        return
      }
      cliResultRecorded = true
      telemetry.record(
        eventAgentUpgradeCLIResult({
          runId,
          result,
          resolvedPolicy,
          handoffMethod,
          selectedAgentProduct,
        })
      )
    }

    try {
      // Only the original invocation records a start, including invalid-input failures.
      // Origin and nudge attribution stay on that event; results join through runId.
      if (!inheritedRunId || invalidRunId) {
        const agentProduct = await getAgentName()
        const nudge = invalidRunId || invalidNudgeId ? null : nudgeSource
        const origin = nudge
          ? nudge.recipient === 'agent'
            ? 'agent_nudge'
            : 'human_nudge'
          : agentProduct
            ? 'agent_manual'
            : 'human_manual'
        telemetry.record(
          eventAgentUpgradeRunStarted({
            runId,
            nudgeId: nudge?.id ?? null,
            origin,
            agentProduct,
            requestedPolicy:
              options.agent === 'security' ||
              options.agent === 'latest' ||
              options.agent === 'experimental-future'
                ? options.agent
                : null,
          })
        )
      }

      if (invalidRunId) {
        throw new Error('Invalid upgrade run ID.')
      }
      if (invalidNudgeId) {
        throw new Error('Invalid upgrade nudge ID.')
      }
      if (configError) {
        throw configError
      }

      const expectedVersion = process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
      delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
      delete process.env.__NEXT_UPGRADE_USE_CURRENT_CLI

      if (expectedVersion !== undefined) {
        // Delegated upgrades and evals use their pinned CLI without another lookup.
        if (process.env.__NEXT_VERSION !== expectedVersion) {
          throw new Error(
            `Expected Next.js ${expectedVersion} for the upgrade, but launched ${process.env.__NEXT_VERSION}.`
          )
        }
      } else {
        Log.info(dim('Preparing upgrade...'))
        failureStage = 'metadata'
        const canaryVersion = await resolveCanaryVersion()
        failureStage = 'cli'
        if (process.env.__NEXT_VERSION !== canaryVersion) {
          const [command, ...runnerArgs] = getNpxCommand(baseDir).split(' ')
          const agentArgument =
            typeof options.agent === 'string'
              ? `--agent=${options.agent}`
              : '--agent'
          const args = [
            ...runnerArgs,
            `next@${canaryVersion}`,
            'upgrade',
            baseDir,
            agentArgument,
          ]

          if (options.verbose) {
            args.push('--verbose')
          }

          process.exitCode = await runChildProcess(
            command,
            args,
            {
              cwd: baseDir,
              stdio: 'inherit',
              env: {
                ...process.env,
                // The delegated CLI emits the CLI result for this invocation's run ID.
                __NEXT_AGENT_UPGRADE_RUN_ID: runId,
                __NEXT_UPGRADE_EXPECTED_CLI_VERSION: canaryVersion,
                // Older canaries recognize only this recursion guard.
                __NEXT_UPGRADE_USE_CURRENT_CLI: '1',
              },
            },
            null
          )
          return
        }
      }

      // A workspace root must not launch an upgrade for an unspecified app.
      if (!findDir(baseDir, 'app') && !findDir(baseDir, 'pages')) {
        throw new Error(
          'No Next.js app found in this directory. Run the command from an app directory or pass its path:\n\n' +
            `next upgrade [directory] --agent${typeof options.agent === 'string' ? `=${options.agent}` : ''}`
        )
      }

      const upgradeType =
        typeof options.agent === 'string'
          ? options.agent
          : configuredPolicy === 'security' ||
              configuredPolicy === 'latest' ||
              configuredPolicy === 'experimental-future'
            ? configuredPolicy
            : 'security'

      if (
        upgradeType !== 'security' &&
        upgradeType !== 'latest' &&
        upgradeType !== 'experimental-future'
      ) {
        throw new Error(
          `Unsupported agent upgrade type ${JSON.stringify(upgradeType)}. Expected "security", "latest", or "experimental-future".`
        )
      }
      resolvedPolicy = upgradeType

      // Resolve the requested target before preparing an agent session.
      const { prepareUpgrade } =
        require('../lib/upgrade/prepare-upgrade') as typeof import('../lib/upgrade/prepare-upgrade')
      const assessmentSpinner = createSpinner('Preparing upgrade')
      const result = await prepareUpgrade(baseDir, upgradeType).finally(() =>
        assessmentSpinner?.stop()
      )

      // Expected assessment failures retain their status and stop before handoff.
      if (result.status === 'blocked' || result.status === 'unknown') {
        recordCLIResult(
          result.status === 'blocked' ? 'no_safe_target' : 'metadata_failure',
          null,
          null
        )
        Log.error('Could not prepare the upgrade:', result.reason)
        process.exitCode = 1
        return
      }

      if (result.status !== 'ready') {
        Log.info(result.reason)
        recordCLIResult('no_update_needed', null, null)
        return
      }

      const needsVersionUpdate =
        result.installedVersion !== result.targetVersion
      const crossesMajor =
        major(result.installedVersion) !== major(result.targetVersion)

      Log.info(
        needsVersionUpdate
          ? `Upgrade: Next.js ${result.installedVersion} → ${result.targetVersion}`
          : `Future Defaults: Next.js ${result.installedVersion}`
      )

      // Use the invoking CLI's guides, even when the app runs an older Next.js.
      // Retain them outside the app so dependency changes cannot remove them.
      failureStage = 'guide'
      const bundledDocs = join(__dirname, '../docs')
      const bundledGuides = join(__dirname, '../lib/upgrade')
      const runDirectory = await mkdtemp(join(tmpdir(), 'next-upgrade-'))
      const guideName = crossesMajor
        ? 'different-major'
        : needsVersionUpdate
          ? 'same-major'
          : 'future-defaults'
      const guideDirectory = 'upgrade'
      const sharedGuidePath = join(runDirectory, guideDirectory, 'shared.md')
      const guidePath = join(runDirectory, guideDirectory, `${guideName}.md`)
      const futureGuidePath = join(
        runDirectory,
        guideDirectory,
        'future-defaults.md'
      )
      const guidesSpinner = createSpinner('Preparing upgrade')

      try {
        await mkdir(dirname(guidePath), { recursive: true })
        await cp(join(bundledGuides, 'shared.md'), sharedGuidePath)
        await cp(join(bundledGuides, `${guideName}.md`), guidePath)

        if (crossesMajor) {
          await mkdir(join(runDirectory, 'docs/01-app/02-guides/upgrading'), {
            recursive: true,
          })
          await cp(
            join(bundledDocs, '01-app/02-guides/upgrading/codemods.md'),
            join(runDirectory, 'docs/01-app/02-guides/upgrading/codemods.md')
          )
          for (
            let version = major(result.installedVersion) + 1;
            version <= major(result.targetVersion);
            version++
          ) {
            const router = version < 14 ? '02-pages' : '01-app'
            const destination = join(
              runDirectory,
              'docs',
              router,
              '02-guides/upgrading',
              `version-${version}.md`
            )
            await mkdir(dirname(destination), { recursive: true })
            await cp(
              join(
                bundledDocs,
                router,
                '02-guides/upgrading',
                `version-${version}.md`
              ),
              destination
            )
          }
          if (major(result.installedVersion) < 13) {
            await mkdir(
              join(runDirectory, 'docs/02-pages/02-guides/upgrading'),
              { recursive: true }
            )
            await cp(
              join(bundledDocs, '02-pages/02-guides/upgrading/codemods.md'),
              join(
                runDirectory,
                'docs/02-pages/02-guides/upgrading/codemods.md'
              )
            )
          }
        }

        if (upgradeType === 'experimental-future' && needsVersionUpdate) {
          await cp(join(bundledGuides, 'future-defaults.md'), futureGuidePath)
        }

        if (crossesMajor) {
          const codemodVersion = process.env.__NEXT_VERSION
          if (!codemodVersion) {
            throw new Error('Could not determine the @next/codemod version.')
          }
          const codemodCommand = `${getNpxCommand(baseDir)} @next/codemod@${codemodVersion} upgrade ${result.targetVersion} --yes --skip-adoption${options.verbose ? ' --verbose' : ''}`
          const guide = await readFile(guidePath, 'utf8')
          if (!guide.includes(CODEMOD_COMMAND_PLACEHOLDER)) {
            throw new Error('Could not prepare the upgrade guide.')
          }
          await writeFile(
            guidePath,
            guide.replace(CODEMOD_COMMAND_PLACEHOLDER, codemodCommand)
          )
        }
      } catch (error) {
        await rm(runDirectory, { recursive: true, force: true })
        throw error
      } finally {
        guidesSpinner?.stop()
      }

      const preparedFutureDefaults: Array<
        (typeof result.futureDefaults)[number] & {
          documents: string[]
        }
      > = []

      if (result.futureDefaults.length > 0) {
        const contextSpinner = createSpinner('Preparing upgrade context')

        try {
          for (const futureDefault of result.futureDefaults) {
            const documents: string[] = []

            for (const document of futureDefault.adoptionDoc) {
              try {
                documents.push(
                  await prepareUpgradeDocument({
                    directory: baseDir,
                    runDirectory,
                    bundledDocs,
                    nextVersion: result.targetVersion,
                    document,
                  })
                )
              } catch {
                Log.warn(`Could not prepare upgrade document ${document}.`)
              }
            }

            if (documents.length === 0) {
              throw new Error(
                `Could not prepare adoption documents for ${futureDefault.name}.`
              )
            }

            preparedFutureDefaults.push({
              ...futureDefault,
              documents,
            })
          }
        } finally {
          contextSpinner?.stop()
        }
      }

      const references = result.references
        .map((reference) => `- ${reference}`)
        .join('\n')
      const releaseKind = prerelease(result.targetVersion)?.[0] ?? 'stable'
      const reason =
        upgradeType === 'security'
          ? 'the installed version is affected by a published security advisory'
          : upgradeType === 'latest'
            ? `a newer ${releaseKind} Next.js release is available`
            : `the Future policy applies the latest ${releaseKind} release${preparedFutureDefaults.length > 0 ? ' and adopts its Future Defaults' : ''}`
      const futureDefaultsList = preparedFutureDefaults
        .map(
          (futureDefault) =>
            `- ${futureDefault.name}\n${futureDefault.documents.map((document) => `  - Read and follow ${JSON.stringify(document)}.`).join('\n')}`
        )
        .join('\n')
      const futureDefaultsPrompt =
        upgradeType === 'experimental-future'
          ? `${needsVersionUpdate ? `After completing and verifying the version update, read and follow ${JSON.stringify(futureGuidePath)}.\n` : ''}${futureDefaultsList ? `Adopt these Future Defaults in order:\n${futureDefaultsList}\nComplete each adoption. Temporary opt-outs and TODO markers are intermediate work only; do not stop until they are removed and the adoption is fully verified.` : 'No Future Defaults are pending adoption.'}`
          : ''

      // Pass resolved inputs directly; the agent owns repairs and verification.
      const taskSummary = needsVersionUpdate
        ? `We're upgrading the app in ${JSON.stringify(baseDir)} from Next.js ${result.installedVersion} to ${result.targetVersion} because ${reason}.`
        : `We're adopting the Future Defaults available to the app in ${JSON.stringify(baseDir)}, which already uses Next.js ${result.installedVersion}.`

      // Use the invoking CLI's reporter even after the app's Next.js package changes.
      const reportCommand = `${getNpxCommand(baseDir)} next@${process.env.__NEXT_VERSION} internal report-agent-upgrade ${runId}`
      const prompt = (
        useWorktree: boolean | null
      ) => `Read and follow ${JSON.stringify(sharedGuidePath)} first. Attempt its applicable duplicate checks before changing files. If a check is unavailable, report it and continue. Stop only if you find equivalent work. Then read and follow every applicable instruction in ${JSON.stringify(guidePath)}.

${taskSummary}

${useWorktree === null ? "Follow the user's worktree choice. If they do not specify, use a separate Git worktree when the app is in a Git repository. Run upgrade commands from this app's corresponding directory in that worktree. If the app is not in a Git repository, upgrade it in place." : useWorktree ? "If the app is in a Git repository, perform the upgrade in a separate Git worktree. Run upgrade commands from this app's corresponding directory in that worktree. If the app is not in a Git repository, upgrade it in place." : 'Perform the upgrade in the current checkout.'}

Set \`experimental.agentUpgrade\` to ${JSON.stringify(upgradeType)} in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

${futureDefaultsPrompt ? `${futureDefaultsPrompt.trimStart()}\n\n` : ''}References:
${references}

When this task ends, report its result once. After completing the requested upgrade and all applicable verification, run \`${reportCommand} success\`. If the attempted upgrade remains unsuccessful after repairs or verification fails, run \`${reportCommand} failure\`. If you stop for duplicate work, user cancellation, or an unavailable prerequisite, do not report success or failure. Explain the result to the user separately; never include project details or error text in the telemetry command.`

      const { handoffUpgrade } =
        require('../lib/upgrade/harness') as typeof import('../lib/upgrade/harness')

      // Delivery is observable here; completing the upgrade belongs to the agent.
      failureStage = 'handoff'
      const handoffResult = await handoffUpgrade(
        prompt,
        baseDir,
        (method, selectedAgentProduct) => {
          recordCLIResult('handoff_issued', method, selectedAgentProduct)
        }
      )
      if (handoffResult === 'cancelled') {
        recordCLIResult('cancelled', null, null)
      } else if (handoffResult === 'failed') {
        recordCLIResult('handoff_failed', null, null)
      }
    } catch (error) {
      // Report the failed preparation stage while preserving the original error below.
      switch (failureStage) {
        case 'metadata':
          recordCLIResult('metadata_failure', null, null)
          break
        case 'guide':
          recordCLIResult('guide_failure', null, null)
          break
        case 'handoff':
          recordCLIResult('handoff_failed', null, null)
          break
        case 'cli':
          recordCLIResult('cli_failure', null, null)
          break
      }

      Log.error(
        'Could not prepare the upgrade:',
        error instanceof Error ? error.message : error
      )
      process.exitCode = 1
    } finally {
      // Send queued results before this short-lived CLI invocation exits.
      await telemetry.flush()
    }

    return
  }

  baseDir = getProjectDir(directory)
  warnMissingReactDependencies(baseDir)

  const [upgradeProcessCommand, ...upgradeProcessDefaultArgs] =
    getNpxCommand(baseDir).split(' ')

  const upgradeProcessCommandArgs = [
    ...upgradeProcessDefaultArgs,
    // Needs to be bleeding edge (canary) to pick up latest codemods.
    '@next/codemod@canary',
    'upgrade',
    options.revision,
  ]

  if (options.verbose) {
    upgradeProcessCommandArgs.push('--verbose')
  }

  const upgradeProcess = spawn(
    upgradeProcessCommand,
    upgradeProcessCommandArgs,
    {
      stdio: 'inherit',
      cwd: baseDir,
    }
  )

  upgradeProcess.on('close', (code) => {
    process.exitCode = code ?? 0
  })
}

export async function reportAgentUpgradeAgentResult(
  runId: string,
  result: string
) {
  // Only accept the bounded result and run ID; project details never enter this event.
  if (
    !UUID_PATTERN.test(runId) ||
    (result !== 'success' && result !== 'failure')
  ) {
    throw new Error(
      'Expected an upgrade run UUID and a success or failure result.'
    )
  }

  // Reuse normal telemetry consent and delivery without starting another upgrade.
  const config = await loadAgentUpgradeConfig(process.cwd())
  const telemetry = new Telemetry({
    distDir: join(process.cwd(), config.distDir || '.next'),
    skipNotify: true,
  })
  await telemetry.record(eventAgentUpgradeAgentResult({ runId, result }))
  await telemetry.flush()
}
