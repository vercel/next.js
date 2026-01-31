import type { ChildProcess } from 'child_process'
import { spawn, execSync } from 'child_process'
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { render, Box, Text, useApp, useInput, useStdout } from 'ink'
import Spinner from 'ink-spinner'
import type {
  TuiIpcMessage,
  TuiLogEntry,
  LogFilter,
  CompilationState,
} from './types'
import { FILTER_ORDER, FILTER_KEYS } from './types'
import { isStartupNoise, matchesFilter, formatLogForCopy } from './utils'
import { LogPanel } from './components/LogPanel'

export interface TuiInstance {
  unmount: () => void
  waitUntilExit: () => Promise<void>
}

const MAX_LOGS = 500

// Shared ref so the component's resize handler can call ink's clear(),
// which resets ink's internal output tracking before a re-render.
let inkClear: (() => void) | null = null

// Clipboard utilities
let cachedClipboardCmd: { cmd: string; args: string[] } | null | undefined =
  undefined

function getClipboardCommand(): { cmd: string; args: string[] } | null {
  if (cachedClipboardCmd !== undefined) return cachedClipboardCmd

  if (process.platform === 'darwin') {
    cachedClipboardCmd = { cmd: 'pbcopy', args: [] }
    return cachedClipboardCmd
  }
  if (process.platform === 'win32') {
    cachedClipboardCmd = { cmd: 'clip', args: [] }
    return cachedClipboardCmd
  }
  // Linux: try to detect available clipboard tool
  // Check for Wayland first (wl-copy), then X11 tools
  const tools = [
    { cmd: 'wl-copy', args: [] }, // Wayland
    { cmd: 'xclip', args: ['-selection', 'clipboard'] }, // X11
    { cmd: 'xsel', args: ['--clipboard', '--input'] }, // X11 alternative
  ]
  for (const tool of tools) {
    try {
      execSync(`which ${tool.cmd}`, { stdio: 'ignore' })
      cachedClipboardCmd = tool
      return cachedClipboardCmd
    } catch {
      // Tool not found, try next
    }
  }
  cachedClipboardCmd = null
  return null
}

function copyToClipboard(
  text: string,
  callback: (success: boolean) => void
): void {
  const clipboardCmd = getClipboardCommand()
  if (!clipboardCmd) {
    callback(false)
    return
  }

  const proc = spawn(clipboardCmd.cmd, clipboardCmd.args, {
    stdio: ['pipe', 'ignore', 'ignore'],
  })

  proc.on('error', () => callback(false))
  proc.on('close', (code) => callback(code === 0))

  proc.stdin.write(text)
  proc.stdin.end()
}

function CompilationStatus({
  state,
  readyTime,
}: {
  state: CompilationState
  readyTime?: string
}) {
  if (state.loading) {
    return (
      <Box gap={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text dimColor>
          compiling{state.trigger ? ` ${state.trigger}` : ''}
        </Text>
      </Box>
    )
  }
  if (state.errors?.length) {
    return (
      <Text color="red" bold>
        {state.errors.length} error{state.errors.length > 1 ? 's' : ''}
      </Text>
    )
  }
  return (
    <Box gap={1}>
      <Text color="green">ready</Text>
      {readyTime && <Text dimColor>in {readyTime}</Text>}
    </Box>
  )
}

function TuiApp({
  child: childProcess,
  serverUrl: url,
}: {
  child: ChildProcess
  serverUrl: string
}) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [selectedIndex, setSelectedIndex] = useState(-1) // -1 means "follow mode" (always at end)
  const [version, setVersion] = useState<string>()
  const [turbopack, setTurbopack] = useState(false)
  const [readyTime, setReadyTime] = useState<string>()
  const [dimensions, setDimensions] = useState({
    rows: stdout?.rows || 24,
    columns: stdout?.columns || 80,
  })

  const [logs, setLogs] = useState<TuiLogEntry[]>([])
  const [logFilter, setLogFilter] = useState<LogFilter>('all')
  const logFilterRef = useRef<LogFilter>(logFilter)
  logFilterRef.current = logFilter
  const [compilationState, setCompilationState] = useState<CompilationState>({
    loading: false,
  })
  const compileStartRef = useRef<number>(0)
  const [compileStartTime, setCompileStartTime] = useState<number | null>(null)
  const [copied, setCopied] = useState<boolean | 'failed'>(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logIdRef = useRef(0)

  // Handle resize — use ink's clear() to reset its internal output tracking,
  // then let the state update trigger a full re-render from scratch.
  useEffect(() => {
    const handleResize = () => {
      inkClear?.()
      setDimensions({
        rows: stdout?.rows || 24,
        columns: stdout?.columns || 80,
      })
    }
    stdout?.on('resize', handleResize)
    return () => {
      stdout?.off('resize', handleResize)
    }
  }, [stdout])

  const addLog = useCallback(
    (level: TuiLogEntry['level'], message: string, structured?: any) => {
      // Extract startup info before potentially skipping
      const versionMatch = message.match(/Next\.js\s+([\d.]+(?:-[\w.]+)?)/)
      if (versionMatch) {
        setVersion(versionMatch[1])
        setTurbopack(message.includes('Turbopack'))
      }
      const readyMatch = message.match(/Ready\s+in\s+(\S+)/)
      if (readyMatch) setReadyTime(readyMatch[1])

      if (isStartupNoise(message)) return

      const source: TuiLogEntry['source'] =
        structured?.type === 'console'
          ? structured.source === 'browser'
            ? 'browser'
            : 'userland'
          : 'system'
      const entry: TuiLogEntry = {
        id: ++logIdRef.current,
        timestamp: Date.now(),
        level,
        message,
        structured,
        source,
      }
      setLogs((prev) => {
        if (prev.length >= MAX_LOGS) {
          const evicted = prev[0]
          if (matchesFilter(evicted, logFilterRef.current)) {
            setSelectedIndex((idx) => (idx > 0 ? idx - 1 : idx))
          }
        }
        return [...prev.slice(-(MAX_LOGS - 1)), entry]
      })
    },
    []
  )

  // Handle IPC messages
  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (!msg?.tuiMessage) return
      const tuiMsg = msg.tuiMessage as TuiIpcMessage

      if (tuiMsg.type === 'compilation') {
        if (tuiMsg.payload.loading) {
          const now = Date.now()
          compileStartRef.current = now
          setCompileStartTime(now)
        } else if (compileStartRef.current > 0) {
          const elapsed = Date.now() - compileStartRef.current
          compileStartRef.current = 0
          setCompileStartTime(null)
          const formatted =
            elapsed > 2000
              ? `${Math.round(elapsed / 100) / 10}s`
              : `${elapsed}ms`
          setReadyTime(formatted)
        }
        setCompilationState(tuiMsg.payload)
      } else if (tuiMsg.type === 'structured-log') {
        const p = tuiMsg.payload
        if (!p || typeof p !== 'object') return
        const level =
          p.level === 'error' || p.type === 'error'
            ? 'error'
            : p.level === 'warn' || p.type === 'warning'
              ? 'warn'
              : 'info'
        const message =
          p.type === 'request'
            ? `${p.method} ${p.url} ${p.status} in ${p.totalTime}ms`
            : p.message || ''
        addLog(level, message, p)
      }
    }
    childProcess.on('message', handleMessage)
    return () => {
      childProcess.off('message', handleMessage)
    }
  }, [childProcess, addLog])

  // Capture stdout/stderr
  useEffect(() => {
    const onStdout = (data: Buffer) => {
      const text = data.toString().trim()
      if (text) addLog('info', text)
    }
    const onStderr = (data: Buffer) => {
      const text = data.toString().trim()
      if (text) addLog('error', text)
    }
    childProcess.stdout?.on('data', onStdout)
    childProcess.stderr?.on('data', onStderr)
    return () => {
      childProcess.stdout?.off('data', onStdout)
      childProcess.stderr?.off('data', onStderr)
    }
  }, [childProcess, addLog])

  // Clean up copy timer on unmount
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    }
  }, [])

  // Filter logs
  const filteredLogs = useMemo(
    () => logs.filter((log) => matchesFilter(log, logFilter)),
    [logs, logFilter]
  )

  // Compute actual selected index (-1 means "at end")
  const actualSelectedIndex =
    selectedIndex < 0 || selectedIndex >= filteredLogs.length
      ? filteredLogs.length - 1
      : selectedIndex

  // Keyboard input
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      childProcess.kill('SIGTERM')
      exit()
      return
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => {
        const current = prev < 0 ? filteredLogs.length - 1 : prev
        return Math.max(0, current - 1)
      })
      return
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => {
        const current = prev < 0 ? filteredLogs.length - 1 : prev
        const newIndex = current + 1
        // If we reach the end, go back to follow mode (-1)
        return newIndex >= filteredLogs.length - 1 ? -1 : newIndex
      })
      return
    }

    if (key.leftArrow || key.rightArrow) {
      setLogFilter((prev) => {
        const idx = FILTER_ORDER.indexOf(prev)
        const delta = key.rightArrow ? 1 : -1
        const newIndex =
          (idx + delta + FILTER_ORDER.length) % FILTER_ORDER.length
        return FILTER_ORDER[newIndex]
      })
      setSelectedIndex(-1) // Reset to follow mode on filter change
      return
    }

    if (FILTER_KEYS[input]) {
      setLogFilter(FILTER_KEYS[input])
      setSelectedIndex(-1) // Reset to follow mode on filter change
      return
    }

    if (input === 'c') {
      const log = filteredLogs[actualSelectedIndex]
      if (log) {
        const text = formatLogForCopy(log)
        copyToClipboard(text, (success) => {
          if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
          setCopied(success ? true : 'failed')
          copiedTimerRef.current = setTimeout(
            () => setCopied(false),
            success ? 500 : 2000
          )
        })
      }
      return
    }
  })

  // Responsive header: progressively hide elements at narrow widths
  const cols = dimensions.columns
  let displayUrl = url
  if (cols < 55) displayUrl = displayUrl.replace(/^https?:\/\//, '')
  const maxUrlWidth = Math.max(10, cols - 30)
  if (displayUrl.length > maxUrlWidth) {
    displayUrl = displayUrl.slice(0, maxUrlWidth - 2) + '..'
  }

  return (
    <Box flexDirection="column" height={dimensions.rows}>
      <Box paddingX={1} gap={1}>
        <Text bold color="white">
          ▲ Next.js
        </Text>
        {version && cols >= 80 && <Text dimColor>{version}</Text>}
        {turbopack && cols >= 70 && <Text color="cyan">Turbopack</Text>}
        {cols >= 55 && <Text dimColor>|</Text>}
        <Text color="cyan">{displayUrl}</Text>
        <Box flexGrow={1} />
        <CompilationStatus
          state={compilationState}
          readyTime={cols >= 90 ? readyTime : undefined}
        />
      </Box>
      <LogPanel
        logs={filteredLogs}
        logFilter={logFilter}
        selectedIndex={actualSelectedIndex}
        terminalHeight={dimensions.rows}
        terminalWidth={dimensions.columns}
        compilationState={compilationState}
        compileStartTime={compileStartTime}
        copied={copied}
      />
    </Box>
  )
}

export function startTui(child: ChildProcess, serverUrl: string): TuiInstance {
  // Enter alternate screen buffer and hide cursor
  process.stdout.write('\x1b[?1049h\x1b[?25l')

  const { unmount, waitUntilExit, clear } = render(
    <TuiApp child={child} serverUrl={serverUrl} />
  )
  inkClear = clear

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    inkClear = null
    process.stdout.write('\x1b[?1049l\x1b[?25h')
  }

  return {
    unmount: () => {
      unmount()
      cleanup()
    },
    waitUntilExit: async () => {
      await waitUntilExit()
      cleanup()
    },
  }
}
