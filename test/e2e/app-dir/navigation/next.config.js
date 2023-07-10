module.exports = {
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
