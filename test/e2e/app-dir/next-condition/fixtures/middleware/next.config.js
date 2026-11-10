/**
 * @type {import('next').NextConfig}
 */

const nextConfig = {
  serverExternalPackages: [
    'my-external-esm-package',
    'my-external-cjs-package',
  ],
}

module.exports = nextConfig
