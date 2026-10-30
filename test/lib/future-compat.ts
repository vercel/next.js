export function withFutureCompatNodeOptions<T extends NodeJS.Dict<string>>(
  env: T
): T {
  if (
    process.env.NEXT_TEST_FUTURE_COMPAT !== '1' ||
    env.NODE_OPTIONS?.split(/\s+/).includes('--throw-deprecation')
  ) {
    return env
  }

  return {
    ...env,
    NODE_OPTIONS: [env.NODE_OPTIONS, '--throw-deprecation']
      .filter(Boolean)
      .join(' '),
  }
}
