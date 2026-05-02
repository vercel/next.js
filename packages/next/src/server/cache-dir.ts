import path from 'path'
import isDockerFunction from 'next/dist/compiled/is-docker'

export function getStorageDirectory(distDir: string): string | undefined {
  const isLikelyEphemeral =
    process.env.NEXT_PRIVATE_TEST_NOT_IN_DOCKER === '1'
      ? false
      : isDockerFunction()

  if (isLikelyEphemeral) {
    return undefined
  }
  return path.join(distDir, 'cache')
}
