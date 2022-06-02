const exec = require('../util/exec')

const parseField = (stdout = '', field = '') => {
  return stdout.split(field).pop().trim().split(/\s/).shift().trim()
}

// benchmark a url
async function benchmarkUrl(
  url = '',
  options = {
    reqTimeout: 60,
    concurrency: 50,
    numRequests: 2500,
  }
) {
  const { numRequests, concurrency, reqTimeout } = options

  const { stdout } = await exec(
    `ab -n ${numRequests} -c ${concurrency} -s ${reqTimeout} "${url}"`
  )
  const totalTime = parseFloat(parseField(stdout, 'Time taken for tests:'), 10)
  const failedRequests = parseInt(parseField(stdout, 'Failed requests:'), 10)
  const avgReqPerSec = parseFloat(parseField(stdout, 'Requests per second:'))

  return {
    totalTime,
    avgReqPerSec,
    failedRequests,
  }
}

module.exports = benchmarkUrl
