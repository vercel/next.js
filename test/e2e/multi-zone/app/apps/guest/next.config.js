module.exports = {
  basePath: '/guest',
  experimental: {
    webSocketRouteHandlers: {
      allowedOrigins: ['https://guest.example'],
    },
  },
}
