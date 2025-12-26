import type { ChildProcess } from 'child_process'

export interface TuiLogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'wait' | 'event' | 'trace' | 'ready'
  message: string
  /** Additional lines that belong to this log entry */
  extraLines?: string[]
  /** Structured data for requests/fetches (avoids string parsing) */
  structured?: StructuredLogData
  /** Source of the log: 'system' for Next.js internals, 'userland' for user code */
  source?: 'system' | 'userland' | 'browser'
}

export interface FetchMetricData {
  method: string
  url: string
  status: number
  totalTime: number
  cacheStatus?: string
  cacheReason?: string
  cacheWarning?: string
}

export type StructuredLogData =
  | {
      type: 'request'
      method: string
      url: string
      status: number
      totalTime: number
      /** 'load' for initial page load, 'nav' for client navigation (RSC), 'action' for server action */
      requestType?: 'load' | 'nav' | 'action'
      /** The action ID if this is a server action request */
      actionId?: string | null
      /** The function name if this is a server action (from manifest) */
      actionName?: string
      /** The file where the action is defined (from manifest) */
      actionFile?: string
      timings?: Array<{ label: string; time: number }>
      fetchMetrics?: FetchMetricData[]
    }
  | {
      type: 'fetch'
      method: string
      url: string
      status: number
      totalTime: number
      cacheStatus?: string
      cacheReason?: string
      cacheWarning?: string
    }
  | {
      type: 'cache-info'
      cacheStatus: string
      cacheReason: string
    }
  | {
      type: 'warning'
      message: string
    }
  | {
      type: 'console'
      /** 'browser' or 'server' */
      source: 'browser' | 'server'
      /** console method: log, warn, error, etc */
      method: string
      /** The log message */
      message: string
      /** Source-mapped location like "app/page.tsx:10:5" (browser logs) */
      location?: string
      /** Source-mapped stack trace lines (browser logs) */
      stack?: string[]
      /** Raw stack trace string (server logs) - parsed lazily in TUI */
      rawStack?: string
    }

export interface CompilationState {
  loading: boolean
  trigger?: string
  url?: string
  errors?: string[]
  warnings?: string[]
  totalModulesCount?: number
}

export type LogFilter = 'all' | 'errors' | 'warnings' | 'requests' | 'console'

export interface TuiState {
  logs: TuiLogEntry[]
  serverUrl: string
  isReady: boolean
  logFilter: LogFilter
  compilationState: CompilationState
}

// IPC message types from child to parent
export type TuiIpcMessage =
  | {
      type: 'log'
      payload: { level: string; message: string }
    }
  | { type: 'compilation'; payload: CompilationState }
  | {
      type: 'structured-log'
      payload: StructuredLogData
    }

export interface TuiProps {
  child: ChildProcess
  serverUrl: string
  distDir: string
}
