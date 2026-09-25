import escapeRegex from 'escape-string-regexp'

export function literalError(message: string) {
  return new RegExp(escapeRegex(message))
}

export function samePatternInDevAndBuild(pattern: RegExp): ErrorPattern {
  return {
    dev: pattern,
    build: pattern,
  }
}

export type ErrorPattern = {
  dev: RegExp
  build: RegExp
}

export type ErrorPatternObject = {
  [key: string]: ErrorPattern | ErrorPatternObject
}

export function isErrorPattern(
  object: Record<string, any>
): object is ErrorPattern {
  const keys = ['dev', 'build'] satisfies (keyof ErrorPattern)[]
  for (const key of keys) {
    if (
      !(
        key in object &&
        object[key] &&
        typeof object[key] === 'object' &&
        object[key] instanceof RegExp
      )
    ) {
      return false
    }
  }
  return true
}

export function flattenErrorPatternObject(
  errorPatterns: ErrorPatternObject
): ErrorPattern[] {
  return flattenErrorPatternObjectImpl(errorPatterns)
}

function flattenErrorPatternObjectImpl(
  item: ErrorPattern | ErrorPatternObject
): ErrorPattern[] {
  if (isErrorPattern(item)) {
    return [item]
  }
  return Object.values(item).flatMap((child) => {
    if (!(child && typeof child === 'object')) {
      throw new Error('Unexpected non-object item in error patterns')
    }
    return flattenErrorPatternObjectImpl(child)
  })
}
