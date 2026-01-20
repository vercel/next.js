/** @type {import('next').NextConfig} */
module.exports = {
  // Read deploymentId from env vars - CUSTOM_DEPLOYMENT_ID takes precedence for explicit tests
  // If CUSTOM_DEPLOYMENT_ID is not set, fall back to NEXT_DEPLOYMENT_ID
  // This ensures NEXT_DEPLOYMENT_ID is available when next.config.js is loaded,
  // which happens before loadEnvConfig might reset process.env
  deploymentId:
    process.env.CUSTOM_DEPLOYMENT_ID ||
    process.env.NEXT_DEPLOYMENT_ID ||
    undefined,
  experimental: {
    useSkewCookie: Boolean(process.env.COOKIE_SKEW),
    runtimeServerDeploymentId: !!process.env.RUNTIME_SERVER_DEPLOYMENT_ID,
  },
}
