/** @type {import('next').NextConfig} */
module.exports = {
  // Force the file watcher into polling mode for both bundlers. Native FS
  // events can be finicky in CI, so polling is more reliable here. This maps
  // to webpack's `watchOptions.poll` and Turbopack's `PollWatcher`.
  watchOptions: {
    pollIntervalMs: 500,
  },
}
