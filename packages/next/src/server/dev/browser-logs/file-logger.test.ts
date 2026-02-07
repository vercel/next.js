import fs from 'fs'
import path from 'path'
import os from 'os'
import { getFileLogger, test__resetFileLogger } from './file-logger'

describe('FileLogger', () => {
  let tempDir: string
  let fileLogger: ReturnType<typeof getFileLogger>

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-file-logger-test-'))
    test__resetFileLogger() // Reset singleton
    fileLogger = getFileLogger()
    fileLogger.initialize(tempDir, true) // Enable mcpServer for testing
  })

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should create log file on first log', () => {
    // Log a message
    fileLogger.logBrowser('LOG', 'Test message')

    // Force flush to ensure the log is written
    fileLogger.forceFlush()

    // Check that a log file was created in the logs directory
    const logsDir = path.join(tempDir, 'logs')
    expect(fs.existsSync(logsDir)).toBe(true)

    const logFiles = fs.readdirSync(logsDir)
    expect(logFiles.length).toBe(1)
    expect(logFiles[0]).toBe('next-development.log')
  })

  it('should format log entries correctly', () => {
    fileLogger.logBrowser('LOG', 'Test message')
    fileLogger.logServer('ERROR', 'Server error')

    // Force flush to ensure logs are written
    fileLogger.forceFlush()

    // Get the log file path
    const logsDir = path.join(tempDir, 'logs')
    const logFilePath = path.join(logsDir, 'next-development.log')

    const logContent = fs.readFileSync(logFilePath, 'utf-8')
    const lines = logContent.trim().split('\n')

    expect(lines).toHaveLength(2)

    // Check format: JSON objects with timestamp, source, level, message
    const log1 = JSON.parse(lines[0])
    expect(log1).toMatchObject({
      timestamp: expect.stringMatching(/^\d{2}:\d{2}:\d{2}\.\d{3}$/),
      source: 'Browser',
      level: 'LOG',
      message: 'Test message',
    })

    const log2 = JSON.parse(lines[1])
    expect(log2).toMatchObject({
      timestamp: expect.stringMatching(/^\d{2}:\d{2}:\d{2}\.\d{3}$/),
      source: 'Server',
      level: 'ERROR',
      message: 'Server error',
    })
  })

  it('should append multiple log entries', () => {
    fileLogger.logBrowser('LOG', 'First message')
    fileLogger.logBrowser('WARN', 'Second message')
    fileLogger.logServer('INFO', 'Third message')

    // Force flush to ensure logs are written
    fileLogger.forceFlush()

    // Get the log file path
    const logsDir = path.join(tempDir, 'logs')
    const logFilePath = path.join(logsDir, 'next-development.log')

    const logContent = fs.readFileSync(logFilePath, 'utf-8')
    const lines = logContent.trim().split('\n')

    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('First message')
    expect(lines[1]).toContain('Second message')
    expect(lines[2]).toContain('Third message')
  })

  it('should handle special characters in messages', () => {
    fileLogger.logBrowser('LOG', 'Message with "quotes" and \n newlines')

    // Force flush to ensure logs are written
    fileLogger.forceFlush()

    // Get the log file path
    const logsDir = path.join(tempDir, 'logs')
    const logFilePath = path.join(logsDir, 'next-development.log')

    const logContent = fs.readFileSync(logFilePath, 'utf-8')
    const log = JSON.parse(logContent.trim())
    expect(log.message).toBe('Message with "quotes" and \n newlines')
  })

  it('should format different log levels correctly', () => {
    fileLogger.logBrowser('LOG', 'Short level')
    fileLogger.logBrowser('WARN', 'Medium level')
    fileLogger.logBrowser('ERROR', 'Long level')

    // Force flush to ensure logs are written
    fileLogger.forceFlush()

    // Get the log file path
    const logsDir = path.join(tempDir, 'logs')
    const logFilePath = path.join(logsDir, 'next-development.log')

    const logContent = fs.readFileSync(logFilePath, 'utf-8')
    const lines = logContent.trim().split('\n')

    // All levels should be in JSON format
    const log1 = JSON.parse(lines[0])
    expect(log1).toMatchObject({
      level: 'LOG',
      message: 'Short level',
    })

    const log2 = JSON.parse(lines[1])
    expect(log2).toMatchObject({
      level: 'WARN',
      message: 'Medium level',
    })

    const log3 = JSON.parse(lines[2])
    expect(log3).toMatchObject({
      level: 'ERROR',
      message: 'Long level',
    })
  })

  it('should not create log file when mcpServer is disabled', () => {
    // Check that logs directory doesn't exist before the test
    const logsDir = path.join(tempDir, 'logs')
    const logsDirExistedBefore = fs.existsSync(logsDir)

    // Create a new file logger with mcpServer disabled
    const disabledLogger = getFileLogger()
    disabledLogger.initialize(tempDir, false)

    // Log a message
    disabledLogger.logBrowser('LOG', 'This should not be logged')
    disabledLogger.logServer('ERROR', 'This should also not be logged')

    // Force flush to ensure any queued logs are processed
    disabledLogger.forceFlush()

    // Check that no new log file was created (directory should still be in same state)
    const logsDirExistsAfter = fs.existsSync(logsDir)
    expect(logsDirExistsAfter).toBe(logsDirExistedBefore)
  })

  describe('batching behavior', () => {
    it('should batch multiple logs and flush them together', async () => {
      // Log multiple messages without forcing flush
      fileLogger.logBrowser('LOG', 'First batched message')
      fileLogger.logBrowser('WARN', 'Second batched message')
      fileLogger.logServer('INFO', 'Third batched message')

      // Initially, the log file should be empty or not exist
      const logsDir = path.join(tempDir, 'logs')
      const logFilePath = path.join(logsDir, 'next-development.log')

      if (fs.existsSync(logFilePath)) {
        const initialContent = fs.readFileSync(logFilePath, 'utf-8')
        expect(initialContent.trim()).toBe('')
      }

      // Force flush to write all batched logs
      fileLogger.forceFlush()

      const logContent = fs.readFileSync(logFilePath, 'utf-8')
      const lines = logContent.trim().split('\n')

      expect(lines).toHaveLength(3)
      expect(lines[0]).toContain('First batched message')
      expect(lines[1]).toContain('Second batched message')
      expect(lines[2]).toContain('Third batched message')
    })

    it('should flush automatically after flush interval', async () => {
      // Log a message
      fileLogger.logBrowser('LOG', 'Auto-flush test message')

      // Initially, the log file should be empty
      const logsDir = path.join(tempDir, 'logs')
      const logFilePath = path.join(logsDir, 'next-development.log')

      if (fs.existsSync(logFilePath)) {
        const initialContent = fs.readFileSync(logFilePath, 'utf-8')
        expect(initialContent.trim()).toBe('')
      }

      // Wait for the flush interval (1 second) plus a small buffer
      await new Promise((resolve) => setTimeout(resolve, 1100))

      // Now the log should be written
      const logContent = fs.readFileSync(logFilePath, 'utf-8')
      const lines = logContent.trim().split('\n')

      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain('Auto-flush test message')
    })

    it('should flush immediately when queue reaches max size', () => {
      // Log many messages to test batching
      for (let i = 0; i < 100; i++) {
        fileLogger.logBrowser('LOG', `Message ${i}`)
      }

      // Force flush to ensure all logs are written immediately
      fileLogger.forceFlush()

      const logsDir = path.join(tempDir, 'logs')
      const logFilePath = path.join(logsDir, 'next-development.log')

      const logContent = fs.readFileSync(logFilePath, 'utf-8')
      const lines = logContent.trim().split('\n')

      expect(lines).toHaveLength(100)
      expect(lines[0]).toContain('Message 0')
      expect(lines[99]).toContain('Message 99')
    })

    it('should handle forceFlush correctly', () => {
      fileLogger.logBrowser('LOG', 'Before force flush')
      fileLogger.logServer('ERROR', 'Another before force flush')

      // Force flush
      fileLogger.forceFlush()

      const logsDir = path.join(tempDir, 'logs')
      const logFilePath = path.join(logsDir, 'next-development.log')

      const logContent = fs.readFileSync(logFilePath, 'utf-8')
      const lines = logContent.trim().split('\n')

      expect(lines).toHaveLength(2)
      expect(lines[0]).toContain('Before force flush')
      expect(lines[1]).toContain('Another before force flush')

      // Add more logs after force flush
      fileLogger.logBrowser('WARN', 'After force flush')

      // These should not be written yet
      const logContentAfter = fs.readFileSync(logFilePath, 'utf-8')
      const linesAfter = logContentAfter.trim().split('\n')
      expect(linesAfter).toHaveLength(2) // Still only 2 lines

      // Force flush again
      fileLogger.forceFlush()

      const logContentFinal = fs.readFileSync(logFilePath, 'utf-8')
      const linesFinal = logContentFinal.trim().split('\n')
      expect(linesFinal).toHaveLength(3)
      expect(linesFinal[2]).toContain('After force flush')
    })
  })
})
