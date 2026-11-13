import path from 'path'
import targets from '../front/targets.json'
import { FRONT_SERVER_BINARY_ENV, FRONT_SERVER_ENV } from './front-server-env'

/**
 * Where `next start` gets the next-front executable when
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

const HOW_TO_GET_ONE = `Set ${FRONT_SERVER_BINARY_ENV} to a next-front build (\`go build\` in packages/next/src/server/front), or build next with NEXT_BUILD_FRONT_SERVER=1, which needs the Go version in that directory's go.mod.`

export function findFrontBinary(
  input: Readonly<{
    env: NodeJS.ProcessEnv
    platform: NodeJS.Platform
    arch: string
    exists: (path: string) => boolean
  }>
): FrontBinary | { error: string } {
  if (input.platform === 'win32') {
    return { error: `${FRONT_SERVER_ENV}=1 is not supported on Windows yet.` }
  }

  const override = input.env[FRONT_SERVER_BINARY_ENV]
  if (override) {
    return input.exists(override)
      ? { source: 'override', path: override }
      : {
          error: `${FRONT_SERVER_ENV}=1: ${FRONT_SERVER_BINARY_ENV} points at ${override}, which doesn't exist. ${HOW_TO_GET_ONE}`,
        }
  }

  const goarch = Object.entries(targets.goArch).find(
    ([nodeArch]) => nodeArch === input.arch
  )?.[1]
  const isTarget = targets.targets.some(
    (target) => target.os === input.platform && target.arch === goarch
  )
  if (!goarch || !isTarget) {
    return {
      error: `${FRONT_SERVER_ENV}=1 has no next-front binary for ${input.platform}/${input.arch}. ${HOW_TO_GET_ONE}`,
    }
  }
  const bundled = path.join(
    __dirname,
    '..',
    'front',
    targets.binaryName.replace('{os}', input.platform).replace('{arch}', goarch)
  )
  return input.exists(bundled)
    ? { source: 'bundled', path: bundled }
    : {
        error: `${FRONT_SERVER_ENV}=1 needs the next-front binary for ${input.platform}/${input.arch}, which isn't in this build of next (expected ${bundled}). ${HOW_TO_GET_ONE}`,
      }
}
