/** @type {import("next").NextConfig} */
module.exports = {
  cacheComponents: true,
  experimental: {
    // Enable these when debugging to get readable diffs
    // turbopackMinify: false,
    // turbopackModuleIds: 'named',
    // turbopackScopeHoisting: false,
  },
  adapterPath: process.env.NEXT_ADAPTER_PATH,
}
