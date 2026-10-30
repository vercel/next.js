export function readRuntime(key) {
  const env = process.env
  const { NEXT_PUBLIC_MISSING_ENV_TEST: destructured } = process.env
  const alias = process
  return {
    dynamic: process.env[key],
    envAlias: env.NEXT_PUBLIC_MISSING_ENV_TEST,
    processAlias: alias.env.NEXT_PUBLIC_MISSING_ENV_TEST,
    destructured,
    nonPublic: process.env.MISSING_ENV_RUNTIME_TEST,
  }
}

export function shadowed(process) {
  return process.env.NEXT_PUBLIC_MISSING_ENV_TEST
}

export function writes() {
  process.env.NEXT_PUBLIC_MISSING_ENV_WRITE = '1'
  process.env.NEXT_PUBLIC_MISSING_ENV_WRITE++
  const env = process.env
  const value = env.NEXT_PUBLIC_MISSING_ENV_WRITE
  delete process.env.NEXT_PUBLIC_MISSING_ENV_WRITE
  return value
}
