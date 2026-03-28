/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    // Allow tests to inject outputHashSalt via env var without touching source.
    outputHashSalt: process.env.OUTPUT_HASH_SALT_CONFIG || undefined,
  },
  turbopack: {
    // Allow tests to inject turbopack.outputHashSalt via env var.
    outputHashSalt: process.env.TURBOPACK_HASH_SALT_CONFIG || undefined,
  },
}
