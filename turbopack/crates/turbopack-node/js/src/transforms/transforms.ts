/**
 * Shared utilities for our 2 transform implementations.
 */

import type { Ipc } from '../ipc/evaluate'
import { type StructuredError } from '../ipc'
import { type StackFrame } from '../compiled/stacktrace-parser'

// Check if we're running in Edge Runtime
const isEdgeRuntime = typeof globalThis.EdgeRuntime !== 'undefined' || 
  (typeof process !== 'undefined' && process.env?.NEXT_RUNTIME === 'edge')

// Conditionally import Node.js modules only when not in Edge Runtime
let relative: any, isAbsolute: any, join: any, sep: any
if (!isEdgeRuntime) {
  const path = require('path')
  relative = path.relative
  isAbsolute = path.isAbsolute
  join = path.join
  sep = path.sep
}

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

export type IpcRequestMessage = {
  type: 'resolve'
  options: any
  lookupPath: string
  request: string
}

export type TransformIpc = Ipc<IpcInfoMessage, IpcRequestMessage>

// Get context directory in a way that works in both Node.js and Edge Runtime
const getContextDir = () => {
  if (!isEdgeRuntime && typeof process !== 'undefined' && process.cwd) {
    return process.cwd()
  }
  // In Edge Runtime, use a placeholder that will be replaced at runtime
  return '/ROOT'
}

const contextDir = getContextDir()

export const toPath = (file: string) => {
  if (isEdgeRuntime) {
    // In Edge Runtime, perform simplified path operations
    if (file.startsWith(contextDir)) {
      const relPath = file.slice(contextDir.length)
      return relPath.startsWith('/') ? relPath.slice(1) : relPath
    }
    throw new Error(
      `Cannot depend on path (${file}) outside of root directory (${contextDir})`
    )
  }
  
  // Node.js path operations
  const relPath = relative(contextDir, file)
  if (isAbsolute(relPath)) {
    throw new Error(
      `Cannot depend on path (${file}) outside of root directory (${contextDir})`
    )
  }
  return sep !== '/' ? relPath.replaceAll(sep, '/') : relPath
}

export const fromPath = (path: string) => {
  if (isEdgeRuntime) {
    // In Edge Runtime, perform simplified path operations
    const normalizedPath = path.startsWith('/') ? path : '/' + path
    return contextDir + normalizedPath
  }
  
  // Node.js path operations
  return join(contextDir, sep !== '/' ? path.replaceAll('/', sep) : path)
}

// Patch process.env to track which env vars are read
const readEnvVars = new Set<string>()

if (!isEdgeRuntime && typeof process !== 'undefined' && process.env) {
  const originalEnv = process.env
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
}

export function getReadEnvVariables(): string[] {
  return Array.from(readEnvVars)
}
