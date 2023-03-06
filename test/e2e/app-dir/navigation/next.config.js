module.exports = {
  experimental: {
    appDir: true,
  },
  redirects: () => {
    return [
      {
        source: '/redirect/a',
        destination: '/redirect-dest',
        permanent: false,
      },
    ]
  },
}
