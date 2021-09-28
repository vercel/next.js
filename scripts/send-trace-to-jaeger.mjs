import fs from 'fs'
import eventStream from 'event-stream'
import retry from 'async-retry'
import fetch from 'node-fetch'

const file = fs.createReadStream(process.argv[2])

const localEndpoint = {
  serviceName: 'nextjs',
  ipv4: '127.0.0.1',
  port: 9411,
}

// Jaeger supports Zipkin's reporting API
const zipkinUrl = `http://${localEndpoint.ipv4}:${localEndpoint.port}`
const jaegerWebUiUrl = `http://${localEndpoint.ipv4}:16686`
const zipkinAPI = `${zipkinUrl}/api/v2/spans`

let loggedUrl = false

function logWebUrl(traceId) {
  console.log(
    `Jaeger trace will be available on ${jaegerWebUiUrl}/trace/${traceId}`
  )
}
file.pipe(eventStream.split()).pipe(
  eventStream.map((data, cb) => {
    if (data === '') {
      return cb(null, '')
    }

    const eventsJson = JSON.parse(data).map((item) => {
      item.localEndpoint = localEndpoint
      return item
    })
    if (!loggedUrl) {
      logWebUrl(eventsJson[0].traceId)
      loggedUrl = true
    }
    retry(
      () =>
        // Send events to zipkin
        fetch(zipkinAPI, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventsJson),
        }),
      { minTimeout: 500, retries: 3, factor: 1 }
    )
      .then(async (res) => {
        if (res.status !== 202) {
          console.log({
            status: res.status,
            body: await res.text(),
            events: eventsJson,
          })
        }
        cb(null, '')
      })
      .catch((err) => {
        console.log(err)
        cb(null, '')
      })
  })
)
