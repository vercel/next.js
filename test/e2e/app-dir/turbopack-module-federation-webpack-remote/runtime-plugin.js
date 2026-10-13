module.exports = ({ marker }) => ({
  name: 'next-host-federation-plugin',
  beforeRequest(args) {
    globalThis.__federationPluginMarker = marker
    return args
  },
})
