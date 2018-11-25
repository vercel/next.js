export const { relaySSR, environment, createEnvironment } = (!process.browser
  ? require('./server')
  : require('./client')
).default
