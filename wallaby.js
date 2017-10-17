module.exports = function (wallaby) {
  return {
    files: [
      'server/**/*.js',
      'client/**/*.js',
      'lib/**/*.js',
      'dist/**/*.js',
      'test/**/*.*',
      '!test/**/*.test.js'
    ],

    tests: [
      'test/**/*.test.js',
      '!test/integration/**/*.test.js'
    ],

    compilers: {
      '**/*.js': wallaby.compilers.babel()
    },

    env: {
      type: 'node',
      runner: 'node',
      params: {
        env: 'NODE_PATH=test/lib'
      }
    },

    testFramework: 'jest'
  }
}
