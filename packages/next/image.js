module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/client/image')
    : require('./dist/client/image')
