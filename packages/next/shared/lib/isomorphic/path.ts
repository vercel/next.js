const path =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('next/dist/compiled/path-browserify')
    : require('path')

export default path
