/** @type {import('next').NextConfig} */
module.exports = {
  cacheComponents: true,
  experimental: {
    // Intentionally tiny to test the error
    maxPostponedStateSize: '50 B',
  },
}
