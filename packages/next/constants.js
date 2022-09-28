module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/shared/lib/constants')
    : require('./dist/shared/lib/constants')
