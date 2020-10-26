import { init } from '@sentry/node'
import { RewriteFrames } from '@sentry/integrations'
import getConfig from 'next/config'

import { getDsn, getRelease } from '../env'
import { serverConfig } from '../config'

export default async function initServer() {
  /**
   * TODO(kamil): Unify SDK configuration options.
   * RuntimeConfig cannot be used for callbacks and integrations as it supports only serializable data.
   **/
  const { serverRuntimeConfig = {}, publicRuntimeConfig = {} } =
    getConfig() || {}
  const runtimeConfig =
    serverRuntimeConfig.sentry || publicRuntimeConfig.sentry || {}

  init({
    dsn: getDsn(),
    ...(getRelease() && { release: getRelease() }),
    ...runtimeConfig,
    ...serverConfig,
    integrations: [
      new RewriteFrames({
        iteratee: (frame) => {
          try {
            const [, path] = frame.filename.split('.next/')
            if (path) {
              frame.filename = `app:///_next/${path}`
            }
          } catch {}
          return frame
        },
      }),
      ...(runtimeConfig.integrations || []),
      ...(serverConfig.integrations || []),
    ],
  })
}
