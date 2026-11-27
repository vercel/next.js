/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    useTypeScriptCli: false,
  },
  typescript: {
    // The generated route types cover every route, so type checking would
    // report the syntax error in app/broken/page.tsx even when that route is
    // excluded from the build. This fixture only tests compilation.
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
