module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/client/index')
    : require('./dist/client/index')
