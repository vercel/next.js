/**
 * Runtime Type Validation Utilities
 * 
 * Provides robust runtime type checking for Next.js server operations.
 * Ensures data integrity and prevents type-related runtime errors.
 */

// Declare global process for environments where @types/node is not available
declare const process: NodeJS.Process | undefined

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message)
    this.name = 'ValidationError'
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

export interface ValidationResult<T> {
  success: boolean
  data?: T
  error?: ValidationError
}

/**
 * Validates that a value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates that a value is a string with optional constraints
 */
export function isString(
  value: unknown,
  options?: {
    minLength?: number
    maxLength?: number
    pattern?: RegExp
  }
): value is string {
  if (typeof value !== 'string') {
    return false
  }

  if (options?.minLength !== undefined && value.length < options.minLength) {
    return false
  }

  if (options?.maxLength !== undefined && value.length > options.maxLength) {
    return false
  }

  if (options?.pattern && !options.pattern.test(value)) {
    return false
  }

  return true
}

/**
 * Validates that a value is a number within optional bounds
 */
export function isNumber(
  value: unknown,
  options?: {
    min?: number
    max?: number
    integer?: boolean
  }
): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false
  }

  if (options?.integer && !Number.isInteger(value)) {
    return false
  }

  if (options?.min !== undefined && value < options.min) {
    return false
  }

  if (options?.max !== undefined && value > options.max) {
    return false
  }

  return true
}

/**
 * Validates that a value is an array with optional element validation
 */
export function isArray<T>(
  value: unknown,
  elementValidator?: (element: unknown) => element is T
): value is T[] {
  if (!Array.isArray(value)) {
    return false
  }

  if (elementValidator) {
    return value.every(elementValidator)
  }

  return true
}

/**
 * Validates JSON data with proper error handling
 */
export function validateJSON<T = unknown>(
  input: string,
  validator?: (data: unknown) => data is T
): ValidationResult<T> {
  try {
    const parsed = JSON.parse(input)

    if (validator && !validator(parsed)) {
      return {
        success: false,
        error: new ValidationError('JSON data failed validation'),
      }
    }

    return {
      success: true,
      data: parsed as T,
    }
  } catch (error) {
    return {
      success: false,
      error: new ValidationError(
        `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
    }
  }
}

/**
 * Validates URL with proper error handling
 */
export function validateURL(
  input: string,
  options?: {
    allowedProtocols?: string[]
    requireProtocol?: boolean
  }
): ValidationResult<URL> {
  try {
    const url = new URL(input)

    if (options?.allowedProtocols) {
      const protocol = url.protocol.replace(':', '')
      if (!options.allowedProtocols.includes(protocol)) {
        return {
          success: false,
          error: new ValidationError(
            `Protocol "${protocol}" is not allowed. Allowed: ${options.allowedProtocols.join(', ')}`
          ),
        }
      }
    }

    return {
      success: true,
      data: url,
    }
  } catch (error) {
    if (options?.requireProtocol === false) {
      // Try with http:// prefix
      try {
        const urlWithProtocol = new URL(`http://${input}`)
        return {
          success: true,
          data: urlWithProtocol,
        }
      } catch {
        // Fall through to error
      }
    }

    return {
      success: false,
      error: new ValidationError(
        `Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
    }
  }
}

/**
 * Validates email address format
 */
export function isEmail(value: unknown): value is string {
  if (!isString(value)) {
    return false
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(value)
}

/**
 * Sanitizes string input by removing dangerous characters
 */
export function sanitizeString(
  input: string,
  options?: {
    allowHTML?: boolean
    maxLength?: number
  }
): string {
  let sanitized = input

  if (!options?.allowHTML) {
    // Remove HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '')
  }

  if (options?.maxLength && sanitized.length > options.maxLength) {
    sanitized = sanitized.substring(0, options.maxLength)
  }

  return sanitized.trim()
}

/**
 * Validates headers object
 */
export function validateHeaders(
  headers: unknown
): headers is Record<string, string | string[]> {
  if (!isObject(headers)) {
    return false
  }

  return Object.entries(headers).every(([key, value]) => {
    const isStringValue = typeof value === 'string'
    const isStringArray = Array.isArray(value) && value.every(v => typeof v === 'string')
    return isString(key) && (isStringValue || isStringArray)
  })
}

/**
 * Validates request body size
 */
export function validateBodySize(
  body: unknown,
  maxSize: number
): ValidationResult<void> {
  let size = 0

  if (typeof body === 'string') {
    size = new TextEncoder().encode(body).length
  } else if (typeof body === 'object' && body !== null && 'length' in body && typeof body.length === 'number') {
    size = body.length
  } else if (body instanceof ArrayBuffer) {
    size = body.byteLength
  } else if (isObject(body)) {
    try {
      const serialized = JSON.stringify(body)
      size = new TextEncoder().encode(serialized).length
    } catch {
      return {
        success: false,
        error: new ValidationError('Cannot serialize body to calculate size'),
      }
    }
  }

  if (size > maxSize) {
    return {
      success: false,
      error: new ValidationError(
        `Body size ${size} bytes exceeds maximum ${maxSize} bytes`,
        'body',
        size
      ),
    }
  }

  return { success: true }
}

/**
 * Type guard for error objects
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error
}

/**
 * Type guard for error with status code
 */
export function isErrorWithStatus(
  value: unknown
): value is Error & { statusCode: number } {
  return isError(value) && 'statusCode' in value && isNumber(value.statusCode)
}

/**
 * Safe property access with type checking
 */
export function getProperty<T>(
  obj: unknown,
  key: string,
  validator: (value: unknown) => value is T
): T | undefined {
  if (!isObject(obj) || !(key in obj)) {
    return undefined
  }

  const value = obj[key]
  return validator(value) ? value : undefined
}

/**
 * Validates environment variable
 */
export function getEnvVar(
  name: string,
  options?: {
    required?: boolean
    defaultValue?: string
    validator?: (value: string) => boolean
  }
  ): string | undefined {
  const value = typeof process !== 'undefined' && (process as any).env ? (process as any).env[name] : undefined

  if (value === undefined) {
    if (options?.required) {
      throw new ValidationError(`Required environment variable "${name}" is not set`)
    }
    return options?.defaultValue
  }

  if (options?.validator && !options.validator(value)) {
    throw new ValidationError(
      `Environment variable "${name}" failed validation`,
      name,
      value
    )
  }

  return value
}

/**
 * Creates a validator function from a schema
 */
export function createValidator<T>(
  schema: {
    [K in keyof T]: (value: unknown) => value is T[K]
  }
): (value: unknown) => value is T {
  return (value: unknown): value is T => {
    if (!isObject(value)) {
      return false
    }

    return Object.entries(schema).every(([key, validatorFn]) => {
      const fieldValue = (value as Record<string, unknown>)[key]
      return (validatorFn as (value: unknown) => boolean)(fieldValue)
    })
  }
}

/**
 * Batch validation with detailed error reporting
 */
export function validateBatch<T extends Record<string, unknown>>(
  data: unknown,
  validators: {
    [K in keyof T]: (value: unknown) => value is T[K]
  }
): ValidationResult<T> {
  if (!isObject(data)) {
    return {
      success: false,
      error: new ValidationError('Data must be an object'),
    }
  }

  const errors: string[] = []

  for (const [key, validator] of Object.entries(validators)) {
    const value = (data as Record<string, unknown>)[key]
    if (!validator(value)) {
      errors.push(`Field "${key}" failed validation`)
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: new ValidationError(errors.join('; ')),
    }
  }

  return {
    success: true,
    data: data as T,
  }
}
