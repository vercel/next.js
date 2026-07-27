const { BULL_REDIS_CONNECTION } = process.env

if (!BULL_REDIS_CONNECTION) {
  console.log('Skipping bullmq integration test')
  console.log(
    'Create cache on redislabs.com and export BULL_REDIS_CONNECTION="redis://:password@hostname:port"'
  )
  return
}

const url = new URL(BULL_REDIS_CONNECTION)
const connection = {
  username: url.username,
  password: url.password,
  host: url.hostname,
  port: Number(url.port),
}

const { Queue } = require('bullmq')

async function main() {
  const queue = new Queue('foo', { connection })
  await queue.add('job', { id: 'one' })
  await queue.add('job', { id: 'two' })
  await queue.close()
}

main()
  .then(() => console.log('bullmq success'))
  .catch(console.error)
