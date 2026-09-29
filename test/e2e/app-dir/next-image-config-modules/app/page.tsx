import ClientProbe from './client-probe'
import { getImageConfig } from 'next/dist/shared/lib/image-config-runtime'

const externalConfig = require('test-external-image-config').initialConfig

export default function Page() {
  const config = getImageConfig()
  return (
    <>
      <p
        id="rsc"
        data-format={config.formats[0]}
        data-ttl={config.minimumCacheTTL}
        data-local-patterns={config.localPatterns?.[0]?.pathname}
      />
      <p
        id="external-app"
        data-format={externalConfig.formats[0]}
        data-ttl={externalConfig.minimumCacheTTL}
        data-path={externalConfig.path}
      />
      <ClientProbe />
    </>
  )
}
