import 'isomorphic-fetch'

export const { initEnvironment, createEnvironment } = (!process.browser
  ? require('./server')
  : require('./client')
).default
