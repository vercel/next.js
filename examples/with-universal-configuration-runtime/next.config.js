module.exports = {
  serverRuntimeConfig: { // Will only be available on the server side
    mySecret: 'secret'
  },
  publicRuntimeConfig: { // Will be available on both server and client
    staticFolder: '/static',
    apiUrl: 'myfakeapi'
  }
}
