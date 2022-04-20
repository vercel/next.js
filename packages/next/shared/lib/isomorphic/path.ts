const path = process.browser
  ? require('next/dist/compiled/path-browserify')
  : require('path')

export default path
