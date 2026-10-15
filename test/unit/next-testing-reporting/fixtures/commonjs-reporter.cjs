const { writeFileSync } = require('node:fs')
module.exports = class Reporter {
  onTestRunEnd(modules) {
    writeFileSync(
      'commonjs-result.json',
      JSON.stringify(
        modules.flatMap((module) =>
          [...module.children.allTests()].map((test) => ({
            name: test.name,
            state: test.result().state,
          }))
        )
      )
    )
  }
}
