/** @type {import('next').NextConfig} */
module.exports = {
  // Explicitly configure deprecated options
  amp: {
    canonicalBase: 'https://example.com',
  },
  experimental: {
    instrumentationHook: true,
  },
  publicRuntimeConfig: {
    foo: 'bar',
  },
  serverRuntimeConfig: {
    foo: 'bar',
  },
}
