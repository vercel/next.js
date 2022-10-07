module.exports = {
  experimental: {
    fontLoaders: [
      {
        loader: '@next/font/google',
        options: { subsets: ['latin'] },
      },
      {
        loader: '@next/font/local',
      },
    ],
  },
}
