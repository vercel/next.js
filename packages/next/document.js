module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/pages/_document')
    : require('./dist/pages/_document')
