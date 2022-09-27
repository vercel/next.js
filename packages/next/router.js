module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/client/router')
    : require('./dist/client/router')
