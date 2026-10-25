import { readFileSync, writeFileSync } from 'node:fs'

export default class {
  onInit(context) {
    const { mode } = JSON.parse(readFileSync('reporter-options.json', 'utf8'))
    writeFileSync('initialized.json', JSON.stringify({ pid: process.pid }))
    context.onClose(async () => {
      await Promise.resolve()
      if (mode === 'exit') process.exit(2)
      throw new Error('owned distinct close error')
    })
  }

  async onTestRunEnd() {
    await Promise.resolve()
    throw new Error('owned earlier completion error')
  }
}
