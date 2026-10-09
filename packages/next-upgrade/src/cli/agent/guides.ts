import * as nodeModule from 'module'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { major, prerelease } from 'semver'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import * as Log from '../../shared/log'
import createSpinner from '../spinner'
import { getNpxCommand, resolveCodemodVersion } from '../package-runner'
import type { AgentUpgradePolicy } from '../../next/telemetry'
import type { UpgradePreparation } from '../../shared/check-upgrade'
import type { UpgradeDocument } from '../../shared/future-defaults'
import { invokingNext, requireFromNext } from '../../next/project'

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
  const spawnCommand = require('cross-spawn') as typeof import('cross-spawn')
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

// Keep the invoking CLI's instructions available after app dependencies change.
export async function prepareUpgradeGuides({
  directory: baseDir,
  policy: upgradeType,
  upgrade: result,
  verbose,
  runId,
  upgradeVersion,
}: {
  directory: string
  policy: AgentUpgradePolicy
  upgrade: Extract<UpgradePreparation, { status: 'ready' }>
  verbose: boolean
  runId: string
  upgradeVersion: string
}) {
  const needsVersionUpdate = result.installedVersion !== result.targetVersion
  const crossesMajor =
    major(result.installedVersion) !== major(result.targetVersion)
  // Use the invoking CLI's guides, even when the app runs an older Next.js.
  // Retain them outside the app so dependency changes cannot remove them.
  const runtimeRequire = Reflect.apply(
    Reflect.get(nodeModule, 'createRequire'),
    null,
    [__filename]
  ) as NodeRequire
  const packageRoot = dirname(
    runtimeRequire.resolve('@next/upgrade/package.json')
  )
  const bundledDocs = join(packageRoot, 'dist/docs')
  const bundledGuides = join(packageRoot, 'dist/guides')
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
        await mkdir(join(runDirectory, 'docs/02-pages/02-guides/upgrading'), {
          recursive: true,
        })
        await cp(
          join(bundledDocs, '02-pages/02-guides/upgrading/codemods.md'),
          join(runDirectory, 'docs/02-pages/02-guides/upgrading/codemods.md')
        )
      }
    }

    if (upgradeType === 'experimental-future' && needsVersionUpdate) {
      await cp(join(bundledGuides, 'future-defaults.md'), futureGuidePath)
    }

    if (crossesMajor) {
      const codemodVersion = await resolveCodemodVersion()
      const codemodCommand = `${getNpxCommand(baseDir)} @next/codemod@${codemodVersion} upgrade ${result.targetVersion} --yes --skip-adoption${verbose ? ' --verbose' : ''}`
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
  // Failed upgrades may leave a legacy app installed; report through invoking Next.
  const reportPackage = invokingNext
    ? `next@${requireFromNext(baseDir)('./package.json').version}`
    : `@next/upgrade@${upgradeVersion}`
  const reportCommand = `${getNpxCommand(baseDir)} ${reportPackage} internal report-agent-upgrade ${runId}`
  const prompt = (
    useWorktree: boolean | null
  ) => `Read and follow ${JSON.stringify(sharedGuidePath)} first. Attempt its applicable duplicate checks before changing files. If a check is unavailable, report it and continue. Stop only if you find equivalent work. Then read and follow every applicable instruction in ${JSON.stringify(guidePath)}.

${taskSummary}

${useWorktree === null ? "Follow the user's worktree choice. If they do not specify, use a separate Git worktree when the app is in a Git repository. Run upgrade commands from this app's corresponding directory in that worktree. If the app is not in a Git repository, upgrade it in place." : useWorktree ? "If the app is in a Git repository, perform the upgrade in a separate Git worktree. Run upgrade commands from this app's corresponding directory in that worktree. If the app is not in a Git repository, upgrade it in place." : 'Perform the upgrade in the current checkout.'}

Set \`experimental.agentUpgrade\` to ${JSON.stringify(upgradeType)} in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

${futureDefaultsPrompt ? `${futureDefaultsPrompt.trimStart()}\n\n` : ''}References:
${references}

When this task ends, report its result once. After completing the requested upgrade and all applicable verification, run \`${reportCommand} success\`. If the attempted upgrade remains unsuccessful after repairs or verification fails, run \`${reportCommand} failure\`. If you stop for duplicate work, user cancellation, or an unavailable prerequisite, do not report success or failure. Explain the result to the user separately; never include project details or error text in the telemetry command.`

  return prompt
}
