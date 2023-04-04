module.exports = {
  presets: ['next/babel'],
  env: {
    /*
     * Next lines are responsible for instrumenting the code with Istanbul.
     * devCoverage is a variable that is set in the package.json file.
     * See the "dev:instrument" script in the package.json file.
     * This is done in order to instrument the code only when we run the tests.
     * */
    devCoverage: {
      plugins: ['istanbul'],
    },
  },
}
