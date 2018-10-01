/* global __IS_SERVER__ */
export const { relaySSR, environment, createEnvironment } = (__IS_SERVER__
  ? require('./server')
  : require('./client')
).default
