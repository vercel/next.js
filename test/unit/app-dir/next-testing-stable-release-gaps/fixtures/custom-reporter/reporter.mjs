import { writeFileSync } from 'node:fs'
export default class Reporter {
  onTestRunEnd(modules) {
    writeFileSync(
      'custom-result.json',
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
