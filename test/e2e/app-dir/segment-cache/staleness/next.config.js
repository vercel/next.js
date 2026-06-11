/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // The "runtime prefetch" stale-time test relies on a runtime prefetch
    // firing when a link is revealed. App Shells defers a non-eager route's
    // dynamic content to navigation rather than prefetching it speculatively,
    // so keep App Shells off here to exercise runtime-prefetch staleness.
    appShells: false,
    staleTimes: {
      dynamic: 30,
    },
  },
}

module.exports = nextConfig
