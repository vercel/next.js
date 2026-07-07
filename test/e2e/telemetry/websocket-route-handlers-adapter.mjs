/** @type {import('next').NextAdapter} */
export default {
  name: 'websocket-route-handlers-disabled',
  modifyConfig(config) {
    config.experimental.webSocketRouteHandlers = false
    return config
  },
}
