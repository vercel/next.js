const fs = require('fs-extra')
const tst = process.argv[process.argv.length - 1]

;(async () => {
  let data = await fs.readFile(tst, 'utf8')
  data = data
    .replace(
      /\/\* eslint-env jest \*\//,
      "/* global fixture, test */\nimport 'testcafe'"
    )
    .replace(/describe\(/g, 'fixture(')
    .replace(/it\(/g, 'test(')
    .replace(/, async \(\) =>/g, ', async t =>')
    .replace(/, () => /g, ', async t =>')
    .replace(/\.toMatch\(/g, '.match(')
    .replace(/\.toBe\(/g, '.eql(')
    .replace(/expect\(/g, 'await t.expect(')
    .replace(/\.toMatchObject\(/g, '.eql(')
    .replace(/\.toEqual\(/g, '.eql(')
    .replace(/\.not\.match\(/g, '.notMatch(')
    .replace(/\.not.toBe\(/g, '.notEql(')
    .replace(/\.not\.eql\(/g, '.notEql(')

  await fs.writeFile(tst, data, 'utf8')
})()
