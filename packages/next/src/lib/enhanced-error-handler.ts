/**
 * Enhanced Error Handling Utilities for Next.js
 * 
 * This module provides improved error handling capabilities including
 * error classification, better error messages, and error recovery mechanisms.
 * 
 * @example
 * ```typescript
 * try {
 *   // risky operation
 * } catch (error) {
 *   const handled = handleError(error, 'MyComponent');
 *   console.error(handled.message);
 * }
 * ```
 */

export enum ErrorSeverity {
  /** Low severity - informational only */
  INFO = 'info',
  /** Warning - potential issue but not critical */
  WARNING = 'warning',
  /** Error - operation failed but recoverable */
  ERROR = 'error',
  /** Critical - operation failed and may affect system stability */
  CRITICAL = 'critical',
}

export enum ErrorCategory {
  /** Network-related errors (fetch, API calls) */
  NETWORK = 'network',
  /** Validation errors (user input, data validation) */
  VALIDATION = 'validation',
  /** Configuration errors */
  CONFIGURATION = 'configuration',
  /** File system errors */
  FILE_SYSTEM = 'file_system',
  /** Runtime errors */
  RUNTIME = 'runtime',
  /** Build-time errors */
  BUILD = 'build',
  /** Rendering errors */
  RENDERING = 'rendering',
  /** Unknown or uncategorized */
  UNKNOWN = 'unknown',
}

export interface ErrorContext {
  /** Component or module where error occurred */
  component?: string
  /** User ID if applicable */
  userId?: string
  /** Request URL if applicable */
  url?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
  /** Stack trace */
  stack?: string
  /** Timestamp */
  timestamp: number
}

export interface NextEnhancedError extends Error {
  /** Error severity level */
  severity: ErrorSeverity
  /** Error category */
  category: ErrorCategory
  /** Additional context */
  context: ErrorContext
  /** Original error if wrapped */
  originalError?: Error
  /** Whether error is recoverable */
  recoverable: boolean
  /** Suggested action for recovery */
  recoverySuggestion?: string
  /** Error code for programmatic handling */
  code?: string
}

/**
 * Creates an enhanced error with additional metadata
 */
export function createEnhancedError(
  message: string,
  options: {
    severity?: ErrorSeverity
    category?: ErrorCategory
    context?: Partial<ErrorContext>
    originalError?: Error
    recoverable?: boolean
    recoverySuggestion?: string
    code?: string
  } = {}
): NextEnhancedError {
  const error = new Error(message) as NextEnhancedError

  error.severity = options.severity ?? ErrorSeverity.ERROR
  error.category = options.category ?? ErrorCategory.UNKNOWN
  error.context = {
    timestamp: Date.now(),
    ...options.context,
  }
  error.originalError = options.originalError
  error.recoverable = options.recoverable ?? false
  error.recoverySuggestion = options.recoverySuggestion
  error.code = options.code

  // Preserve original stack if available
  if (options.originalError?.stack) {
    error.stack = `${error.stack}\n\nCaused by:\n${options.originalError.stack}`
  }

  return error
}

/**
 * Categorizes an error based on its characteristics
 */
export function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase()
  const name = error.name.toLowerCase()

  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    name.includes('networkerror')
  ) {
    return ErrorCategory.NETWORK
  }

  if (
    message.includes('validation') ||
    message.includes('invalid') ||
    message.includes('required') ||
    name.includes('validationerror')
  ) {
    return ErrorCategory.VALIDATION
  }

  if (
    message.includes('config') ||
    message.includes('configuration') ||
    message.includes('env') ||
    message.includes('environment')
  ) {
    return ErrorCategory.CONFIGURATION
  }

  if (
    message.includes('enoent') ||
    message.includes('eacces') ||
    message.includes('file') ||
    message.includes('directory') ||
    name.includes('fserror')
  ) {
    return ErrorCategory.FILE_SYSTEM
  }

  if (
    message.includes('build') ||
    message.includes('compile') ||
    message.includes('webpack') ||
    message.includes('turbopack')
  ) {
    return ErrorCategory.BUILD
  }

  if (
    message.includes('render') ||
    message.includes('hydrat') ||
    message.includes('component') ||
    name.includes('react')
  ) {
    return ErrorCategory.RENDERING
  }

  if (
    name.includes('referenceerror') ||
    name.includes('typeerror') ||
    name.includes('syntaxerror')
  ) {
    return ErrorCategory.RUNTIME
  }

  return ErrorCategory.UNKNOWN
}

/**
 * Determines error severity based on error characteristics
 */
export function determineErrorSeverity(error: Error): ErrorSeverity {
  const category = categorizeError(error)

  switch (category) {
    case ErrorCategory.NETWORK:
      return ErrorSeverity.WARNING
    case ErrorCategory.VALIDATION:
      return ErrorSeverity.INFO
    case ErrorCategory.CONFIGURATION:
    case ErrorCategory.BUILD:
      return ErrorSeverity.CRITICAL
    case ErrorCategory.RENDERING:
    case ErrorCategory.RUNTIME:
      return ErrorSeverity.ERROR
    default:
      return ErrorSeverity.ERROR
  }
}

/**
 * Provides recovery suggestions based on error type
 */
export function getRecoverySuggestion(error: Error): string | undefined {
  const category = categorizeError(error)
  const message = error.message.toLowerCase()

  switch (category) {
    case ErrorCategory.NETWORK:
      return 'Check your network connection and try again. If the problem persists, the server may be down.'

    case ErrorCategory.VALIDATION:
      return 'Please check your input data and ensure all required fields are provided with valid values.'

    case ErrorCategory.CONFIGURATION:
      if (message.includes('env')) {
        return 'Check your environment variables. Ensure all required environment variables are set in your .env file.'
      }
      return 'Review your configuration file (next.config.js) for any errors or missing settings.'

    case ErrorCategory.FILE_SYSTEM:
      if (message.includes('enoent')) {
        return 'The file or directory does not exist. Check the file path and ensure the file exists.'
      }
      if (message.includes('eacces')) {
        return 'Permission denied. Check file permissions and ensure you have access to read/write the file.'
      }
      return 'Check file paths and permissions.'

    case ErrorCategory.BUILD:
      return 'Clear your .next directory and rebuild the project. Check for syntax errors in your code.'

    case ErrorCategory.RENDERING:
      if (message.includes('hydrat')) {
        return 'Hydration error detected. Ensure server and client render the same content. Check for dynamic content that differs between server and client.'
      }
      return 'Check your component code for errors. Ensure all hooks are used correctly and components return valid JSX.'

    case ErrorCategory.RUNTIME:
      if (message.includes('undefined')) {
        return 'A variable or function is undefined. Check that all imports are correct and variables are properly initialized.'
      }
      return 'Review the stack trace to identify the source of the error in your code.'

    default:
      return undefined
  }
}

/**
 * Determines if an error is recoverable
 */
export function isRecoverable(error: Error): boolean {
  const category = categorizeError(error)

  switch (category) {
    case ErrorCategory.NETWORK:
    case ErrorCategory.VALIDATION:
      return true

    case ErrorCategory.CONFIGURATION:
    case ErrorCategory.BUILD:
    case ErrorCategory.FILE_SYSTEM:
      return false

    case ErrorCategory.RENDERING:
    case ErrorCategory.RUNTIME:
      // Some runtime errors may be recoverable depending on context
      return error.message.includes('boundary') || error.message.includes('suspend')

    default:
      return false
  }
}

/**
 * Main error handler that wraps errors with enhanced metadata
 */
export function handleError(
  error: unknown,
  component?: string,
  additionalContext?: Partial<ErrorContext>
): NextEnhancedError {
  // Handle non-Error objects
  if (!(error instanceof Error)) {
    const errorMessage =
      typeof error === 'string'
        ? error
        : JSON.stringify(error) || 'Unknown error occurred'

    return createEnhancedError(errorMessage, {
      severity: ErrorSeverity.ERROR,
      category: ErrorCategory.UNKNOWN,
      context: {
        component,
        ...additionalContext,
      },
    })
  }

  // Check if already enhanced
  if ('severity' in error && 'category' in error) {
    return error as NextEnhancedError
  }

  // Enhance the error
  const category = categorizeError(error)
  const severity = determineErrorSeverity(error)
  const recoverable = isRecoverable(error)
  const recoverySuggestion = getRecoverySuggestion(error)

  return createEnhancedError(error.message, {
    severity,
    category,
    originalError: error,
    recoverable,
    recoverySuggestion,
    context: {
      component,
      stack: error.stack,
      ...additionalContext,
    },
  })
}

/**
 * Formats an enhanced error for logging
 */
export function formatErrorForLogging(error: NextEnhancedError): string {
  const lines: string[] = []

  lines.push(`[${ error.severity.toUpperCase()}] [${error.category.toUpperCase()}]`)
  lines.push(`Message: ${error.message}`)

  if (error.code) {
    lines.push(`Code: ${error.code}`)
  }

  if (error.context.component) {
    lines.push(`Component: ${error.context.component}`)
  }

  if (error.context.url) {
    lines.push(`URL: ${error.context.url}`)
  }

  lines.push(`Recoverable: ${error.recoverable ? 'Yes' : 'No'}`)

  if (error.recoverySuggestion) {
    lines.push(`\nSuggestion: ${error.recoverySuggestion}`)
  }

  if (error.context.metadata) {
    lines.push(`\nMetadata:`)
    lines.push(JSON.stringify(error.context.metadata, null, 2))
  }

  if (error.stack) {
    lines.push(`\nStack Trace:`)
    lines.push(error.stack)
  }

  return lines.join('\n')
}

/**
 * Error reporter interface
 */
export interface ErrorReporter {
  report(error: NextEnhancedError): void
}

/**
 * Console error reporter
 */
export class ConsoleErrorReporter implements ErrorReporter {
  report(error: NextEnhancedError): void {
    const formatted = formatErrorForLogging(error)

    switch (error.severity) {
      case ErrorSeverity.INFO:
        console.info(formatted)
        break
      case ErrorSeverity.WARNING:
        console.warn(formatted)
        break
      case ErrorSeverity.ERROR:
      case ErrorSeverity.CRITICAL:
        console.error(formatted)
        break
    }
  }
}

/**
 * Global error handler
 */
class GlobalErrorHandler {
  private reporters: ErrorReporter[] = []
  private errorHistory: NextEnhancedError[] = []
  private maxHistorySize = 50

  constructor() {
    // Default to console reporter
    this.reporters.push(new ConsoleErrorReporter())
  }

  /**
   * Register a custom error reporter
   */
  addReporter(reporter: ErrorReporter): void {
    this.reporters.push(reporter)
  }

  /**
   * Handle an error
   */
  handle(
    error: unknown,
    component?: string,
    context?: Partial<ErrorContext>
  ): NextEnhancedError {
    const enhancedError = handleError(error, component, context)

    // Add to history
    this.errorHistory.push(enhancedError)
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift()
    }

    // Report to all reporters
    this.reporters.forEach((reporter) => {
      try {
        reporter.report(enhancedError)
      } catch (reporterError) {
        console.error('Error reporter failed:', reporterError)
      }
    })

    return enhancedError
  }

  /**
   * Get error history
   */
  getHistory(): readonly NextEnhancedError[] {
    return [...this.errorHistory]
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = []
  }

  /**
   * Get errors by category
   */
  getErrorsByCategory(category: ErrorCategory): NextEnhancedError[] {
    return this.errorHistory.filter((error) => error.category === category)
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): NextEnhancedError[] {
    return this.errorHistory.filter((error) => error.severity === severity)
  }
}

/**
 * Global singleton error handler instance
 */
export const globalErrorHandler = new GlobalErrorHandler()

/**
 * Utility function to wrap async functions with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  component?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error) {
      const handled = globalErrorHandler.handle(error, component)
      throw handled
    }
  }) as T
}

/**
 * Utility function to wrap sync functions with error handling
 */
export function withSyncErrorHandling<T extends (...args: any[]) => any>(
  fn: T,
  component?: string
): T {
  return ((...args: Parameters<T>) => {
    try {
      return fn(...args)
    } catch (error) {
      const handled = globalErrorHandler.handle(error, component)
      throw handled
    }
  }) as T
}
