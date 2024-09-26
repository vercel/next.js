import isDockerFunction from 'next/dist/compiled/is-docker'
import path from 'path'
import { isCI } from './ci-info'

export function getStorageDirectory(distDir: string): string | undefined {
  const isLikelyEphemeral = isCI || isDockerFunction()
  if (isLikelyEphemeral) {
    return path.join(distDir, 'cache')
  }
  return undefined
}
