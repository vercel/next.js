// Need to be a getter as ReactServerDOMWebpackClientEdge might change when clearChunkCache is called
Object.defineProperty(module, 'exports', {
  get() {
    return require('../../module.compiled').vendored['react-ssr']
      .ReactServerDOMWebpackClientEdge
  },
})
