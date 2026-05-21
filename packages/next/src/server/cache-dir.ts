import path from 'path'
import isDockerFunction from 'next/dist/compiled/is-docker'

export function getStorageDirectory(distDir: string): string | undefined {
  // Allow CI environments (notably the Microsoft Playwright Docker image used
  // by our own CI) to opt out of the Docker auto-detection. The detection
  // assumes ephemeral storage and short-circuits to `undefined`, which forces
  // preview/server-action keys to be regenerated on every build and breaks
  // tests asserting determinism between consecutive builds in the same
  // workspace.
  if (process.env.NEXT_IGNORE_IS_DOCKER === '1') {
    return path.join(distDir, 'cache')
  }

  const isLikelyEphemeral = isDockerFunction()

  if (isLikelyEphemeral) {
    return undefined
  }
  return path.join(distDir, 'cache')
}
