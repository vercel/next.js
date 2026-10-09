import {
  getUpgradeAssessment,
  type UpgradePreparation,
} from '../../shared/check-upgrade'

import { readFile } from 'fs/promises'
import { requireFromProject } from '../../next/project'
import semver from 'semver'
import { loadFutureConfig } from '../../next/config'
import { getPendingFutureDefaults } from '../../shared/future-defaults'

export async function prepareUpgrade(
  directory: string,
  targetRequest: string = 'security'
): Promise<UpgradePreparation> {
  if (
    targetRequest !== 'security' &&
    targetRequest !== 'latest' &&
    targetRequest !== 'experimental-future'
  ) {
    throw new Error(
      `Unsupported agent upgrade type ${JSON.stringify(targetRequest)}. Expected "security", "latest", or "experimental-future".`
    )
  }

  // Resolve from the app: the invoking canary is only the upgrade tooling.
  const requireFromApp = requireFromProject(directory)
  const installedNext = JSON.parse(
    await readFile(requireFromApp.resolve('next/package.json'), 'utf8')
  ) as {
    version: string
  }
  const installedVersion = installedNext.version

  if (!semver.valid(installedVersion)) {
    throw new Error('Could not determine the installed Next.js version.')
  }

  const { upgrade } = await getUpgradeAssessment(
    installedVersion,
    targetRequest
  )
  if (upgrade.status !== 'ready' || targetRequest !== 'experimental-future') {
    return upgrade
  }

  const config = await loadFutureConfig(directory)
  const pendingFutureDefaults = getPendingFutureDefaults(
    directory,
    config,
    upgrade.targetVersion
  )

  if (
    upgrade.targetVersion === installedVersion &&
    pendingFutureDefaults.length === 0
  ) {
    return {
      status: 'unaffected',
      reason: `Next.js ${installedVersion} is current and no applicable Future Defaults are pending.`,
    }
  }

  return { ...upgrade, futureDefaults: pendingFutureDefaults }
}
