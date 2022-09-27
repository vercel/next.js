module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/shared/lib/dynamic')
    : require('./dist/shared/lib/dynamic')
