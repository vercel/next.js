'use client'

import { useEffect, useState } from 'react'
import { getImageConfig } from 'next/dist/shared/lib/image-config-runtime'

const { getImageConfig: getEsmImageConfig } =
  require('next/dist/esm/shared/lib/image-config-runtime') as typeof import('next/dist/shared/lib/image-config-runtime')

export default function ClientProbe() {
  const [browserConfig, setBrowserConfig] = useState<
    ReturnType<typeof getImageConfig> | undefined
  >()
  useEffect(() => setBrowserConfig(getImageConfig()), [])

  const config = browserConfig ?? getImageConfig()
  const esmConfig = getEsmImageConfig()
  return (
    <p
      key={browserConfig ? 'browser' : 'ssr'}
      id="client"
      data-stage={browserConfig ? 'browser' : 'ssr'}
      data-format={config.formats?.[0] ?? 'missing'}
      data-path={config.path}
      data-ttl={config.minimumCacheTTL ?? 'missing'}
      data-local-patterns={config.localPatterns?.[0]?.pathname ?? 'missing'}
      data-esm-format={esmConfig.formats?.[0] ?? 'missing'}
      data-esm-path={esmConfig.path}
      suppressHydrationWarning
    />
  )
}
