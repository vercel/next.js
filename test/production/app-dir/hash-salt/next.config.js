/** @type {import('next').NextConfig} */
module.exports = {
  // Allow tests to inject outputHashSalt via env var without touching source.
  outputHashSalt: process.env.OUTPUT_HASH_SALT_CONFIG || undefined,
  experimental: {
    outputHashSalt:
      process.env.EXPERIMENTAL_OUTPUT_HASH_SALT_CONFIG || undefined,
  },
  adapterPath: require.resolve('./my-adapter.mjs'),
}
