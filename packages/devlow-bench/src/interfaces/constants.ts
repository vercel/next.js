import os from 'node:os'
import { command } from '../shell.js'

export const UNIT_MAPPING: Record<string, string> = {
  ms: 'millisecond',
  requests: 'request',
  bytes: 'byte',
}

export const GIT_SHA =
  process.env.GITHUB_SHA ??
  (await (async () => {
    const cmd = command('git', ['rev-parse', 'HEAD'])
    await cmd.ok()
    return cmd.output.trim()
  })())

export const GIT_BRANCH =
  process.env.GITHUB_REF_NAME ??
  (await (async () => {
    const cmd = command('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
    await cmd.ok()
    return cmd.output.trim()
  })())

export const IS_CI = Boolean(process.env.CI)
export const OS = process.platform
export const OS_RELEASE = os.release()
export const NUM_CPUS = os.cpus().length
export const CPU_MODEL = os.cpus()[0].model
export const USERNAME = os.userInfo().username
export const CPU_ARCH = os.arch()
export const NODE_VERSION = process.version
