module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/shared/lib/head')
    : require('./dist/shared/lib/head')
