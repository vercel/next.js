const OWNER_STACK = Symbol.for('next.dev.ownerStack')

type ErrorWithOwnerStack = Error & {
  [OWNER_STACK]?: string
}

export function setErrorOwnerStack(error: Error, ownerStack: string): void {
  try {
    Object.defineProperty(error, OWNER_STACK, {
      value: ownerStack,
      configurable: true,
      writable: true,
    })
  } catch {
    // The error may be frozen. In that case, keep its original stack.
  }
}

export function getErrorOwnerStack(error: Error): string | undefined {
  return (error as ErrorWithOwnerStack)[OWNER_STACK]
}
