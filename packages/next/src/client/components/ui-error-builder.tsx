type UIError<DIGEST> = Error & { digest: DIGEST }

export type Predicate<T> = T extends (x: any) => x is infer U ? U : never

export function createUIError<ErrorCode extends string = string>(
  errorCode: ErrorCode
): {
  thrower: () => never
  matcher: (err: unknown) => err is UIError<ErrorCode>
} {
  return {
    thrower: (): never => {
      const error = new Error(errorCode)
      ;(error as UIError<string>).digest = errorCode
      throw error
    },
    matcher: (error: unknown): error is UIError<ErrorCode> => {
      if (typeof error !== 'object' || error === null || !('digest' in error)) {
        return false
      }

      return error.digest === errorCode
    },
  }
}
