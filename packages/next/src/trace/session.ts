import { readFileSync } from 'node:fs'
import os from 'node:os'
import findUp from 'next/dist/compiled/find-up'
import { getGitBranch, getGitCommit } from '../lib/helpers/git'
import { traceId } from './shared'
import type { Telemetry } from '../telemetry/storage'

export function getSessionAttributes(
  dir: string,
  mode: 'dev' | 'build',
  isTurboSession: boolean,
  telemetry?: Telemetry
) {
  let pkgName = ''
  try {
    const file = findUp.sync('package.json', { cwd: dir })
    if (file) {
      const name = JSON.parse(readFileSync(file, 'utf8')).name
      if (typeof name === 'string') pkgName = name
    }
  } catch {}
  let anonymousId = ''
  try {
    anonymousId = telemetry?.anonymousId ?? ''
  } catch {}
  // Keep the application's Resource unchanged; session metadata belongs to work.
  return {
    'next.tooling.session_id': traceId,
    'next.tooling.telemetry_session_id': telemetry?.sessionId ?? '',
    'next.tooling.anonymous_id': anonymousId,
    'next.tooling.arch': os.arch(),
    'next.tooling.branch': getGitBranch(dir) ?? '',
    'next.tooling.commit': getGitCommit(dir) ?? '',
    'next.tooling.cpus': os.availableParallelism(),
    'next.tooling.vercel_environment': !!process.env.VERCEL,
    'next.tooling.turbopack': isTurboSession,
    'next.tooling.mode': mode,
    'next.tooling.version': process.env.__NEXT_VERSION ?? '',
    'next.tooling.package_name': pkgName,
    'next.tooling.platform': os.platform(),
  }
}
