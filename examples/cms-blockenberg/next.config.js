// next.config.js
module.exports = {
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'ipfs.runfission.com',
          port: '',
          pathname: '/ipfs/**',
        },
      ],
    },
  }