module.exports =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('./dist/esm/shared/lib/runtime-config')
    : require('./dist/shared/lib/runtime-config')
