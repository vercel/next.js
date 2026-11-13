import path from 'path'

/**
 * Where `next start` gets the next-front executable for
 * __NEXT_EXPERIMENTAL_FRONT_SERVER=1. The launcher only needs a path to a
 * program that speaks the CLI contract in src/server/front/main.go; how that
 * program is produced can change by adding a source here.
 *
 *   override  __NEXT_EXPERIMENTAL_FRONT_SERVER_BINARY=<path>
 *             (tests, CI, local builds)
 *   bundled   dist/server/front/next-front-<os>-<arch>, built only when
 *             `next` is built with NEXT_BUILD_FRONT_SERVER=1
 */
export type FrontBinary =
  | { source: 'override'; path: string }
  | { source: 'bundled'; path: string }

export const FRONT_BINARY_OVERRIDE_ENV =
  '__NEXT_EXPERIMENTAL_FRONT_SERVER_BINARY'

const HOW_TO_GET_ONE = `Set ${FRONT_BINARY_OVERRIDE_ENV} to a next-front build (\`go build\` in packages/next/src/server/front), or build next with NEXT_BUILD_FRONT_SERVER=1, which needs Go 1.24+.`

export function findFrontBinary(
  input: Readonly<{
    env: NodeJS.ProcessEnv
    platform: NodeJS.Platform
    arch: string
    exists: (path: string) => boolean
  }>
): FrontBinary | { error: string } {
  if (input.platform === 'win32') {
    return {
      error:
        '__NEXT_EXPERIMENTAL_FRONT_SERVER=1 is not supported on Windows yet.',
    }
  }

  const override = input.env[FRONT_BINARY_OVERRIDE_ENV]
  if (override) {
    return input.exists(override)
      ? { source: 'override', path: override }
      : {
          error: `__NEXT_EXPERIMENTAL_FRONT_SERVER=1: ${FRONT_BINARY_OVERRIDE_ENV} points at ${override}, which doesn't exist. ${HOW_TO_GET_ONE}`,
        }
  }

  const goarch = getGoArch(input.arch)
  if (!goarch) {
    return {
      error: `__NEXT_EXPERIMENTAL_FRONT_SERVER=1 has no next-front binary for ${input.platform}/${input.arch}. ${HOW_TO_GET_ONE}`,
    }
  }
  const bundled = path.join(
    __dirname,
    '..',
    'front',
    `next-front-${input.platform}-${goarch}`
  )
  return input.exists(bundled)
    ? { source: 'bundled', path: bundled }
    : {
        error: `__NEXT_EXPERIMENTAL_FRONT_SERVER=1 needs the next-front binary for ${input.platform}/${input.arch}, which isn't in this build of next (expected ${bundled}). ${HOW_TO_GET_ONE}`,
      }
}

function getGoArch(arch: string): string | undefined {
  switch (arch) {
    case 'x64':
      return 'amd64'
    case 'arm64':
      return 'arm64'
    default:
      return undefined
  }
}
