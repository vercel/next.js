module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/pages/_app')
    : require('./dist/pages/_app')
