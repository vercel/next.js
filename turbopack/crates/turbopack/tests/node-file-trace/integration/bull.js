const { BULL_REDIS_CONNECTION } = process.env

if (!BULL_REDIS_CONNECTION) {
  console.log('Skipping bull integration test')
  console.log(
    'Create cache on redislabs.com and export BULL_REDIS_CONNECTION="redis://:password@hostname:port"'
  )
  return
}

const Queue = require('bull')
const pdfQueue = new Queue('pdf transcoding', BULL_REDIS_CONNECTION)

pdfQueue.process(function (job, done) {
  job.progress(42)
  done()
  pdfQueue.close()
})

pdfQueue.add({ pdf: 'http://example.com/file.pdf' })
