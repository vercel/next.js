import fs from 'fs'
import path from 'path'

export interface LogEntry {
  timestamp: string
  source: 'Server' | 'Browser'
  level: string
  message: string
}

class FileLogger {
  private logFilePath: string
  private isInitialized: boolean = false
  private logQueue: string[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private readonly flushInterval: number = 1000 // Flush every 1 second
  private readonly maxQueueSize: number = 100 // Flush immediately if queue gets too large

  constructor(distDir: string) {
    this.logFilePath = path.join(distDir, 'logs', `next-development.log`)
  }

  private initialize(): void {
    if (this.isInitialized) {
      return
    }

    try {
      // Create the log file if it doesn't exist
      if (!fs.existsSync(this.logFilePath)) {
        // ensure the directory exists
        fs.mkdirSync(path.dirname(this.logFilePath), { recursive: true })
        fs.writeFileSync(this.logFilePath, '')
      }
      this.isInitialized = true
    } catch (error) {
      console.error(error)
    }
  }

  private formatTimestamp(): string {
    const now = new Date()
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    const seconds = now.getSeconds().toString().padStart(2, '0')
    const milliseconds = now.getMilliseconds().toString().padStart(3, '0')

    return `${hours}:${minutes}:${seconds}.${milliseconds}`
  }

  private formatLogEntry(entry: LogEntry): string {
    const { timestamp, source, level, message } = entry
    const levelPadded = level.toUpperCase().padEnd(7, ' ') // Pad level to 7 characters for alignment
    return `[${timestamp}] [${source}] ${levelPadded} ${message}\n`
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return // Timer already scheduled
    }

    this.flushTimer = setTimeout(() => {
      this.flush()
    }, this.flushInterval)
  }

  private flush(): void {
    if (this.logQueue.length === 0) {
      return
    }

    try {
      // Ensure the directory exists before writing
      const logDir = path.dirname(this.logFilePath)
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }

      const logsToWrite = this.logQueue.join('')
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

    // Flush immediately if queue gets too large
    if (this.logQueue.length >= this.maxQueueSize) {
      this.flush()
    } else {
      this.scheduleFlush()
    }
  }

  log(source: 'Server' | 'Browser', level: string, message: string): void {
    this.initialize()

    if (!this.isInitialized) {
      return
    }

    try {
      const logEntry: LogEntry = {
        timestamp: this.formatTimestamp(),
        source,
        level,
        message,
      }

      const formattedEntry = this.formatLogEntry(logEntry)
      this.enqueueLog(formattedEntry)
    } catch (error) {
      console.error(error)
    }
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
let currentDistDir: string | null = null

export function getFileLogger(distDir: string): FileLogger {
  if (!fileLogger || currentDistDir !== distDir) {
    fileLogger = new FileLogger(distDir)
    currentDistDir = distDir
  }
  return fileLogger
}

export function resetFileLogger(): void {
  if (fileLogger) {
    fileLogger.destroy()
  }
  fileLogger = null
  currentDistDir = null
}
