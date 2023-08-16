import https from 'https'
import timer from '@szmarczak/http-timer'

// a wrapper around genAsyncRequest that will retry the request 5 times if it fails
export async function genRetryableRequest(url) {
  let retries = 0
  while (retries < 10) {
    try {
      return await genAsyncRequest(url)
    } catch (err) {}
    retries++
  }
  throw new Error(`Failed to fetch ${url}, too many retries`)
}

// a wrapper around http.request that is enhanced with timing information
async function genAsyncRequest(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url)
    timer(request)
    request.on('response', (response) => {
      let body = ''
      response.on('data', (data) => {
        body += data
      })
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to fetch ${url}`))
        }
        resolve({
          ...response.timings.phases,
          cold: !body.includes('HOT'),
        })
      })
      response.on('error', (err) => {
        reject(err)
      })
    })
    request.on('error', (err) => {
      reject(err)
    })
  })
}
