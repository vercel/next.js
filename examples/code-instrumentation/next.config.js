/*
 * Integrating the swc-plugin-coverage-instrument plugin into the swcPlugins
 * streamlines the process of configuring access to coverage data, making it
 * unnecessary to add another API route to the app. This instrumentation approach
 * is functional with Next.js v13.2.3, swc-plugin-coverage-instrument v0.0.14, and
 * when the experimental appDir feature is turned off. Unfortunately, it does not
 * work with Next.js v13.2.4. The hope is that the current incompatibilities will
 * be addressed in the near future.
 * const nextConfig = {
 *   experimental: {
 *     swcPlugins: [["swc-plugin-coverage-instrument", {}]]
 *   }
 * }
 * */

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
}

module.exports = nextConfig
