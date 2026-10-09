const { appendFileSync } = require('fs')
const { join } = require('path')
const { isMainThread, threadId } = require('worker_threads')

module.exports = function (source) {
  appendFileSync(
    join(this.rootContext, 'loader-resources.jsonl'),
    JSON.stringify({ pid: process.pid, isMainThread, threadId }) + '\n'
  )
  return `export default ${JSON.stringify(source.trim())}`
}
