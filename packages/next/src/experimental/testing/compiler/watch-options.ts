// The public CLI initializes this resolver before loading configuration. Keep
// direct compiler/watch APIs on that same ordinary Next resolver path.
import '../../../server/require-hook'
import { dirname, resolve } from 'path'
import { loadTestCompilerConfig } from './original-config-observation'
import type { TestProfile } from '../contracts'

export {
  validateTestProfile,
  loadTestCompilerConfig,
} from './original-config-observation'

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
    // Development emits inside <distDirRoot>/dev, but creating its parent is output too.
    outputDir: resolve(dir, config.distDirRoot ?? config.distDir),
    artifactParentDir: dirname(outputDir),
    artifactBasenamePrefixes: ['.next-test-', '.next-test-pending-'],
  }
}
