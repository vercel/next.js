import {
  getUpgradeAssessment,
  type UpgradePreparation,
} from '../../next-upgrade/shared/check-upgrade'

import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { join } from 'path'
import { resetEnv } from '@next/env'
import semver from 'next/dist/compiled/semver'
import loadConfig from '../../server/config'
import { PHASE_INFO } from '../../shared/lib/constants'
import { getPendingFutureDefaults } from '../../next-upgrade/shared/future-defaults'

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
  const requireFromApp = createRequire(join(directory, 'package.json'))
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
