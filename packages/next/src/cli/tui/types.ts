export interface FetchMetricData {
  method: string
  url: string
  status: number
  totalTime: number
  cacheStatus?: string
  cacheReason?: string
  cacheWarning?: string
}

export interface TuiLogEntry {
  id: number
  timestamp: number
  level: 'info' | 'warn' | 'error'
  message: string
  extraLines?: string[]
  structured?: RequestData | ConsoleData | FetchData
  source?: 'system' | 'userland' | 'browser'
}

export interface CompilationState {
  loading: boolean
  trigger?: string
  errors?: string[]
}

export type LogFilter = 'all' | 'errors' | 'warnings' | 'requests' | 'browser'

export const LOG_FILTERS: { key: string; label: string; value: LogFilter }[] = [
  { key: 'a', label: 'all', value: 'all' },
  { key: 'r', label: 'req', value: 'requests' },
  { key: 'b', label: 'browser', value: 'browser' },
  { key: 'w', label: 'warn', value: 'warnings' },
  { key: 'e', label: 'err', value: 'errors' },
]

export const FILTER_ORDER: LogFilter[] = LOG_FILTERS.map((f) => f.value)

export const FILTER_KEYS: Record<string, LogFilter> = Object.fromEntries(
  LOG_FILTERS.map((f) => [f.key, f.value])
)

export interface RequestData {
  type: 'request'
  status: number
  method: string
  url: string
  totalTime: number
  timings?: Array<{ label: string; time: number }>
  fetchMetrics?: FetchMetricData[]
  requestType?: 'action' | 'nav' | 'load'
  serverAction?: { functionName?: string; location?: string; duration?: number }
}

export interface ConsoleData {
  type: 'console'
  method: 'log' | 'warn' | 'error' | 'info' | 'debug'
  source: 'browser' | 'server'
  message: string
  location?: string
  rawStack?: string
  stack?: string[]
}

export interface FetchData {
  type: 'fetch'
  status: number
  method: string
  url: string
  totalTime: number
  cacheStatus?: string
  cacheReason?: string
  cacheWarning?: string
}

export type TuiIpcMessage =
  | { type: 'compilation'; payload: CompilationState }
  | { type: 'structured-log'; payload: Record<string, any> }
