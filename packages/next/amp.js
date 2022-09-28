module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/shared/lib/amp')
    : require('./dist/shared/lib/amp')
