/** @type {import("next").NextConfig} */
module.exports = {
  basePath: "/docs",
  rewrites: async () => [
    {
      source: "/r/:path*",
      destination: "/team/:path*",
    },
  ],
}
