import fs from 'fs'
import path from 'path'

export interface LogEntry {
  timestamp: string
  source: 'Server' | 'Browser'
  level: string
  message: string
}

// Logging server and browser logs to a file
export class FileLogger {
  private logFilePath: string = ''
  private isInitialized: boolean = false
  private logQueue: string[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private mcpServerEnabled: boolean = false

  public initialize(distDir: string, mcpServerEnabled: boolean): void {
    this.logFilePath = path.join(distDir, 'logs', `next-development.log`)
    this.mcpServerEnabled = mcpServerEnabled

    if (this.isInitialized) {
      return
    }

    // Only initialize if mcpServer is enabled
    if (!this.mcpServerEnabled) {
      return
    }

    try {
      // Clean up the log file on each initialization
      // ensure the directory exists
      fs.mkdirSync(path.dirname(this.logFilePath), { recursive: true })
      fs.writeFileSync(this.logFilePath, '')
      this.isInitialized = true
    } catch (error) {
      console.error(error)
    }
  }

  private formatTimestamp(): string {
    // Use performance.now() instead of Date.now() for avoid sync IO of cache components
    const now = performance.now()
    const hours = Math.floor(now / 3600000)
      .toString()
      .padStart(2, '0')
    const minutes = Math.floor((now % 3600000) / 60000)
      .toString()
      .padStart(2, '0')
    const seconds = Math.floor((now % 60000) / 1000)
      .toString()
      .padStart(2, '0')
    const milliseconds = Math.floor(now % 1000)
      .toString()
      .padStart(3, '0')
    return `${hours}:${minutes}:${seconds}.${milliseconds}`
  }

  private formatLogEntry(entry: LogEntry): string {
    const { timestamp, source, level, message } = entry
    const levelPadded = level.toUpperCase().padEnd(7, ' ') // Pad level to 7 characters for alignment
    const sourcePadded = source === 'Browser' ? source : 'Server '
    return `[${timestamp}] ${sourcePadded} ${levelPadded} ${message}\n`
  }

  private scheduleFlush(): void {
    // Debounce the flush
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    // Delay the log flush to ensure more logs can be batched together asynchronously
    this.flushTimer = setTimeout(() => {
      this.flush()
    }, 100)
  }

  public getLogQueue(): string[] {
    return this.logQueue
  }

  private flush(): void {
    if (this.logQueue.length === 0) {
      return
    }

    // Only flush to disk if mcpServer is enabled
    if (!this.mcpServerEnabled) {
      this.logQueue = [] // Clear the queue without writing
      this.flushTimer = null
      return
    }

    try {
      // Ensure the directory exists before writing
      const logDir = path.dirname(this.logFilePath)
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }

      const logsToWrite = this.logQueue.join('')
      // Writing logs to files synchronously to ensure they're written before returning
      fs.appendFileSync(this.logFilePath, logsToWrite)
      this.logQueue = []
    } catch (error) {
      console.error('Failed to flush logs to file:', error)
    } finally {
      this.flushTimer = null
    }
  }

  private enqueueLog(formattedEntry: string): void {
    this.logQueue.push(formattedEntry)

    // Cancel existing timer and start a new one to ensure all logs are flushed together
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    this.scheduleFlush()
  }

  log(source: 'Server' | 'Browser', level: string, message: string): void {
    // Don't log anything if mcpServer is disabled
    if (!this.mcpServerEnabled) {
      return
    }

    if (!this.isInitialized) {
      return
    }

    const logEntry: LogEntry = {
      timestamp: this.formatTimestamp(),
      source,
      level,
      message,
    }

    const formattedEntry = this.formatLogEntry(logEntry)
    this.enqueueLog(formattedEntry)
  }

  logServer(level: string, message: string): void {
    this.log('Server', level, message)
  }

  logBrowser(level: string, message: string): void {
    this.log('Browser', level, message)
  }

  // Force flush all queued logs immediately
  forceFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.flush()
  }

  // Cleanup method to flush logs on process exit
  destroy(): void {
    this.forceFlush()
  }
}

// Singleton instance
let fileLogger: FileLogger | null = null

export function getFileLogger(): FileLogger {
  if (!fileLogger || process.env.NODE_ENV === 'test') {
    fileLogger = new FileLogger()
  }
  return fileLogger
}

// Only used for testing
export function test__resetFileLogger(): void {
  if (fileLogger) {
    fileLogger.destroy()
  }
  fileLogger = null
}
