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
  // scroll position can be finicky with the
  // indicators showing so hide by default
  devIndicators: {
    appIsrStatus: false,
  },
}
