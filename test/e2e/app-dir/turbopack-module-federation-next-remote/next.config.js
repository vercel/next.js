/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_MF_REMOTE_URL: process.env.MF_REMOTE_URL },
  experimental: {
    turbopackModuleFederation: {
      name: 'nextHost',
      shareScope: 'catalog',
      remotes: {
        nextRemote: `nextRemote@${process.env.MF_REMOTE_URL}`,
      },
    },
  },
}

module.exports = nextConfig
