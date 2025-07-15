const idx = process.execArgv.indexOf('--cpu-prof')
if (idx >= 0) process.execArgv.splice(idx, 1)

/** @type {import("next").NextConfig} */
module.exports = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // With Scope Hoisting ESM require cost is 0 and that's not what we want to test
    turbopackScopeHoisting: false,
  },
  webpack: (config) => {
    // With Scope Hoisting ESM require cost is 0 and that's not what we want to test
    config.optimization.concatenateModules = false
    return config
  },
}
