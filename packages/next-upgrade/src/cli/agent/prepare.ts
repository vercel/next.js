import { resetEnv } from '@next/env'
import loadConfig from 'next/dist/server/config'
import { PHASE_INFO } from 'next/dist/shared/lib/constants'
import { getPendingFutureDefaults } from '../../shared/future-defaults'
import {
  getUpgradeAssessment,
  type UpgradePreparation,
} from '../../shared/check-upgrade'
import { getInstalledNextVersion } from '../../next/project'

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

  const installedVersion = await getInstalledNextVersion(directory)

  const { upgrade } = await getUpgradeAssessment(
    installedVersion,
    targetRequest
  )
  if (upgrade.status !== 'ready' || targetRequest !== 'experimental-future') {
    return upgrade
  }

  const config = await loadConfig(PHASE_INFO, directory, {
    silent: true,
  }).finally(resetEnv)
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
