module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/client/link')
    : require('./dist/client/link')
