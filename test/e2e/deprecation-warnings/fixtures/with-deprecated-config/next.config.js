/** @type {import('next').NextConfig} */
module.exports = {
  // Explicitly configure deprecated options
  experimental: {
    instrumentationHook: true,
  },
}
