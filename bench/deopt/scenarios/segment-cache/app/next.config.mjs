/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enables the client segment cache (the code under measurement).
  cacheComponents: true,
  // Required by bench/deopt: served chunks need adjacent .map files so
  // findings can be remapped to packages/next/src.
  productionBrowserSourceMaps: true,
}

export default nextConfig
