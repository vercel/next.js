import * as fs from 'fs'
import * as path from 'path'

let logFilePath: string | null = null
let logFileStream: fs.WriteStream | null = null

export function initializeFileLogger(distDir: string): string {
  logFilePath = path.join(distDir, 'tui.log')

  // Ensure .next directory exists
  fs.mkdirSync(distDir, { recursive: true })

  // Clear existing file
  fs.writeFileSync(logFilePath, '')

  // Open write stream
  logFileStream = fs.createWriteStream(logFilePath, { flags: 'a' })

  return logFilePath
}

export function writeToFileLog(
  level: string,
  message: string,
  sessionId?: string
): void {
  if (!logFileStream) return

  const timestamp = new Date().toISOString()
  const sessionPrefix = sessionId ? `[${sessionId.slice(0, 8)}]` : '[global]'
  const levelStr = level.toUpperCase().padEnd(7)
  const logLine = `[${timestamp}] ${sessionPrefix} ${levelStr} ${message}\n`

  logFileStream.write(logLine)
}

export function closeFileLogger(): void {
  if (logFileStream) {
    logFileStream.end()
    logFileStream = null
  }
}
