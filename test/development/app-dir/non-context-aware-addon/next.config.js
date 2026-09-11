/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // The addon resolves and loads a compiled binary at runtime, so it has to stay
  // external rather than being bundled into the server build.
  serverExternalPackages: ['single-context-addon'],
}

module.exports = nextConfig
