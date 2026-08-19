/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Compiler polling avoids exhausting the low per-process native watcher
  // limit on test hosts. The JS route-discovery Watchpack remains active.
  watchOptions: { pollIntervalMs: 100 },
}

module.exports = nextConfig
