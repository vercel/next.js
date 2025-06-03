/** @type {import('next').NextConfig} */
module.exports = {
  deploymentId: process.env.CUSTOM_DEPLOYMENT_ID,
  experimental: {
    useSkewCookie: Boolean(process.env.COOKIE_SKEW),
  },
}
