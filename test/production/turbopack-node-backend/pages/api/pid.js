const loaderData = require('../../input.pid')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

export default function handler(_req, res) {
  const buildPid = readFileSync(
    join(process.cwd(), '.next', 'BUILD_ID'),
    'utf8'
  ).trim()

  res.status(200).json({
    loaderPid: String(loaderData.loaderPid),
    buildPid,
  })
}
