import path from 'path'
import targets from '../switchyard/targets.json'
import { SWITCHYARD_BINARY_ENV, SWITCHYARD_ENV } from './switchyard-env'

/**
 * Where `next start` gets the switchyard executable when
 * __NEXT_EXPERIMENTAL_SWITCHYARD=1. The launcher only needs a path to a
 * program that speaks the CLI contract in src/server/switchyard/main.go; how that
 * program is produced can change by adding a source here.
 *
 *   override  __NEXT_EXPERIMENTAL_SWITCHYARD_BINARY=<path>
 *             (tests, CI, local builds)
 *   bundled   dist/server/switchyard/switchyard-<os>-<arch>, built only when
 *             `next` is built with NEXT_BUILD_SWITCHYARD=1
 */
export type SwitchyardBinary =
  | { source: 'override'; path: string }
  | { source: 'bundled'; path: string }

const HOW_TO_GET_ONE = `Set ${SWITCHYARD_BINARY_ENV} to a switchyard build (\`go build\` in packages/next/src/server/switchyard), or build next with NEXT_BUILD_SWITCHYARD=1, which needs the Go version in that directory's go.mod.`

export function findSwitchyardBinary(
  input: Readonly<{
    env: NodeJS.ProcessEnv
    platform: NodeJS.Platform
    arch: string
    exists: (path: string) => boolean
  }>
): SwitchyardBinary | { error: string } {
  if (input.platform === 'win32') {
    return { error: `${SWITCHYARD_ENV}=1 is not supported on Windows yet.` }
  }

  const override = input.env[SWITCHYARD_BINARY_ENV]
  if (override) {
    return input.exists(override)
      ? { source: 'override', path: override }
      : {
          error: `${SWITCHYARD_ENV}=1: ${SWITCHYARD_BINARY_ENV} points at ${override}, which doesn't exist. ${HOW_TO_GET_ONE}`,
        }
  }

  // Go names architectures differently from Node (`x64` is `amd64`).
  const goarch = new Map(Object.entries(targets.goArch)).get(input.arch)
  const isTarget = targets.targets.some(
    (target) => target.os === input.platform && target.arch === goarch
  )
  if (!goarch || !isTarget) {
    return {
      error: `${SWITCHYARD_ENV}=1 has no switchyard binary for ${input.platform}/${input.arch}. ${HOW_TO_GET_ONE}`,
    }
  }
  const bundled = path.join(
    __dirname,
    '..',
    'switchyard',
    targets.binaryName.replace('{os}', input.platform).replace('{arch}', goarch)
  )
  return input.exists(bundled)
    ? { source: 'bundled', path: bundled }
    : {
        error: `${SWITCHYARD_ENV}=1 needs the switchyard binary for ${input.platform}/${input.arch}, which isn't in this build of next (expected ${bundled}). ${HOW_TO_GET_ONE}`,
      }
}
