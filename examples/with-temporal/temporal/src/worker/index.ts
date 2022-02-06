import { Worker } from '@temporalio/worker'

async function run() {
  // https://docs.temporal.io/docs/node/workers/
  const worker = await Worker.create({
    workDir: __dirname,
    nodeModulesPath: `${__dirname}/../../../node_modules`,
    taskQueue: 'orders',
  })

  // Start accepting tasks on the `orders` queue
  await worker.run()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
