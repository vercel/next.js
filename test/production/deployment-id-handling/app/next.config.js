/** @type {import('next').NextConfig} */
module.exports = {
  deploymentId:
    process.env.IMMUTABLE_ASSET_TOKEN ?? process.env.CUSTOM_DEPLOYMENT_ID,
  experimental: {
    useSkewCookie: Boolean(process.env.COOKIE_SKEW),
    runtimeServerDeploymentId: !!process.env.RUNTIME_SERVER_DEPLOYMENT_ID,
    immutableAssetToken: process.env.IMMUTABLE_ASSET_TOKEN
      ? `imm-${process.env.IMMUTABLE_ASSET_TOKEN}`
      : undefined,
  },
}
