/** @type {import('next').NextConfig} */
module.exports = {
  // Explicitly configure deprecated options
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
