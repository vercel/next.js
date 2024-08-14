import isDockerFunction from 'next/dist/compiled/is-docker'
import path from 'path'
import * as ciEnvironment from './ci-info'

export function getStorageDirectory(distDir: string): string | undefined {
  const isLikelyEphemeral = ciEnvironment.isCI || isDockerFunction()

  if (isLikelyEphemeral) {
    return path.join(distDir, 'cache')
  }

  return undefined
}
