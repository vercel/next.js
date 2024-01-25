#!/usr/bin/env node

import os from 'os'
import childProcess from 'child_process'

import { bold, cyan, yellow } from '../lib/picocolors'
import type { CliCommand } from '../lib/commands'
import { PHASE_INFO } from '../shared/lib/constants'
import loadConfig from '../server/config'
import { getRegistry } from '../lib/helpers/get-registry'
import { parseVersionInfo } from '../server/dev/parse-version-info'
import { getStaleness } from '../client/components/react-dev-overlay/internal/components/VersionStalenessInfo/VersionStalenessInfo'
import { warn } from '../build/output/log'

const dir = process.cwd()

type TaskResult = {
  // Additional messages to notify to the users, i.e certain script cannot be run due to missing xyz.
  messages?: string | undefined
  // Output of the script, either fails or success. This'll be printed to stdout or written into a file.
  output?: string | undefined
  result: 'pass' | 'fail' | 'skipped'
}

type TaskScript = () => Promise<TaskResult>
type PlatformTaskScript =
  | {
      win32: TaskScript
      linux?: TaskScript
      darwin?: TaskScript
      default?: TaskScript
    }
  | {
      linux: TaskScript
      win32?: TaskScript
      darwin?: TaskScript
      default?: TaskScript
    }
  | {
      darwin: TaskScript
      win32?: TaskScript
      linux?: TaskScript
      default?: TaskScript
    }
  | {
      // A common task script if task does not need to be platform specific.
      default: TaskScript
      win32?: TaskScript
      linux?: TaskScript
      darwin?: TaskScript
    }

function getPackageVersion(packageName: string) {
  try {
    return require(`${packageName}/package.json`).version
  } catch {
    return 'N/A'
  }
}

async function getNextConfig() {
  const config = await loadConfig(PHASE_INFO, dir)

  return {
    output: config.output ?? 'N/A',
    experimental: {
      useWasmBinary: config.experimental?.useWasmBinary,
    },
  }
}

/**
 * Returns the version of the specified binary, by supplying `--version` argument.
 * N/A if it fails to run the binary.
 */
function getBinaryVersion(binaryName: string) {
  try {
    return childProcess
      .execFileSync(binaryName, ['--version'])
      .toString()
      .trim()
  } catch {
    return 'N/A'
  }
}

function printHelp() {
  console.log(
    `
Description
  Prints relevant details about the current system which can be used to report Next.js bugs

Usage
  $ next info

Options
  --help, -h    Displays this message
  --verbose     Collect additional information for debugging

Learn more: ${cyan('https://nextjs.org/docs/api-reference/cli#info')}`
  )
}

/**
 * Collect basic next.js installation information and print it to stdout.
 */
async function printDefaultInfo() {
  const installedRelease = getPackageVersion('next')
  const nextConfig = await getNextConfig()

  let stalenessWithTitle = ''
  let title = ''
  let versionInfo
  try {
    const registry = getRegistry()
    const res = await fetch(`${registry}-/package/next/dist-tags`)

    const tags = await res.json()

    versionInfo = parseVersionInfo({
      installed: installedRelease,
      latest: tags.latest,
      canary: tags.canary,
    })
    title = getStaleness(versionInfo).title
    if (title) stalenessWithTitle = ` // ${title}`
  } catch (e) {
    console.warn(
      `${yellow(
        bold('warn')
      )}  - Failed to fetch latest canary version. (Reason: ${
        (e as Error).message
      }.)
      Detected "${installedRelease}". Visit https://github.com/vercel/next.js/releases.
      Make sure to try the latest canary version (eg.: \`npm install next@canary\`) to confirm the issue still exists before creating a new issue.
      Read more - https://nextjs.org/docs/messages/opening-an-issue`
    )
  }

  console.log(`
Operating System:
  Platform: ${os.platform()}
  Arch: ${os.arch()}
  Version: ${os.version()}
Binaries:
  Node: ${process.versions.node}
  npm: ${getBinaryVersion('npm')}
  Yarn: ${getBinaryVersion('yarn')}
  pnpm: ${getBinaryVersion('pnpm')}
Relevant Packages:
  next: ${installedRelease}${stalenessWithTitle}
  eslint-config-next: ${getPackageVersion('eslint-config-next')}
  react: ${getPackageVersion('react')}
  react-dom: ${getPackageVersion('react-dom')}
  typescript: ${getPackageVersion('typescript')}
Next.js Config:
  output: ${nextConfig.output}

`)

  if (versionInfo?.staleness.startsWith('stale')) {
    warn(`${title}
   Please try the latest canary version (\`npm install next@canary\`) to confirm the issue still exists before creating a new issue.
   Read more - https://nextjs.org/docs/messages/opening-an-issue`)
  }
}

/**
 * Using system-installed tools per each platform, trying to read shared dependencies of next-swc.
 * This is mainly for debugging DLOPEN failure.
 *
 * We don't / can't install these tools by ourselves, will skip the check if we can't find them.
 */
async function runSharedDependencyCheck(
  tools: Array<{ bin: string; checkArgs: Array<string>; args: Array<string> }>,
  skipMessage: string
): Promise<TaskResult> {
  const currentPlatform = os.platform()
  const spawn = require('next/dist/compiled/cross-spawn')
  const { getSupportedArchTriples } = require('../build/swc')
  const triples = getSupportedArchTriples()[currentPlatform]?.[os.arch()] ?? []
  // First, check if system have a tool installed. We can't install these by our own.

  const availableTools = []
  for (const tool of tools) {
    try {
      const check = spawn.sync(tool.bin, tool.checkArgs)
      if (check.status === 0) {
        availableTools.push(tool)
      }
    } catch {
      // ignore if existence check fails
    }
  }

  if (availableTools.length === 0) {
    return {
      messages: skipMessage,
      result: 'skipped',
    }
  }

  const outputs: Array<string> = []
  let result: 'pass' | 'fail' = 'fail'

  for (const triple of triples) {
    const triplePkgName = `@next/swc-${triple.platformArchABI}`
    let resolved
    try {
      resolved = require.resolve(triplePkgName)
    } catch (e) {
      return {
        messages:
          'Cannot find next-swc installation, skipping dependencies check',
        result: 'skipped',
      }
    }

    for (const tool of availableTools) {
      const proc = spawn(tool.bin, [...tool.args, resolved])
      outputs.push(`Running ${tool.bin} ------------- `)
      // Captures output, doesn't matter if it fails or not since we'll forward both to output.
      const procPromise = new Promise((resolve) => {
        proc.stdout.on('data', function (data: string) {
          outputs.push(data)
        })
        proc.stderr.on('data', function (data: string) {
          outputs.push(data)
        })
        proc.on('close', (c: any) => resolve(c))
      })

      let code = await procPromise
      if (code === 0) {
        result = 'pass'
      }
    }
  }

  return {
    output: outputs.join('\n'),
    result,
  }
}

/**
 * Collect additional diagnostics information.
 */
async function printVerbose() {
  const fs = require('fs')
  const currentPlatform = os.platform()

  if (
    currentPlatform !== 'win32' &&
    currentPlatform !== 'linux' &&
    currentPlatform !== 'darwin'
  ) {
    console.log(
      'Unsupported platform, only win32, linux, darwin are supported.'
    )
    return
  }

  // List of tasks to run.
  const tasks: Array<{
    title: string
    // If specified, only run this task on the specified platform.
    targetPlatform?: string | undefined
    scripts: PlatformTaskScript
  }> = [
    {
      title: 'Host system information',
      scripts: {
        default: async () => {
          // Node.js diagnostic report contains basic information, i.e OS version, CPU architecture, etc.
          // Only collect few addtional details here.
          const isWsl = require('next/dist/compiled/is-wsl')
          const ciInfo = require('next/dist/compiled/ci-info')
          const isDocker = require('next/dist/compiled/is-docker')

          const output = `
  WSL: ${isWsl}
  Docker: ${isDocker()}
  CI: ${ciInfo.isCI ? ciInfo.name || 'unknown' : 'false'}
`

          return {
            output,
            result: 'pass',
          }
        },
      },
    },
    {
      title: 'Next.js installation',
      scripts: {
        default: async () => {
          const installedRelease = getPackageVersion('next')
          const nextConfig = await getNextConfig()
          const output = `
  Binaries:
    Node: ${process.versions.node}
    npm: ${getBinaryVersion('npm')}
    Yarn: ${getBinaryVersion('yarn')}
    pnpm: ${getBinaryVersion('pnpm')}
  Relevant Packages:
    next: ${installedRelease}
    eslint-config-next: ${getPackageVersion('eslint-config-next')}
    react: ${getPackageVersion('react')}
    react-dom: ${getPackageVersion('react-dom')}
    typescript: ${getPackageVersion('typescript')}
  Next.js Config:
    output: ${nextConfig.output}

`
          return {
            output,
            result: 'pass',
          }
        },
      },
    },
    {
      title: 'Node.js diagnostic report',
      scripts: {
        default: async () => {
          const report = process.report?.getReport()

          if (!report) {
            return {
              messages: 'Node.js diagnostic report is not available.',
              result: 'fail',
            }
          }

          const { header, javascriptHeap, sharedObjects } =
            report as any as Record<string, any>
          // Delete some fields potentially containing sensitive information.
          delete header?.cwd
          delete header?.commandLine
          delete header?.host
          delete header?.cpus
          delete header?.networkInterfaces

          const reportSummary = {
            header,
            javascriptHeap,
            sharedObjects,
          }

          return {
            output: JSON.stringify(reportSummary, null, 2),
            result: 'pass',
          }
        },
      },
    },
    {
      title: 'next-swc installation',
      scripts: {
        default: async () => {
          const output = [] as any

          // First, try to load next-swc via loadBindings.
          try {
            let nextConfig = await getNextConfig()
            const { loadBindings } = require('../build/swc')
            const bindings = await loadBindings(
              nextConfig.experimental?.useWasmBinary
            )
            // Run arbitary function to verify the bindings are loaded correctly.
            const target = bindings.getTargetTriple()

            // We think next-swc is installed correctly if getTargetTriple returns.
            return {
              output: `next-swc is installed correctly for ${target}`,
              result: 'pass',
            }
          } catch (e) {
            output.push(`loadBindings() failed: ${(e as Error).message}`)
          }

          const {
            platformArchTriples,
          } = require('next/dist/compiled/@napi-rs/triples')
          const triples = platformArchTriples[currentPlatform]?.[os.arch()]

          if (!triples || triples.length === 0) {
            return {
              messages: `No target triples found for ${currentPlatform} / ${os.arch()}`,
              result: 'fail',
            }
          }

          // Trying to manually resolve corresponding target triples to see if bindings are physically located.
          const path = require('path')
          let fallbackBindingsDirectory
          try {
            const nextPath = path.dirname(require.resolve('next/package.json'))
            fallbackBindingsDirectory = path.join(nextPath, 'next-swc-fallback')
          } catch (e) {
            // Not able to locate next package from current running location, skipping fallback bindings check.
          }

          const tryResolve = (pkgName: string) => {
            try {
              const resolved = require.resolve(pkgName)
              const fileExists = fs.existsSync(resolved)
              let loadError
              let loadSuccess

              try {
                loadSuccess = !!require(resolved).getTargetTriple()
              } catch (e) {
                loadError = (e as Error).message
              }

              output.push(
                `${pkgName} exists: ${fileExists} for the triple ${loadSuccess}`
              )
              if (loadError) {
                output.push(`${pkgName} load failed: ${loadError ?? 'unknown'}`)
              }

              if (loadSuccess) {
                return true
              }
            } catch (e) {
              output.push(
                `${pkgName} resolve failed: ${
                  (e as Error).message ?? 'unknown'
                }`
              )
            }
            return false
          }

          for (const triple of triples) {
            const triplePkgName = `@next/swc-${triple.platformArchABI}`
            // Check installed optional dependencies. This is the normal way package being installed.
            // For the targets have multiple triples (gnu / musl), if any of them loads successfully, we consider as installed.
            if (tryResolve(triplePkgName)) {
              break
            }

            // Check if fallback binaries are installed.
            if (!fallbackBindingsDirectory) {
              continue
            }

            tryResolve(path.join(fallbackBindingsDirectory, triplePkgName))
          }

          return {
            output: output.join('\n'),
            result: 'pass',
          }
        },
      },
    },
    {
      // For the simplicity, we only check the correctly installed optional dependencies -
      // as this is mainly for checking DLOPEN failure. If user hit MODULE_NOT_FOUND,
      // expect above next-swc installation would give some hint instead.
      title: 'next-swc shared object dependencies',
      scripts: {
        linux: async () => {
          const skipMessage =
            'This diagnostics uses system-installed tools (ldd) to check next-swc dependencies, but it is not found. Skipping dependencies check.'

          return await runSharedDependencyCheck(
            [
              {
                bin: 'ldd',
                checkArgs: ['--help'],
                args: ['--verbose'],
              },
            ],
            skipMessage
          )
        },
        win32: async () => {
          const skipMessage = `This diagnostics uses system-installed tools (dumpbin.exe) to check next-swc dependencies, but it was not found in the path. Skipping dependencies check.
          dumpbin (https://learn.microsoft.com/en-us/cpp/build/reference/dumpbin-reference) is a part of Microsoft VC toolset,
          can be installed with Windows SDK, Windows Build tools or Visual Studio.

          Please make sure you have one of them installed and dumpbin.exe is in the path.
          `

          return await runSharedDependencyCheck(
            [
              {
                bin: 'dumpbin.exe',
                checkArgs: ['/summary'],
                args: ['/imports'],
              },
            ],
            skipMessage
          )
        },
        darwin: async () => {
          const skipMessage =
            'This diagnostics uses system-installed tools (otools, dyld_info) to check next-swc dependencies, but none of them are found. Skipping dependencies check.'

          return await runSharedDependencyCheck(
            [
              {
                bin: 'otool',
                checkArgs: ['--version'],
                args: ['-L'],
              },
              {
                bin: 'dyld_info',
                checkArgs: [],
                args: [],
              },
            ],
            skipMessage
          )
        },
      },
    },
  ]

  // Collected output after running all tasks.
  const report: Array<{
    title: string
    result: TaskResult
  }> = []

  console.log('\n')
  for (const task of tasks) {
    if (task.targetPlatform && task.targetPlatform !== currentPlatform) {
      report.push({
        title: task.title,
        result: {
          messages: undefined,
          output: `[SKIPPED (${os.platform()} / ${task.targetPlatform})] ${
            task.title
          }`,
          result: 'skipped',
        },
      })
      continue
    }

    const taskScript = task.scripts[currentPlatform] ?? task.scripts.default!
    let taskResult: TaskResult
    try {
      taskResult = await taskScript()
    } catch (e) {
      taskResult = {
        messages: `Unexpected failure while running diagnostics: ${
          (e as Error).message
        }`,
        result: 'fail',
      }
    }

    console.log(`- ${task.title}: ${taskResult.result}`)
    if (taskResult.messages) {
      console.log(`  ${taskResult.messages}`)
    }

    report.push({
      title: task.title,
      result: taskResult,
    })
  }

  console.log(`\n${bold('Generated diagnostics report')}`)

  console.log(`\nPlease copy below report and paste it into your issue.`)
  for (const { title, result } of report) {
    console.log(`\n### ${title}`)

    if (result.messages) {
      console.log(result.messages)
    }

    if (result.output) {
      console.log(result.output)
    }
  }
}

/**
 * Runs few scripts to collect system information to help with debugging next.js installation issues.
 * There are 2 modes, by default it collects basic next.js installation with runtime information. If
 * `--verbose` mode is enabled it'll try to collect, verify more data for next-swc installation and others.
 */
const nextInfo: CliCommand = async (args) => {
  if (args['--help']) {
    printHelp()
    return
  }

  if (!args['--verbose']) {
    await printDefaultInfo()
  } else {
    await printVerbose()
  }
}

export { nextInfo }
