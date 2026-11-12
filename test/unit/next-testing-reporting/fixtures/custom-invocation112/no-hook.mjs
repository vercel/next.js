import fs from 'node:fs'
export default class {
  onInit() {
    fs.writeFileSync('worker.json', JSON.stringify({ pid: process.pid }))
  }
}
