import { checkBuildFreshness } from './lib/check-build-freshness'

export default async function globalSetup() {
  await checkBuildFreshness()
}
