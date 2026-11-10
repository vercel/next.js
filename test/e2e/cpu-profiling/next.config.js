/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // Pin the static worker count so the build test can assert exactly one
    // `build-static-worker` profile per worker.
    cpus: 2,
  },
}

module.exports = nextConfig
