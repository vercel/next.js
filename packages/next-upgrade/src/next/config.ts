import { interopDefault } from 'next/dist/lib/interop-default'
import loadConfig from 'next/dist/server/config'
import { normalizeConfig } from 'next/dist/server/config-shared'
import { PHASE_PRODUCTION_BUILD } from 'next/dist/shared/lib/constants'

export async function loadAgentUpgradeConfig(directory: string) {
  // Read and normalize the app's config without validating legacy options
  // against the current Next.js schema.
  const rawConfig = await loadConfig(PHASE_PRODUCTION_BUILD, directory, {
    rawConfig: true,
  })
  return normalizeConfig(PHASE_PRODUCTION_BUILD, interopDefault(rawConfig))
}
