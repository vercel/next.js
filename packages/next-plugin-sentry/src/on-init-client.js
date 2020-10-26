import { init } from '@sentry/browser'
import getConfig from 'next/config'

import { getDsn, getRelease } from '../env'
import { clientConfig } from '../config'

export default async function initClient() {
  /**
   * TODO(kamil): Unify SDK configuration options.
   * RuntimeConfig cannot be used for callbacks and integrations as it supports only serializable data.
   **/
  const { publicRuntimeConfig = {} } = getConfig() || {}
  const runtimeConfig = publicRuntimeConfig.sentry || {}

  init({
    dsn: getDsn(),
    ...(getRelease() && { release: getRelease() }),
    ...runtimeConfig,
    ...clientConfig,
  })
}
