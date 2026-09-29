import { getImageConfig } from 'next/dist/shared/lib/image-config-runtime'
import { initialConfig } from 'test-external-image-config'

export function getServerSideProps() {
  return { props: {} }
}

export default function Page() {
  const config = getImageConfig()
  return (
    <>
      <p
        id="pages-ssr"
        data-format={config.formats?.[0] ?? 'missing'}
        data-path={config.path}
        data-ttl={config.minimumCacheTTL ?? 'missing'}
        suppressHydrationWarning
      />
      <p
        id="external-pages"
        data-format={initialConfig.formats?.[0] ?? 'missing'}
        data-path={initialConfig.path}
        data-ttl={initialConfig.minimumCacheTTL ?? 'missing'}
        suppressHydrationWarning
      />
    </>
  )
}
