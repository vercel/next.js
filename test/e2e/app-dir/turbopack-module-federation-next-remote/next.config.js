/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackModuleFederation: {
      name: 'nextHost',
      remotes: {
        nextRemote: `nextRemote@${process.env.MF_REMOTE_URL}`,
      },
    },
  },
}

module.exports = nextConfig
