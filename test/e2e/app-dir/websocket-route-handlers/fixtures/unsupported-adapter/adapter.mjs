/** @type {import('next').NextAdapter} */
export default {
  name: 'unsupported-websocket-adapter',
  modifyConfig(config) {
    config.experimental.webSocketRouteHandlers = false
    return config
  },
}
