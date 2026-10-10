import * as nodeModule from 'module'
import { requireFromProject } from './project'
import type { FutureDefaultsConfig } from '../shared/future-defaults'

type UpgradeAppConfig = FutureDefaultsConfig & {
  distDir: string | undefined
  experimental: { agentUpgrade: unknown } | undefined
}

// Only the standalone command reads the app's installed Next integration.
// Resolve config and @next/env from the same graph so resetEnv restores its snapshot.
function configModules(directory: string) {
  const appRequire = requireFromProject(directory)
  const configPath = appRequire.resolve('next/dist/server/config')
  const nextRequire = Reflect.apply(
    Reflect.get(nodeModule, 'createRequire'),
    null,
    [configPath]
  ) as NodeRequire
  const config = nextRequire(configPath) as {
    default: (
      phase: string,
      directory: string,
      options: { rawConfig: true } | { silent: true }
    ) => Promise<unknown>
  }
  const shared = nextRequire('./config-shared') as {
    normalizeConfig: (
      phase: string,
      config: unknown
    ) => Promise<UpgradeAppConfig>
  }
  const env = nextRequire('@next/env') as { resetEnv(): void }
  return {
    loadConfig: config.default,
    normalizeConfig: shared.normalizeConfig,
    env,
  }
}

export async function loadAgentUpgradeConfig(directory: string) {
  const { loadConfig, normalizeConfig } = configModules(directory)
  const phase = 'phase-production-build'
  const raw = await loadConfig(phase, directory, { rawConfig: true })
  const config =
    raw && typeof raw === 'object' && 'default' in raw ? raw.default : raw
  return normalizeConfig(phase, config)
}

export async function loadFutureConfig(directory: string) {
  const { loadConfig, env } = configModules(directory)
  return (await loadConfig('phase-info', directory, { silent: true }).finally(
    env.resetEnv
  )) as FutureDefaultsConfig
}
