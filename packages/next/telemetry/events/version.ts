import findUp from 'next/dist/compiled/find-up'
import path from 'path'
import {
  CONFIG_FILE,
  PHASE_DEVELOPMENT_SERVER,
  PHASE_EXPORT,
  PHASE_PRODUCTION_BUILD,
} from '../../next-server/lib/constants'
import { normalizeConfig } from '../../next-server/server/config'

const EVENT_VERSION = 'NEXT_CLI_SESSION_STARTED'

type EventCliSessionStarted = {
  nextVersion: string
  nodeVersion: string
  cliCommand: string
  isSrcDir: boolean | null
  hasNowJson: boolean
  isCustomServer: boolean | null
  hasNextConfig: boolean
  buildTarget: string
  hasWebpackConfig: boolean
  hasBabelConfig: boolean
  basePathEnabled: boolean
  i18nEnabled: boolean
  imageEnabled: boolean
  locales: string | null
  localeDomainsCount: number | null
  localeDetectionEnabled: boolean | null
  imageDomainsCount: number | null
  imageSizes: string | null
  imageLoader: string | null
  trailingSlashEnabled: boolean
  reactStrictMode: boolean
  webpackVersion: number | null
}

function hasBabelConfig(dir: string): boolean {
  try {
    const noopFile = path.join(dir, 'noop.js')
    const res = require('next/dist/compiled/babel/core').loadPartialConfig({
      cwd: dir,
      filename: noopFile,
      sourceFileName: noopFile,
    }) as any
    const isForTooling =
      res.options?.presets?.every(
        (e: any) => e?.file?.request === 'next/babel'
      ) && res.options?.plugins?.length === 0
    return res.hasFilesystemConfig() && !isForTooling
  } catch {
    return false
  }
}

type NextConfigurationPhase =
  | typeof PHASE_DEVELOPMENT_SERVER
  | typeof PHASE_PRODUCTION_BUILD
  | typeof PHASE_EXPORT

function getNextConfig(
  phase: NextConfigurationPhase,
  dir: string
): { [key: string]: any } | null {
  try {
    const configurationPath = findUp.sync(CONFIG_FILE, {
      cwd: dir,
    })

    if (configurationPath) {
      // This should've already been loaded, and thus should be cached / won't
      // be re-evaluated.
      const configurationModule = require(configurationPath)

      // Re-normalize the configuration.
      return normalizeConfig(
        phase,
        configurationModule.default || configurationModule
      )
    }
  } catch {
    // ignored
  }
  return null
}

export function eventCliSession(
  phase: NextConfigurationPhase,
  dir: string,
  event: Omit<
    EventCliSessionStarted,
    | 'nextVersion'
    | 'nodeVersion'
    | 'hasNextConfig'
    | 'buildTarget'
    | 'hasWebpackConfig'
    | 'hasBabelConfig'
    | 'basePathEnabled'
    | 'i18nEnabled'
    | 'imageEnabled'
    | 'locales'
    | 'localeDomainsCount'
    | 'localeDetectionEnabled'
    | 'imageDomainsCount'
    | 'imageSizes'
    | 'imageLoader'
    | 'trailingSlashEnabled'
    | 'reactStrictMode'
  >
): { eventName: string; payload: EventCliSessionStarted }[] {
  // This should be an invariant, if it fails our build tooling is broken.
  if (typeof process.env.__NEXT_VERSION !== 'string') {
    return []
  }

  const userConfiguration = getNextConfig(phase, dir)

  const { images, i18n } = userConfiguration || {}

  const payload: EventCliSessionStarted = {
    nextVersion: process.env.__NEXT_VERSION,
    nodeVersion: process.version,
    cliCommand: event.cliCommand,
    isSrcDir: event.isSrcDir,
    hasNowJson: event.hasNowJson,
    isCustomServer: event.isCustomServer,
    hasNextConfig: !!userConfiguration,
    buildTarget: userConfiguration?.target ?? 'default',
    hasWebpackConfig: typeof userConfiguration?.webpack === 'function',
    hasBabelConfig: hasBabelConfig(dir),
    imageEnabled: !!images,
    basePathEnabled: !!userConfiguration?.basePath,
    i18nEnabled: !!i18n,
    locales: i18n?.locales ? i18n.locales.join(',') : null,
    localeDomainsCount: i18n?.domains ? i18n.domains.length : null,
    localeDetectionEnabled: !i18n ? null : i18n.localeDetection !== false,
    imageDomainsCount: images?.domains ? images.domains.length : null,
    imageSizes: images?.sizes ? images.sizes.join(',') : null,
    imageLoader: images?.loader,
    trailingSlashEnabled: !!userConfiguration?.trailingSlash,
    reactStrictMode: !!userConfiguration?.reactStrictMode,
    webpackVersion: event.webpackVersion || null,
  }
  return [{ eventName: EVENT_VERSION, payload }]
}
