const fs = require('fs')

function log() {
  if (fs.existsSync(process.env.NEXT_TASKR_TEST_STOP)) return
  process.stdout.write('typescript log\n'.repeat(16), () => setImmediate(log))
}

log()
