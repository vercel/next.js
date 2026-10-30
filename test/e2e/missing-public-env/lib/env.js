export function readEnv() {
  return {
    missing: process.env.NEXT_PUBLIC_MISSING_ENV_TEST === undefined,
    bracket: process.env['NEXT_PUBLIC_MISSING_ENV_TEST'] === undefined,
    type: typeof process.env.NEXT_PUBLIC_MISSING_ENV_TEST,
    reload: process.env.NEXT_PUBLIC_MISSING_ENV_RELOAD ?? 'absent',
    defined: process.env.NEXT_PUBLIC_MISSING_ENV_DEFINED,
    empty: process.env.NEXT_PUBLIC_MISSING_ENV_EMPTY,
    falseString: process.env.NEXT_PUBLIC_MISSING_ENV_FALSE,
    zero: process.env.NEXT_PUBLIC_MISSING_ENV_ZERO,
    config: process.env.NEXT_PUBLIC_MISSING_ENV_CONFIG,
    compiler: process.env.NEXT_PUBLIC_MISSING_ENV_COMPILER,
  }
}

export function debugMessage() {
  if (process.env.NEXT_PUBLIC_MISSING_ENV_TEST) {
    return 'missing-public-env-dead-branch-sentinel'
  }
  return 'missing-public-env-live-branch-sentinel'
}
