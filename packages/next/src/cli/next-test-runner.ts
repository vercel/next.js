import { realpath } from 'fs/promises'
import path from 'path'
import { loadTestConfig } from '../experimental/testing/config'
import { discoverTests } from '../experimental/testing/discovery'
import {
  requireTestCapability,
  testCapabilities,
} from '../experimental/testing/capabilities'

export interface NextTestRunnerOptions {
  list?: boolean
  run?: boolean
  watch?: boolean
  update?: boolean
  capabilities?: boolean
  coverage?: boolean
  project?: string
  filter?: string[]
}

export async function nextTestRunner(
  directory: string | undefined,
  options: NextTestRunnerOptions
): Promise<void> {
  if (options.capabilities) {
    if (
      options.list ||
      options.run ||
      options.watch ||
      options.update ||
      options.coverage
    ) {
      throw new Error(
        '--capabilities cannot be combined with execution or listing options.'
      )
    }
    console.log(JSON.stringify(testCapabilities, null, 2))
    return
  }
  if (options.coverage && options.update) {
    throw new Error('--coverage cannot be combined with --update.')
  }
  if (options.coverage && (options.watch || options.list)) {
    throw new Error(
      '--coverage requires a one-shot execution; --watch and --list are unsupported.'
    )
  }
  if (options.coverage) requireTestCapability('coverage')
  if (options.watch && (options.run || options.list || options.update)) {
    throw new Error(
      '--watch cannot be combined with --run, --list, or --update.'
    )
  }
  if (options.list && options.update) {
    throw new Error('--update cannot be combined with --list.')
  }
  if (options.watch) requireTestCapability('watch')
  if (options.update) requireTestCapability('snapshotUpdate')
  const projectDir = await realpath(path.resolve(directory ?? '.'))
  const config = await loadTestConfig(projectDir)
  const projects = await discoverTests(projectDir, config, {
    project: options.project,
    files: options.filter,
  })
  const entries = projects.flatMap((project) => project.entries)
  if (entries.length === 0 && !options.watch) {
    throw new Error('No test files matched the selected projects and filters.')
  }
  if (options.list) {
    for (const entry of entries) {
      const { profile } = entry
      console.log(
        `${entry.id} [${profile.environment}, ${profile.mode}, ${profile.runtime}, ${profile.bundler}]`
      )
    }
    console.log(`${entries.length} test file(s) selected.`)
    return
  }
  for (const project of projects) {
    if (!project.entries.length || project.profile.mode !== 'production')
      continue
    requireTestCapability('production')
    if (project.profile.route !== undefined) {
      throw new Error(
        'Production test execution supports route-less profiles only; route and layout context is unsupported.'
      )
    }
    if (
      !(
        testCapabilities.features.production.environments as readonly string[]
      ).includes(project.profile.environment)
    ) {
      throw new Error(
        'Unsupported production test environment. Supported environments are Node, RSC, and browser drivers.'
      )
    }
  }
  const controller = new AbortController()
  const forceColor = process.env.FORCE_COLOR
  const reporter = {
    version: process.env.__NEXT_VERSION ?? 'unknown',
    writeError: (text: string) => process.stderr.write(text),
    isTTY: process.stdout.isTTY === true,
    columns: process.stdout.columns,
    color:
      forceColor !== undefined
        ? forceColor !== '0'
        : process.env.NO_COLOR === undefined &&
          process.env.NODE_DISABLE_COLORS === undefined &&
          !process.env.CI &&
          process.stdout.isTTY === true &&
          process.env.TERM !== 'dumb',
  }
  const cancel = () => controller.abort(new Error('Test run interrupted.'))
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  try {
    if (options.watch) {
      const { watchTests } = await import(
        '../experimental/testing/watch-orchestrator.js'
      )
      const result = await watchTests(projectDir, {
        project: options.project,
        files: options.filter,
        signal: controller.signal,
        write: (text) => process.stdout.write(text),
        reporter,
      })
      process.exitCode = result.status === 'cancelled' ? 130 : 1
      return
    }
    const { runTests } = await import('../experimental/testing/orchestrator.js')
    const summary = await runTests(projectDir, projects, {
      signal: controller.signal,
      write: (text) => process.stdout.write(text),
      reporter,
      updateSnapshots: options.update ?? false,
      coverage: options.coverage ?? false,
    })
    if (summary.status !== 'passed') {
      process.exitCode = summary.status === 'cancelled' ? 130 : 1
    }
  } finally {
    process.removeListener('SIGINT', cancel)
    process.removeListener('SIGTERM', cancel)
  }
}
