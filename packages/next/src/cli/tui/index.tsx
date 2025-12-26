import type { ChildProcess } from 'child_process'
import { exec } from 'child_process'
import React, { useState, useEffect, useCallback } from 'react'
import { render, Box, Text, useApp, useInput, useStdout } from 'ink'
import type {
  TuiState,
  TuiIpcMessage,
  TuiLogEntry,
  TuiProps,
  LogFilter,
  StructuredLogData,
} from './types'
import {
  initializeFileLogger,
  writeToFileLog,
  closeFileLogger,
} from './file-logger'
import { LogPanel } from './components/LogPanel'
import { CompilationStatus } from './components/CompilationStatus'

export interface TuiInstance {
  unmount: () => void
  waitUntilExit: () => Promise<void>
}

export function startTui(
  child: ChildProcess,
  serverUrl: string,
  distDir: string
): TuiInstance {
  function TuiApp({
    child: childProcess,
    serverUrl: url,
    distDir: dist,
  }: TuiProps) {
    const { exit } = useApp()
    const { stdout } = useStdout()
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [userlandSelectedIndex, setUserlandSelectedIndex] = useState(0)
    const [activePanel, setActivePanel] = useState<'requests' | 'console'>(
      'requests'
    )
    const [autoFollow, setAutoFollow] = useState(true)
    const [startupInfo, setStartupInfo] = useState<{
      version?: string
      turbopack?: boolean
      experiments?: string[]
      environments?: string[]
      readyTime?: string
    }>({})
    const [state, setState] = useState<TuiState>({
      logs: [],
      serverUrl: url,
      isReady: true,
      logFilter: 'all',
      compilationState: { loading: false },
    })

    // Initialize file logger
    useEffect(() => {
      const logPath = initializeFileLogger(dist)
      writeToFileLog('info', `TUI started, logging to ${logPath}`)
      return () => closeFileLogger()
    }, [dist])

    // Detect if a line is a continuation of the previous log
    const isContinuationLine = useCallback(
      (message: string, prevLog?: TuiLogEntry) => {
        if (!prevLog) return false
        const prevMsg = prevLog.message

        // Consecutive warning lines (⚠) should be grouped together
        const prevIsWarning =
          prevMsg.startsWith('⚠') || prevLog.level === 'warn'
        const currentIsWarning = message.startsWith('⚠')
        if (prevIsWarning && currentIsWarning) return true

        // Consecutive error lines (⨯) should be grouped together
        const prevIsError = prevMsg.startsWith('⨯') || prevLog.level === 'error'
        const currentIsError = message.startsWith('⨯')
        if (prevIsError && currentIsError) return true

        // URLs on their own line
        if (message.match(/^\s*https?:\/\//)) return true
        // Lines starting with whitespace (indented content)
        if (message.match(/^\s{4,}/)) return true
        // "See more info" lines
        if (message.match(/^\s*See more info/i)) return true
        // "Check the" React info lines
        if (message.startsWith('Check the') && message.includes('react.dev'))
          return true

        // Related config warnings (Unrecognized key follows Invalid config)
        if (message.includes('Unrecognized key') && prevMsg.includes('Invalid'))
          return true
        if (message.includes('Unrecognized key') && prevMsg.includes('config'))
          return true

        // Stack trace lines
        if (message.match(/^\s+at\s+/)) return true

        // Lines that are clearly subordinate (start with dash, bullet, or whitespace + text)
        if (message.match(/^\s+[-•*]\s/)) return true

        // Error/warning context that follows within same second and is related
        if (prevLog.level === 'error' || prevLog.level === 'warn') {
          // Code snippets or file references
          if (message.match(/^\s*\d+\s*\|/)) return true // Line number indicators
          if (message.match(/^\s*>/)) return true // Pointer lines
          if (message.match(/^\s*\^+/)) return true // Caret indicators
        }

        // Continuation of timing breakdown (line ends with open paren or continues timing)
        if (prevMsg.match(/\($/) || prevMsg.match(/,\s*$/)) return true
        // Line that looks like end of timing: "264ms)" or "render: 264ms)"
        if (message.match(/^\s*\d+m?s\)/) || message.match(/^\s*\w+:\s*\d+m?s/))
          return true

        return false
      },
      []
    )

    const addLog = useCallback(
      (
        level: TuiLogEntry['level'],
        message: string,
        structured?: StructuredLogData,
        source?: TuiLogEntry['source']
      ) => {
        writeToFileLog(level, message)

        // Parse startup info from logs
        const versionMatch = message.match(/Next\.js\s+([\d.]+(?:-[\w.]+)?)/)
        if (versionMatch) {
          setStartupInfo((prev) => ({
            ...prev,
            version: versionMatch[1],
            turbopack: message.includes('Turbopack'),
          }))
        }

        const envMatch = message.match(/Environments:\s*(.+)/)
        if (envMatch) {
          setStartupInfo((prev) => ({
            ...prev,
            environments: envMatch[1].split(',').map((s) => s.trim()),
          }))
        }

        const expMatch = message.match(
          /[✓]\s*(inlineCss|mdxRs|ppr|reactCompiler)/
        )
        if (expMatch) {
          setStartupInfo((prev) => ({
            ...prev,
            experiments: [...(prev.experiments || []), expMatch[1]],
          }))
        }

        const readyMatch = message.match(/[✓]?\s*Ready\s+in\s+(\S+)/)
        if (readyMatch) {
          setStartupInfo((prev) => ({
            ...prev,
            readyTime: readyMatch[1],
          }))
        }

        setState((prev) => {
          const lastLog = prev.logs[prev.logs.length - 1]
          const now = Date.now()

          // Check if this should be appended to previous log as extra line
          if (lastLog && !structured && isContinuationLine(message, lastLog)) {
            const updatedLogs = [...prev.logs]
            // Remove the ⚠/⨯ prefix but preserve indentation after it
            const cleanedLine = message
              .replace(/^⚠\s?/, '') // Remove ⚠ and one optional space
              .replace(/^⨯\s?/, '') // Remove ⨯ and one optional space
            updatedLogs[updatedLogs.length - 1] = {
              ...lastLog,
              extraLines: [...(lastLog.extraLines || []), cleanedLine],
            }
            return { ...prev, logs: updatedLogs }
          }

          // Dedupe identical messages within last 2 seconds (skip for structured logs)
          if (!structured) {
            const isDupe = prev.logs.some(
              (log) => log.message === message && now - log.timestamp < 2000
            )
            if (isDupe) {
              return prev
            }
          }

          const entry: TuiLogEntry = {
            timestamp: now,
            level,
            message,
            structured,
            source,
          }
          const newLogs = [...prev.logs.slice(-500), entry]
          return { ...prev, logs: newLogs }
        })
      },
      [isContinuationLine]
    )

    // Classify a log message as system or userland
    const classifyLogSource = useCallback(
      (message: string): TuiLogEntry['source'] => {
        // System logs from Next.js internals
        if (
          message.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+/) ||
          message.match(/[✓○◐]\s*(Compiled|Ready|Starting)/) ||
          message.includes('Next.js') ||
          message.includes('Local:') ||
          message.includes('Network:') ||
          message.includes('Turbopack') ||
          message.match(/^\s*[▲✓]/)
        ) {
          return 'system'
        }
        // User console.log output (default)
        return 'userland'
      },
      []
    )

    // Handle IPC messages from child process
    useEffect(() => {
      const handleMessage = (msg: any) => {
        if (!msg || typeof msg !== 'object') return

        if (msg.tuiMessage) {
          const tuiMsg = msg.tuiMessage as TuiIpcMessage

          if (tuiMsg.type === 'compilation') {
            setState((prev) => ({ ...prev, compilationState: tuiMsg.payload }))
          } else if (tuiMsg.type === 'log') {
            const source = classifyLogSource(tuiMsg.payload.message)
            addLog(
              tuiMsg.payload.level as TuiLogEntry['level'],
              tuiMsg.payload.message,
              undefined,
              source
            )
          } else if (tuiMsg.type === 'structured-log') {
            // Structured logs from log-requests.ts or receive-logs.ts
            const payload = tuiMsg.payload

            // Handle console logs separately
            if (payload.type === 'console') {
              const level: TuiLogEntry['level'] =
                payload.method === 'error'
                  ? 'error'
                  : payload.method === 'warn'
                    ? 'warn'
                    : 'info'
              const source: TuiLogEntry['source'] =
                payload.source === 'browser' ? 'browser' : 'userland'
              addLog(level, payload.message, payload, source)
              return
            }

            // Other structured logs are system logs
            const level: TuiLogEntry['level'] =
              payload.type === 'warning' ? 'warn' : 'info'
            // Create a displayable message from structured data
            let message = ''
            if (payload.type === 'request') {
              message = `${payload.method} ${payload.url} ${payload.status} in ${payload.totalTime}ms`
            } else if (payload.type === 'fetch') {
              message = `${payload.method} ${payload.url} ${payload.status} in ${payload.totalTime}ms`
            } else if (payload.type === 'cache-info') {
              message = `Cache ${payload.cacheStatus}: ${payload.cacheReason}`
            } else if (payload.type === 'warning') {
              message = payload.message
            }
            addLog(level, message, payload, 'system')
          }
        }
      }

      childProcess.on('message', handleMessage)
      return () => {
        childProcess.off('message', handleMessage)
      }
    }, [childProcess, addLog, classifyLogSource])

    // Capture child stdout/stderr
    useEffect(() => {
      const handleStdout = (data: Buffer) => {
        const text = data.toString().trim()
        if (text) {
          const source = classifyLogSource(text)
          addLog('info', text, undefined, source)
        }
      }
      const handleStderr = (data: Buffer) => {
        const text = data.toString().trim()
        if (text) {
          const source = classifyLogSource(text)
          addLog('error', text, undefined, source)
        }
      }

      childProcess.stdout?.on('data', handleStdout)
      childProcess.stderr?.on('data', handleStderr)
      return () => {
        childProcess.stdout?.off('data', handleStdout)
        childProcess.stderr?.off('data', handleStderr)
      }
    }, [childProcess, addLog, classifyLogSource])

    // Check if log should be displayed (matches LogPanel logic)
    const shouldShowLog = useCallback((log: TuiLogEntry) => {
      const msg = log.message
      // Skip ready messages
      if (msg.match(/[✓]?\s*Ready\s+in\s+/)) return false
      // Skip inspector/debugger noise
      if (msg.includes('inspector') || msg.includes('Debugger listening'))
        return false
      // Skip startup noise
      if (
        msg.includes('Next.js') ||
        msg.includes('Local:') ||
        msg.includes('Network:') ||
        msg.includes('Debugger port:') ||
        msg.includes('Environments:') ||
        msg.includes('Experiments') ||
        msg.match(/^\s*[-▲✓]\s*(Starting|Local|Network)/) ||
        msg.match(/^\s*[✓]\s*(inlineCss|mdxRs|ppr|reactCompiler)/)
      )
        return false
      return true
    }, [])

    // Get filtered log count for bounds checking
    const getFilteredLogCount = useCallback(() => {
      return state.logs
        .filter((log) => {
          if (!shouldShowLog(log)) return false
          if (state.logFilter === 'all') return true
          if (state.logFilter === 'console')
            return log.source === 'userland' || log.source === 'browser'
          const msg = log.message
          if (state.logFilter === 'errors')
            return msg.startsWith('⨯') || msg.toLowerCase().includes('error')
          if (state.logFilter === 'warnings')
            return (
              msg.startsWith('⚠') ||
              msg.toLowerCase().includes('warning') ||
              msg.startsWith('⨯') ||
              msg.toLowerCase().includes('error')
            )
          if (state.logFilter === 'requests')
            return (
              msg.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+/) ||
              log.structured?.type === 'request'
            )
          return true
        })
        .slice(-50).length
    }, [state.logs, state.logFilter, shouldShowLog])

    // Auto-follow: keep selection on last log when new logs arrive
    useEffect(() => {
      const count = getFilteredLogCount()
      if (autoFollow && count > 0) {
        setSelectedIndex(count - 1)
      } else if (count > 0) {
        // Clamp selectedIndex to valid range
        setSelectedIndex((prev) => Math.min(prev, count - 1))
      } else {
        setSelectedIndex(0)
      }
    }, [state.logs, state.logFilter, autoFollow, getFilteredLogCount])

    // Get userland log count for bounds checking
    const getUserlandLogCount = useCallback(() => {
      return state.logs
        .filter((log) => log.source === 'userland' || log.source === 'browser')
        .slice(-50).length
    }, [state.logs])

    // Keyboard shortcuts
    useInput(
      (
        input: string,
        key: {
          ctrl: boolean
          upArrow: boolean
          downArrow: boolean
          leftArrow: boolean
          rightArrow: boolean
          tab: boolean
        }
      ) => {
        if (input === 'q' || (key.ctrl && input === 'c')) {
          exit()
          return
        }

        // Tab to switch between panels
        if (key.tab || input === '\t') {
          setActivePanel((prev) =>
            prev === 'requests' ? 'console' : 'requests'
          )
          return
        }

        const logCount =
          activePanel === 'requests'
            ? getFilteredLogCount()
            : getUserlandLogCount()
        const setIndex =
          activePanel === 'requests'
            ? setSelectedIndex
            : setUserlandSelectedIndex

        // Up/down arrows to select logs (no wrap, clamp to bounds)
        if (key.upArrow) {
          if (logCount === 0) return
          setAutoFollow(false)
          setIndex((prev) => Math.max(0, prev - 1))
          return
        }

        if (key.downArrow) {
          if (logCount === 0) return
          setIndex((prev) => {
            const newIndex = Math.min(logCount - 1, prev + 1)
            // Re-enable auto-follow when reaching the bottom
            if (newIndex === logCount - 1) {
              setAutoFollow(true)
            } else {
              setAutoFollow(false)
            }
            return newIndex
          })
          return
        }

        // Left/right arrows to cycle through filters (only in requests panel)
        if ((key.leftArrow || key.rightArrow) && activePanel === 'requests') {
          const filters: LogFilter[] = [
            'all',
            'requests',
            'console',
            'warnings',
            'errors',
          ]
          setState((prev) => {
            const currentIndex = filters.indexOf(prev.logFilter)
            let newIndex: number
            if (key.leftArrow) {
              newIndex =
                currentIndex <= 0 ? filters.length - 1 : currentIndex - 1
            } else {
              newIndex =
                currentIndex >= filters.length - 1 ? 0 : currentIndex + 1
            }
            return { ...prev, logFilter: filters[newIndex] }
          })
          setAutoFollow(true)
          return
        }

        // 'f' to toggle auto-follow / jump to latest
        if (input === 'f') {
          setAutoFollow(true)
          if (logCount > 0) setIndex(logCount - 1)
          return
        }

        // 'c' to copy selected log to clipboard
        if (input === 'c') {
          const filteredLogs =
            activePanel === 'requests'
              ? state.logs.filter(shouldShowLog).slice(-50)
              : state.logs
                  .filter(
                    (log) =>
                      log.source === 'userland' || log.source === 'browser'
                  )
                  .slice(-50)
          const idx =
            activePanel === 'requests' ? selectedIndex : userlandSelectedIndex
          const selectedLog = filteredLogs[idx]
          if (selectedLog) {
            const textToCopy = [
              selectedLog.message,
              ...(selectedLog.extraLines || []),
            ].join('\n')

            // Cross-platform clipboard copy
            const platform = process.platform
            let cmd: string
            if (platform === 'darwin') {
              cmd = 'pbcopy'
            } else if (platform === 'win32') {
              cmd = 'clip'
            } else {
              cmd = 'xclip -selection clipboard'
            }

            const copyProcess = exec(cmd)
            copyProcess.stdin?.write(textToCopy)
            copyProcess.stdin?.end()
          }
          return
        }

        // Direct filter shortcuts (only in requests panel)
        if (activePanel === 'requests') {
          const filterMap: Record<string, LogFilter> = {
            a: 'all',
            e: 'errors',
            w: 'warnings',
            r: 'requests',
            l: 'console',
          }
          if (filterMap[input]) {
            setState((prev) => ({ ...prev, logFilter: filterMap[input] }))
            setAutoFollow(true)
          }
        }
      }
    )

    const terminalWidth = stdout?.columns || 80

    return (
      <Box flexDirection="column" height="100%">
        {/* Header with server info */}
        <Box paddingX={1} gap={1}>
          <Text bold color="white">
            ▲ Next.js
          </Text>
          {startupInfo.version && <Text dimColor>{startupInfo.version}</Text>}
          {startupInfo.turbopack && <Text color="cyan">Turbopack</Text>}
          <Text dimColor>|</Text>
          <Text color="cyan">{state.serverUrl}</Text>
          {startupInfo.experiments && startupInfo.experiments.length > 0 && (
            <>
              <Text dimColor>|</Text>
              <Text color="yellow">{startupInfo.experiments.join(', ')}</Text>
            </>
          )}
          <Box flexGrow={1} />
          <CompilationStatus
            compilationState={state.compilationState}
            isReady={state.isReady}
            readyTime={startupInfo.readyTime}
          />
        </Box>
        <LogPanel
          logs={state.logs}
          logFilter={state.logFilter}
          selectedIndex={selectedIndex}
          terminalWidth={terminalWidth}
          compilationState={state.compilationState}
        />
      </Box>
    )
  }

  // Clear terminal
  process.stdout.write('\x1B[2J\x1B[H')

  const { unmount, waitUntilExit } = render(
    <TuiApp child={child} serverUrl={serverUrl} distDir={distDir} />
  )

  return { unmount, waitUntilExit }
}
