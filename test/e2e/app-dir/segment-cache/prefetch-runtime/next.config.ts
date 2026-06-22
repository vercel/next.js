import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  experimental: {
    // TODO: With `varyParams: true`, the "includes root params, but not
    // dynamic content" test fails for the `de` case (a root param that's
    // not in `generateStaticParams`). This is similar to the existing
    // `runtime-ppr` TODO that already skips the `de` case when deployed.
    // Pin to the old default until the runtime-prefetch path is fixed for
    // unknown root params under `varyParams`.
    varyParams: false,
  },
}

export default nextConfig
