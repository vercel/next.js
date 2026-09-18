import { spawn, spawnSync } from 'child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import semver from 'next/dist/compiled/semver'
import findUp from 'next/dist/compiled/find-up'
import * as Log from '../build/output/log'
import createSpinner from '../build/spinner'
import { findDir } from '../lib/find-pages-dir'
import { getProjectDir } from '../lib/get-project-dir'
import { getNpxCommand } from '../lib/helpers/get-npx-command'
import { getPkgManager } from '../lib/helpers/get-pkg-manager'
import { interopDefault } from '../lib/interop-default'
import { dim } from '../lib/picocolors'
import type { UpgradeDocument } from '../lib/upgrade/future-defaults'
import { runChildProcess } from '../lib/upgrade/run-child-process'
import loadConfig from '../server/config'
import { normalizeConfig } from '../server/config-shared'
import { PHASE_PRODUCTION_BUILD } from '../shared/lib/constants'

type NextUpgradeOptions = {
  revision: string
  verbose: boolean
  ai: boolean | string | undefined
}

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

async function resolveAIUpgradeType(
  directory: string,
  option: NextUpgradeOptions['ai']
): Promise<string> {
  if (typeof option === 'string') {
    return option
  }

  // Read and normalize the app's config without validating legacy options
  // against the current Next.js schema.
  const rawConfig = await loadConfig(PHASE_PRODUCTION_BUILD, directory, {
    rawConfig: true,
  })
  const config = await normalizeConfig(
    PHASE_PRODUCTION_BUILD,
    interopDefault(rawConfig)
  )
  const policy = config.experimental?.agenticAutoUpgrade

  return policy === 'security' || policy === 'latest' || policy === 'future'
    ? policy
    : 'security'
}

class MetadataLookupError extends Error {}

async function resolveCanaryVersion(directory: string): Promise<string> {
  const spawnCommand =
    require('next/dist/compiled/cross-spawn') as typeof import('next/dist/compiled/cross-spawn')
  const packageManager = getPkgManager(directory)
  // pnpm view delegates to npm, which does not discover pnpm workspace roots.
  // Run there so metadata and dlx use the same workspace .npmrc.
  const workspace =
    packageManager === 'pnpm'
      ? findUp.sync('pnpm-workspace.yaml', { cwd: directory })
      : undefined
  const query = (args: string[]): Promise<string> =>
    new Promise((resolve, reject) => {
      const child = spawnCommand(packageManager, args, {
        cwd: workspace ? dirname(workspace) : directory,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      const terminate = () => {
        if (child.pid !== undefined) {
          if (process.platform === 'win32') {
            spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
              stdio: 'ignore',
              windowsHide: true,
              timeout: 1_000,
            })
          } else {
            try {
              process.kill(-child.pid, 'SIGKILL')
            } catch {
              // The process group may already have exited.
            }
          }
        }
        child.stdout?.destroy()
        child.stderr?.destroy()
        child.unref()
      }
      const onInterrupt = () => {
        terminate()
        process.exit(130)
      }
      const onTerminate = () => {
        terminate()
        process.exit(143)
      }
      const cleanup = () => {
        clearTimeout(timer)
        process.removeListener('SIGINT', onInterrupt)
        process.removeListener('SIGTERM', onTerminate)
      }
      const timer = setTimeout(() => {
        cleanup()
        terminate()
        reject(
          new MetadataLookupError(
            `${packageManager} metadata lookup timed out after 10 seconds.`
          )
        )
      }, 10_000)
      process.once('SIGINT', onInterrupt)
      process.once('SIGTERM', onTerminate)

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        stdout = (stdout + chunk).slice(-16_384)
      })
      child.stderr?.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-16_384)
      })
      child.once('error', (error: NodeJS.ErrnoException) => {
        cleanup()
        terminate()
        reject(
          new MetadataLookupError(
            `Could not start ${packageManager} metadata lookup (${error.code === 'ENOENT' ? 'command not found' : 'process error'}).`
          )
        )
      })
      child.once('close', (code) => {
        cleanup()
        if (code !== 0) {
          // Report known failure codes only: package-manager diagnostics can
          // contain registry URLs, credentials, and other private configuration.
          const reason = (stdout + '\n' + stderr).match(
            /\b(?:E401|E403|E404|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|YN0033|YN0035|YN0041|YN0080|ERR_PNPM_FETCH_401|ERR_PNPM_FETCH_403|ERR_PNPM_FETCH_404)\b/
          )?.[0]
          reject(
            new MetadataLookupError(
              `${packageManager} metadata lookup failed${reason ? ` (${reason})` : ''}, exit code ${code ?? 'unknown'}. Check your registry and network configuration.`
            )
          )
          return
        }
        resolve(stdout.trim())
      })
    })

  try {
    let version: unknown
    if (packageManager === 'yarn') {
      const yarnVersion = await query(['--version'])
      if (!semver.valid(yarnVersion)) {
        throw new MetadataLookupError('Invalid Yarn version')
      }
      const classic = semver.major(yarnVersion) === 1
      const output = await query(
        classic
          ? ['info', 'next', 'dist-tags.canary', '--json']
          : ['npm', 'info', 'next', '--fields', 'dist-tags', '--json']
      )
      const records = output.split('\n').map((line) => JSON.parse(line))
      version = classic
        ? records.find((record) => record.type === 'inspect')?.data
        : records.find((record) => record.name === 'next')?.['dist-tags']
            ?.canary
    } else {
      // view uses the package manager's registry/auth/proxy configuration.
      // Query the tag itself and revalidate metadata, even with a warm cache.
      version = JSON.parse(
        await query([
          'view',
          'next',
          'dist-tags.canary',
          '--json',
          '--prefer-online',
          '--prefer-offline=false',
          '--offline=false',
        ])
      )
    }
    if (typeof version !== 'string' || !semver.valid(version)) {
      throw new MetadataLookupError('Invalid Next.js version')
    }
    return version
  } catch (error) {
    const reason =
      error instanceof MetadataLookupError
        ? error.message
        : error instanceof SyntaxError
          ? 'The package manager returned invalid JSON metadata.'
          : 'Please try again.'
    throw new Error(
      `Could not determine the current Next.js canary version. ${reason}`,
      { cause: error }
    )
  }
}

export async function spawnNextUpgrade(
  directory: string | undefined,
  options: NextUpgradeOptions
) {
  const baseDir = getProjectDir(directory)

  if (options.ai) {
    try {
      const expectedVersion = process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
      delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
      delete process.env.__NEXT_UPGRADE_USE_CURRENT_CLI

      if (expectedVersion !== undefined) {
        // Delegated upgrades and evals pin the CLI without another registry lookup.
        if (process.env.__NEXT_VERSION !== expectedVersion) {
          throw new Error(
            `Expected Next.js ${expectedVersion} for the upgrade, but launched ${process.env.__NEXT_VERSION}.`
          )
        }
      } else {
        Log.info(dim('Preparing upgrade...'))
        const canaryVersion = await resolveCanaryVersion(baseDir)
        if (process.env.__NEXT_VERSION !== canaryVersion) {
          const [command, ...runnerArgs] = getNpxCommand(baseDir).split(' ')
          const aiArgument =
            typeof options.ai === 'string' ? `--ai=${options.ai}` : '--ai'
          const args = [
            ...runnerArgs,
            `next@${canaryVersion}`,
            'upgrade',
            baseDir,
            aiArgument,
          ]

          if (options.verbose) {
            args.push('--verbose')
          }

          process.exitCode = await runChildProcess(command, args, {
            cwd: baseDir,
            stdio: 'inherit',
            env: {
              ...process.env,
              __NEXT_UPGRADE_EXPECTED_CLI_VERSION: canaryVersion,
              // Older canaries use this flag instead of the version pin.
              __NEXT_UPGRADE_USE_CURRENT_CLI: '1',
            },
          })
          return
        }
      }

      // A workspace root must not launch an upgrade for an unspecified app.
      if (!findDir(baseDir, 'app') && !findDir(baseDir, 'pages')) {
        throw new Error(
          'No Next.js app found in this directory. Run the command from an app directory or pass its path.'
        )
      }

      const upgradeType = await resolveAIUpgradeType(baseDir, options.ai)

      if (
        upgradeType !== 'security' &&
        upgradeType !== 'latest' &&
        upgradeType !== 'future'
      ) {
        throw new Error(
          `Unsupported AI upgrade type ${JSON.stringify(upgradeType)}. Expected "security", "latest", or "future".`
        )
      }

      // Resolve the requested target before preparing an agent session.
      const { prepareUpgrade } =
        require('../lib/upgrade/prepare-upgrade') as typeof import('../lib/upgrade/prepare-upgrade')
      const assessmentSpinner = createSpinner('Preparing upgrade')
      const result = await prepareUpgrade(baseDir, upgradeType).finally(() =>
        assessmentSpinner?.stop()
      )

      if (result.status !== 'ready') {
        Log.info(result.reason)
        return
      }

      const needsVersionMigration =
        result.installedVersion !== result.targetVersion

      Log.info(
        needsVersionMigration
          ? `Upgrade: Next.js ${result.installedVersion} → ${result.targetVersion}`
          : `Future Defaults: Next.js ${result.installedVersion}`
      )

      // Use the invoking CLI's guides, even when the app runs an older Next.js.
      // Retain them outside the app so dependency changes cannot remove them.
      const bundledDocs = join(__dirname, '../docs')
      const runDirectory = await mkdtemp(join(tmpdir(), 'next-upgrade-'))
      const guidePath = join(
        runDirectory,
        'docs/01-app/02-guides/upgrading/agentic-upgrade.md'
      )
      const guidesSpinner = createSpinner('Preparing upgrade')

      try {
        for (const router of ['01-app', '02-pages']) {
          await cp(
            join(bundledDocs, router, '02-guides/upgrading'),
            join(runDirectory, 'docs', router, '02-guides/upgrading'),
            { recursive: true }
          )
        }

        if (needsVersionMigration) {
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
      // TODO: Persist `latest` or `future` after the selected stable target
      // includes the `experimental.agenticAutoUpgrade` implementation.
      const reason =
        upgradeType === 'security'
          ? 'the installed version is affected by a published security advisory'
          : upgradeType === 'latest'
            ? 'a newer stable Next.js release is available'
            : 'the Future policy applies the latest stable release and adopts its Future Defaults'
      const futureDefaultsPrompt = preparedFutureDefaults.length
        ? `
${needsVersionMigration ? 'After completing and verifying the version migration, adopt' : 'Adopt'} these Future Defaults in order:
${preparedFutureDefaults
  .map(
    (futureDefault) =>
      `- ${futureDefault.name}\n${futureDefault.documents.map((document) => `  - Read and follow ${JSON.stringify(document)}.`).join('\n')}`
  )
  .join('\n')}
Complete each adoption. Temporary opt-outs and TODO markers are intermediate work only; do not stop until they are removed and the adoption is fully verified.`
        : ''

      // Pass resolved inputs directly; the agent owns repairs and verification.
      const taskSummary = needsVersionMigration
        ? `We're upgrading the app in ${JSON.stringify(baseDir)} from Next.js ${result.installedVersion} to ${result.targetVersion} because ${reason}.`
        : `We're adopting the Future Defaults available to the app in ${JSON.stringify(baseDir)}, which already uses Next.js ${result.installedVersion}.`
      const prompt = `Read and follow every applicable instruction in ${JSON.stringify(guidePath)} before proceeding.

${taskSummary}

${futureDefaultsPrompt ? `${futureDefaultsPrompt.trimStart()}\n\n` : ''}References:
${references}`

      const { handoffUpgrade } =
        require('../lib/upgrade/harness') as typeof import('../lib/upgrade/harness')
      await handoffUpgrade(prompt, baseDir)
    } catch (error) {
      Log.error(
        'Could not prepare the upgrade:',
        error instanceof Error ? error.message : error
      )
      process.exitCode = 1
    }

    return
  }

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
