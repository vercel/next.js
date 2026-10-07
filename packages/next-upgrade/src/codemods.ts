import { compare as compareVersions } from 'semver'
import { runChildProcess } from './run-child-process'
import { upgradeVersion } from './utils/env'
import { getNpxCommand } from './utils/npx'

type UpgradeCodemod = {
  // The codemod's name in @next/codemod.
  name: string
  // The Next.js version that requires (or enables) the codemod.
  version: string
  // Optional feature adoption rather than a required migration.
  adoption?: true
}

/**
 * The @next/codemod transforms an upgrade applies, in release order.
 *
 * When adding a codemod to @next/codemod, add it here too, and set the target
 * canary version instead of the stable version. That way upgrades pick up the
 * codemod for the next prerelease, including canary-to-canary upgrades.
 */
export const UPGRADE_CODEMODS: readonly UpgradeCodemod[] = [
  { name: 'url-to-withrouter', version: '6.0.0' },
  { name: 'name-default-component', version: '9.0.0' },
  { name: 'add-missing-react-import', version: '10.0.0' },
  { name: 'cra-to-next', version: '11.0.0' },
  { name: 'new-link', version: '13.0.0' },
  { name: 'next-image-experimental', version: '13.0.0' },
  { name: 'next-image-to-legacy-image', version: '13.0.0' },
  { name: 'built-in-next-font', version: '13.2.0' },
  { name: 'metadata-to-viewport-export', version: '14.0.0' },
  { name: 'next-og-import', version: '14.0.0' },
  { name: 'next-request-geo-ip', version: '15.0.0-canary.153' },
  { name: 'next-async-request-api', version: '15.0.0-canary.171' },
  {
    name: 'app-dir-runtime-config-experimental-edge',
    version: '15.0.0-canary.179',
  },
  { name: 'next-experimental-turbo-to-turbopack', version: '15.4.2-canary.21' },
  { name: 'next-lint-to-eslint-cli', version: '15.4.2-canary.55' },
  { name: 'middleware-to-proxy', version: '15.6.0-canary.54' },
  { name: 'remove-unstable-prefix', version: '16.0.0-canary.10' },
  { name: 'remove-experimental-ppr', version: '16.0.0-canary.11' },
  {
    name: 'cache-components-instant-false',
    version: '16.3.0',
    adoption: true,
  },
  { name: 'remove-partial-prefetch', version: '16.3.0', adoption: true },
]

/**
 * The codemods that apply when upgrading between two Next.js versions.
 *
 * codemod version: 15.0.0-canary.45
 * 14.3             -> 15.0.0-canary.45: apply
 * 14.3             -> 15.0.0-canary.44: don't apply
 * 15.0.0-canary.44 -> 15.0.0-canary.45: apply
 * 15.0.0-canary.45 -> 15.0.0-canary.46: don't apply
 * 15.0.0-canary.45 -> 15.0.0          : don't apply
 * 15.0.0-canary.44 -> 15.0.0          : apply
 */
export function getCodemodsBetween(
  installedVersion: string,
  targetVersion: string
): UpgradeCodemod[] {
  const initialIndex = UPGRADE_CODEMODS.findIndex(
    (codemod) => compareVersions(codemod.version, installedVersion) > 0
  )
  if (initialIndex === -1) {
    return []
  }

  let targetIndex = UPGRADE_CODEMODS.findIndex(
    (codemod) => compareVersions(codemod.version, targetVersion) > 0
  )
  if (targetIndex === -1) {
    targetIndex = UPGRADE_CODEMODS.length
  }

  return UPGRADE_CODEMODS.slice(initialIndex, targetIndex)
}

/**
 * Runs one @next/codemod transform on the app, from the @next/codemod release
 * that matches this package. Transforms run in their own process so that
 * neither this package nor `next` has to install jscodeshift.
 */
export async function runCodemod(
  name: string,
  directory: string,
  options: { verbose: boolean; nonInteractive: boolean }
): Promise<void> {
  const [command, ...runnerArgs] = getNpxCommand(directory).split(' ')
  const args = [
    ...runnerArgs,
    `@next/codemod@${upgradeVersion}`,
    name,
    directory,
    // The upgrade just changed package.json and the lockfile.
    '--force',
  ]
  if (options.verbose) {
    args.push('--verbose')
  }
  if (options.nonInteractive) {
    args.push('--yes')
  }

  const exitCode = await runChildProcess(
    command,
    args,
    { cwd: directory, stdio: 'inherit' },
    null
  )
  if (exitCode !== 0) {
    throw new Error(`The ${name} codemod failed with exit code ${exitCode}.`)
  }
}
