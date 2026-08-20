/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // `native-addon` resolves and loads a compiled binary at runtime, so it has to
  // stay external instead of being bundled. Real native packages get this for
  // free: `sqlite3`, which this fixture replaced, is on the built-in
  // `serverExternalPackages` list in
  // packages/next/src/lib/server-external-packages.jsonc.
  serverExternalPackages: ['native-addon'],
}

module.exports = nextConfig
