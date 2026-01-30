import type {
  NextConfigComplete,
  NextConfigRuntime,
} from '../server/config-shared'

function errorIfEnvConflicted(
  config: NextConfigComplete | NextConfigRuntime,
  key: string
) {
  const isPrivateKey = /^(?:NODE_.+)|^(?:__.+)$/i.test(key)
  const hasNextRuntimeKey = key === 'NEXT_RUNTIME'

  if (isPrivateKey || hasNextRuntimeKey) {
    throw new Error(
      `The key "${key}" under "env" in ${config.configFileName || 'config'} is not allowed. https://nextjs.org/docs/messages/env-key-not-allowed`
    )
  }
}

/**
 * Collects all environment variables that are using the `NEXT_PUBLIC_` prefix.
 */
export function getNextPublicEnvironmentVariables() {
  const defineEnv: [string, string | undefined][] = []

  process.env.NEXT_PUBLIC_VERCEL = process.env.NEXT_PUBLIC_VERCEL || ''
  process.env.NEXT_PUBLIC_CI = process.env.NEXT_PUBLIC_CI || ''
  process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL =
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || ''
  process.env.NEXT_PUBLIC_VERCEL_REGION =
    process.env.NEXT_PUBLIC_VERCEL_REGION || ''
  process.env.NEXT_PUBLIC_VERCEL_SKEW_PROTECTION_ENABLED =
    process.env.NEXT_PUBLIC_VERCEL_SKEW_PROTECTION_ENABLED || ''
  process.env.NEXT_PUBLIC_VERCEL_AUTOMATION_BYPASS_SECRET =
    process.env.NEXT_PUBLIC_VERCEL_AUTOMATION_BYPASS_SECRET || ''
  process.env.NEXT_PUBLIC_VERCEL_PROJECT_ID =
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_ID || ''
  process.env.NEXT_PUBLIC_VERCEL_GIT_PROVIDER =
    process.env.NEXT_PUBLIC_VERCEL_GIT_PROVIDER || ''
  process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG =
    process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG || ''
  process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER =
    process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER || ''
  process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_ID =
    process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_ID || ''
  process.env.NEXT_PUBLIC_VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV || ''
  process.env.NEXT_PUBLIC_VERCEL_TARGET_ENV =
    process.env.NEXT_PUBLIC_VERCEL_TARGET_ENV || ''
  process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL =
    process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL || ''
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF || ''
  process.env.NEXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID =
    process.env.NEXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID || ''
  process.env.NEXT_PUBLIC_VERCEL_URL = process.env.NEXT_PUBLIC_VERCEL_URL || ''
  process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID =
    process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID || ''
  process.env.NEXT_PUBLIC_VERCEL_OIDC_TOKEN =
    process.env.NEXT_PUBLIC_VERCEL_OIDC_TOKEN || ''
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || ''
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_MESSAGE =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_MESSAGE || ''
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_AUTHOR_LOGIN =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_AUTHOR_LOGIN || ''
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_AUTHOR_NAME =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_AUTHOR_NAME || ''
  process.env.NEXT_PUBLIC_VERCEL_GIT_PREVIOUS_SHA =
    process.env.NEXT_PUBLIC_VERCEL_GIT_PREVIOUS_SHA || ''

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
export function getNextConfigEnv(
  config: NextConfigComplete | NextConfigRuntime
) {
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

export function getStaticEnv(
  config: NextConfigComplete | NextConfigRuntime,
  deploymentId: string
) {
  const staticEnv: Record<string, string | undefined> = {
    ...getNextPublicEnvironmentVariables(),
    ...getNextConfigEnv(config),
    'process.env.NEXT_DEPLOYMENT_ID': deploymentId,
  }
  return staticEnv
}

export function populateStaticEnv(
  config: NextConfigComplete | NextConfigRuntime,
  deploymentId: string
) {
  // since inlining comes after static generation we need
  // to ensure this value is assigned to process env so it
  // can still be accessed
  const staticEnv = getStaticEnv(config, deploymentId)
  for (const key in staticEnv) {
    const innerKey = key.split('.').pop() || ''
    if (!process.env[innerKey]) {
      process.env[innerKey] = staticEnv[key] || ''
    }
  }
}
