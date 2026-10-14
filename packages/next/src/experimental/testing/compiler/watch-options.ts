import { dirname, resolve } from 'path'
import loadConfig from '../../../server/config'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from '../../../shared/lib/constants'
import type { TestProfile } from '../contracts'

/** Keep compiler and watch metadata on the same supported configuration path. */
export function validateTestProfile(profile: TestProfile): void {
  if (
    !['rsc', 'node', 'browser'].includes(profile.environment) ||
    !['development', 'production'].includes(profile.mode) ||
    profile.runtime !== 'nodejs' ||
    profile.bundler !== 'turbopack' ||
    profile.route !== undefined
  ) {
    throw new Error(
      'The test compiler currently supports route-less development or production Node, App RSC, and Node browser-driver entries with Turbopack only'
    )
  }
}

export async function loadTestCompilerConfig(
  projectDir: string,
  profile: TestProfile
) {
  validateTestProfile(profile)
  if (process.env.NODE_ENV && process.env.NODE_ENV !== profile.mode) {
    throw new Error(
      `Test compilation for ${profile.mode} requires NODE_ENV=${profile.mode}`
    )
  }
  const dir = resolve(projectDir)
  return {
    dir,
    config: await loadConfig(
      profile.mode === 'development'
        ? PHASE_DEVELOPMENT_SERVER
        : PHASE_PRODUCTION_BUILD,
      dir
    ),
  }
}

/**
 * Watch scope from actual Next configuration, without acquiring a native graph.
 * This is filesystem scope metadata, not proof of a complete dependency graph.
 */
export async function resolveTestWatchOptions(
  projectDir: string,
  profile: TestProfile
) {
  const { dir, config } = await loadTestCompilerConfig(projectDir, profile)
  const root = resolve(
    config.turbopack?.root || config.outputFileTracingRoot || dir
  )
  const outputDir = resolve(dir, config.distDir)
  return {
    roots: [...new Set([root, dir])],
    outputDir,
    artifactParentDir: dirname(outputDir),
    artifactBasenamePrefixes: ['.next-test-', '.next-test-pending-'],
  }
}
