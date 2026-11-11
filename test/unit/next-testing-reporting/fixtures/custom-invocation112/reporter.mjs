import fs from 'node:fs'
const options = JSON.parse(fs.readFileSync('options.json', 'utf8'))
export default class {
  onInit() {
    fs.writeFileSync('worker.json', JSON.stringify({ pid: process.pid }))
  }
  onUserConsoleLog() {
    if (options.mode === 'flush-death') process.exit(17)
  }
  onTestRunEnd() {
    fs.writeFileSync(
      'entered.json',
      JSON.stringify({
        pid: process.pid,
        jsonExists: fs.existsSync('result.json'),
      })
    )
    if (options.mode === 'sync-throw')
      throw new Error('actual sync invocation failure112')
    if (options.mode === 'worker-death') process.exit(19)
    if (options.mode === 'held')
      return new Promise((resolve) => {
        const file = 'release'
        const check = () => {
          if (fs.existsSync(file)) {
            fs.unwatchFile(file, check)
            resolve()
          }
        }
        fs.watchFile(file, { interval: 10 }, check)
        check()
      })
  }
}
