const NEXT_STATIC_GEN_BAILOUT = 'NEXT_STATIC_GEN_BAILOUT'

export class StaticGenBailoutError extends Error {
  public readonly code = NEXT_STATIC_GEN_BAILOUT
}

export function isStaticGenBailoutError(
  error: unknown
): error is StaticGenBailoutError {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }

  return error.code === NEXT_STATIC_GEN_BAILOUT
}

/**
 * Under Cache Components, `dynamic = "error"` can't be set by the user — it is
 * forced by `output: 'export'` (there is no server, so request-time data
 * access must fail the build). This error reports the static-export constraint
 * instead of the config mechanism.
 */
export function createStaticExportRequestAccessError(
  route: string,
  expression: string
): StaticGenBailoutError {
  return new StaticGenBailoutError(
    `Route "${route}" could not be statically exported.\n\n` +
      `It used ${expression}, which requires a server at request time. This project is built with \`output: 'export'\`, so every route must be fully static.\n\n` +
      `Learn more: https://nextjs.org/docs/app/building-your-application/deploying/static-exports`
  )
}
