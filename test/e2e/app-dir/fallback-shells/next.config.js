/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    prerenderEarlyExit: false,
    // This suite resumes fallback shells for uncovered params, which are
    // legitimately blocking navigations; unscoped, that surfaces a
    // blocking-route Instant Navigation insight, logged as an error the suite's
    // assertions then catch. The suite doesn't exercise Instant Navigation, and
    // its pages use module-level `'use cache'`, which makes a per-route `export
    // const instant = false` opt-out currently invalid (to be fixed!), so scope
    // insight validation to `instant`-configured routes (there are none here)
    // instead.
    instantInsights: { validationLevel: 'manual-warning' },
  },
}

module.exports = nextConfig
