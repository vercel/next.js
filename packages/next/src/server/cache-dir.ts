import isDockerFunction from 'next/dist/compiled/is-docker'
import path from 'path'
// import { isCI } from './ci-info'

export function getStorageDirectory(distDir: string): string | undefined {
  const isLikelyEphemeral = isDockerFunction()

  if (isLikelyEphemeral) {
    return undefined
  }
  return path.join(distDir, 'cache')
}
