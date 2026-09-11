import type { NextConfig } from '../../server/config-shared'

export type UpgradeConfig = Pick<
  NextConfig,
  'cacheComponents' | 'partialPrefetching'
> & {
  experimental?: Pick<
    NonNullable<NextConfig['experimental']>,
    'agenticAutoUpgrade'
  >
}

export interface UpgradeApp {
  directory: string
  nextVersion: string
  reactVersion: string
  reactDomVersion: string
  routers: ('app' | 'pages')[]
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun'
  config: UpgradeConfig
  manifestPath: string
  manifestHash: string
  lockfilePath?: string
  lockfileHash?: string
}

export interface Advisory {
  ghsa_id: string
  html_url: string
  withdrawn_at: string | null
  vulnerabilities: {
    package: { ecosystem: string; name: string }
    vulnerable_version_range: string
  }[]
}

export interface PackageRelease {
  version: string
  publishedAt: string
  engines?: { node?: string }
  peerDependencies?: Record<string, string>
}

export interface SecuritySnapshot {
  complete: true
  checkedAt: string
  advisories: Advisory[]
  releases: PackageRelease[]
  evidenceReferences: string[]
}

export interface UpgradeCommand {
  command: string
  args: string[]
}

export type UpgradeResolution =
  | { status: 'disabled' | 'unaffected' | 'blocked'; reason: string }
  | {
      status: 'ready'
      app: UpgradeApp
      target: { nextVersion: string; reason: string }
      tools: UpgradeCommand & {
        invokingNextVersion: string
        codemodVersion: string
      }
      snapshot: SecuritySnapshot
    }

export interface UpgradeInput {
  directory: string
  config?: { directory: string; value: UpgradeConfig }
  app?: UpgradeApp
  snapshot?: SecuritySnapshot
  target?: string
  revision?: string
}
