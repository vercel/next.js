import type { NextConfigComplete } from '../server/config-shared'

function errorIfEnvConflicted(config: NextConfigComplete, key: string) {
  const isPrivateKey = /^(?:NODE_.+)|^(?:__.+)$/i.test(key)
  const hasNextRuntimeKey = key === 'NEXT_RUNTIME'

  if (isPrivateKey || hasNextRuntimeKey) {
    throw new Error(
      `The key "${key}" under "env" in ${config.configFileName} is not allowed. https://nextjs.org/docs/messages/env-key-not-allowed`
    )
  }
}

/**
 * Collects all environment variables that are using the `NEXT_PUBLIC_` prefix.
 */
export function getNextPublicEnvironmentVariables() {
  const defineEnv: [string, string | undefined][] = []
  for (const key in process.env) {
    if (key.startsWith('NEXT_PUBLIC_')) {
      const value = process.env[key]
      if (value != null) {
        defineEnv.push([`process.env.${key}`, value])
      }
    }
  }
  defineEnv.sort((a, b) => a[0].localeCompare(b[0]))
  return Object.fromEntries(defineEnv)
}

/**
 * Collects the `env` config value from the Next.js config.
 */
export function getNextConfigEnv(config: NextConfigComplete) {
  // Refactored code below to use for-of
  const defineEnv: Record<string, string | undefined> = {}
  const env = config.env
  for (const key in env) {
    const value = env[key]
    if (value != null) {
      errorIfEnvConflicted(config, key)
      defineEnv[`process.env.${key}`] = value
    }
  }
  return defineEnv
}

export function getStaticEnv(config: NextConfigComplete) {
  const staticEnv: Record<string, string | undefined> = {
    ...getNextPublicEnvironmentVariables(),
    ...getNextConfigEnv(config),
    'process.env.NEXT_DEPLOYMENT_ID': config.deploymentId || '',
  }
  return staticEnv
}

export function populateStaticEnv(config: NextConfigComplete) {
  // since inlining comes after static generation we need
  // to ensure this value is assigned to process env so it
  // can still be accessed
  const staticEnv = getStaticEnv(config)
  for (const key in staticEnv) {
    const innerKey = key.split('.').pop() || ''
    if (!process.env[innerKey]) {
      process.env[innerKey] = staticEnv[key] || ''
    }
  }
}
