import { Worker } from 'node:worker_threads'

export default async function Page() {
  'use cache'

  const worker = new Worker(new URL('./worker.ts', import.meta.url))
  const message = await new Promise<string>((resolve, reject) => {
    worker.once('message', resolve)
    worker.once('error', reject)
    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`))
      }
    })
  })

  return <p>{message}</p>
}
