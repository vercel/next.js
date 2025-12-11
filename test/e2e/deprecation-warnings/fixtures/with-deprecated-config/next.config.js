/** @type {import('next').NextConfig} */
module.exports = {
  // Explicitly configure deprecated options
  skipMiddlewareUrlNormalize: true,
  experimental: {
    middlewarePrefetch: 'strict',
    instrumentationHook: true,
    middlewareClientMaxBodySize: '5mb',
    externalMiddlewareRewritesResolve: true,
  },
}
