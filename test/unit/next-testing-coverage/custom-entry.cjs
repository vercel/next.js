// Controlled bootstrap for the actual parent executor and fresh file worker.
const fs = require('node:fs')
const paths = require('./runtime-paths.json')
const runner = require(paths.runner)
exports.testRunner = runner
exports.loadTestModule = async () => {
  const api = runner.getTestApi()
  if (paths.mode === 'cleanup-failure')
    api.afterEach(() => {
      throw new Error('custom cleanup sentinel')
    })
  api.test('real custom coverage worker', async (context) => {
    fs.writeFileSync(
      paths.project + '/body-pid.json',
      JSON.stringify(process.pid)
    )
    if (paths.mode === 'body-failure') throw new Error('custom body sentinel')
    if (paths.mode === 'source-mutation')
      fs.appendFileSync(paths.project + '/contract.case.mjs', '\n// changed')
    if (paths.mode === 'source-retarget') {
      fs.renameSync(
        paths.project + '/contract.case.mjs',
        paths.project + '/original.case.mjs'
      )
      fs.writeFileSync(paths.project + '/other.case.mjs', '// retargeted')
      fs.symlinkSync(
        paths.project + '/other.case.mjs',
        paths.project + '/contract.case.mjs'
      )
    }
    if (paths.mode === 'output-mutation')
      fs.appendFileSync(__filename, '\n// changed')
    if (paths.mode === 'provider-mutation')
      fs.appendFileSync(paths.project + '/provider.mjs', '\n// changed')
    if (paths.mode === 'cancel')
      await new Promise((resolve) =>
        context.signal.addEventListener('abort', resolve, { once: true })
      )
  })
}
