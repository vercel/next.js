/** @type {import('next').NextConfig} */
module.exports = {
  deploymentId:
    process.env.NEXT_DEPLOYMENT_ID_IMMUTABLE ??
    process.env.CUSTOM_DEPLOYMENT_ID,
  experimental: {
    useSkewCookie: Boolean(process.env.COOKIE_SKEW),
    runtimeServerDeploymentId: !!process.env.RUNTIME_SERVER_DEPLOYMENT_ID,
    supportsImmutableAssets: process.env.NEXT_DEPLOYMENT_ID_IMMUTABLE
      ? true
      : false,
    serverSourceMaps: true,
  },
  adapterPath:
    process.env.NEXT_ADAPTER_PATH ?? require.resolve('./my-adapter.mjs'),
  // To generate all sourcemaps and ensure that they are content hashed
  productionBrowserSourceMaps: true,
}
