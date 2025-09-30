/**
 * Shared utilities for our 2 transform implementations.
 */

import type { Ipc } from '../ipc/evaluate'
import { relative, isAbsolute, join, sep } from 'path'
import { type StructuredError } from '../ipc'
import { type StackFrame } from '../compiled/stacktrace-parser'

export type IpcInfoMessage =
  | {
      type: 'dependencies'
      envVariables?: string[]
      directories?: Array<[string, string]>
      filePaths?: string[]
      buildFilePaths?: string[]
    }
  | {
      type: 'emittedError'
      severity: 'warning' | 'error'
      error: StructuredError
    }
  | {
      type: 'log'
      logs: Array<{
        time: number
        logType: string
        args: any[]
        trace?: StackFrame[]
      }>
    }

export type IpcRequestMessage =
  | {
      type: 'resolve'
      options: any
      lookupPath: string
      request: string
    }
  | {
      type: 'trackFileRead'
      file: string
    }

export type TransformIpc = Ipc<IpcInfoMessage, IpcRequestMessage>

const contextDir = process.cwd()
export const toPath = (file: string) => {
  const relPath = relative(contextDir, file)
  if (isAbsolute(relPath)) {
    throw new Error(
      `Cannot depend on path (${file}) outside of root directory (${contextDir})`
    )
  }
  return sep !== '/' ? relPath.replaceAll(sep, '/') : relPath
}
export const fromPath = (path: string) => {
  return join(
    /* turbopackIgnore: true */ contextDir,
    sep !== '/' ? path.replaceAll('/', sep) : path
  )
}

// Patch process.env to track which env vars are read
const originalEnv = process.env
const readEnvVars = new Set<string>()
process.env = new Proxy(originalEnv, {
  get(target, prop) {
    if (typeof prop === 'string') {
      // We register the env var as dependency on the
      // current transform and all future transforms
      // since the env var might be cached in module scope
      // and influence them all
      readEnvVars.add(prop)
    }
    return Reflect.get(target, prop)
  },
  set(target, prop, value) {
    return Reflect.set(target, prop, value)
  },
})

export function getReadEnvVariables(): string[] {
  return Array.from(readEnvVars)
}
