module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/lib/data')
    : require('./dist/lib/data')
