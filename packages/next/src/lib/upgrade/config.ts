import { interopDefault } from 'next/dist/lib/interop-default'
import loadConfig from 'next/dist/server/config'
import { normalizeConfig } from 'next/dist/server/config-shared'
import { PHASE_PRODUCTION_BUILD } from 'next/dist/shared/lib/constants'
import { PHASE_INFO } from 'next/dist/shared/lib/constants'
import { resetEnv } from '@next/env'
import { findDir } from '../find-pages-dir'

export async function loadAgentUpgradeConfig(directory: string) {
  // Read and normalize the app's config without validating legacy options
  // against the current Next.js schema.
  const rawConfig = await loadConfig(PHASE_PRODUCTION_BUILD, directory, {
    rawConfig: true,
  })
  return normalizeConfig(PHASE_PRODUCTION_BUILD, interopDefault(rawConfig))
}

// Keep the invoking Next's config loader and env snapshot in the same process.
export async function prepareUpgrade(
  directory: string,
  targetRequest: string = 'security'
) {
  const { prepareUpgrade: prepare } =
    require('next/dist/lib/upgrade/cli/agent/prepare') as typeof import('next/dist/lib/upgrade/cli/agent/prepare')
  return prepare(
    directory,
    targetRequest,
    (dir) => loadConfig(PHASE_INFO, dir, { silent: true }).finally(resetEnv),
    findDir
  )
}
