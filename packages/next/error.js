module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/pages/_error')
    : require('./dist/pages/_error')
