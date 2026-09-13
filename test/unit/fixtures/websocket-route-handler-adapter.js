module.exports = {
  name: 'websocket-route-handler-test-adapter',
  modifyConfig() {
    return {
      experimental: { webSocketRouteHandlers: true },
    }
  },
}
