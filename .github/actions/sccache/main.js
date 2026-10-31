const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const isPost = !!process.env.STATE_isPost
// Signal to the post phase that main ran
fs.appendFileSync(process.env.GITHUB_STATE, 'isPost=true\n')

const script = path.join(__dirname, isPost ? 'stop.sh' : 'start.sh')
try {
  execFileSync('bash', [script], { stdio: 'inherit', env: process.env })
} catch (e) {
  if (isPost) return // don't fail the job on cleanup
  throw e
}
