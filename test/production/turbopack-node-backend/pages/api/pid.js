const loaderData = require('../../input.pid')

export default function handler(_req, res) {
  res.status(200).json({
    loaderPid: String(loaderData.loaderPid),
    buildPid: String(process.env.__TEST_BUILD_PID),
  })
}
