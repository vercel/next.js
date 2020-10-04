import { execSync } from 'child_process'

export default (req, res) => {
  const output = execSync('echo hi').toString().trim()
  res.end(output)
}
