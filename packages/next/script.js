module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/client/script')
    : require('./dist/client/script')
