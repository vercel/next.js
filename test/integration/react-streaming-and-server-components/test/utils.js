import { join } from 'path'
import {
  launchApp,
  nextBuild as _nextBuild,
  nextStart as _nextStart,
} from 'next-test-utils'

const nodeArgs = ['-r', join(__dirname, '../../react-18/test/require-hook.js')]

export async function nextBuild(dir, options) {
  return await _nextBuild(dir, [], {
    ...options,
    stdout: true,
    stderr: true,
    nodeArgs,
  })
}

export async function nextStart(dir, port) {
  return await _nextStart(dir, port, {
    stdout: true,
    stderr: true,
    nodeArgs,
  })
}

export async function nextDev(dir, port) {
  return await launchApp(dir, port, {
    stdout: true,
    stderr: true,
    nodeArgs,
  })
}
