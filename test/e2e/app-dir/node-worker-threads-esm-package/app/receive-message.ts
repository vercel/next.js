import type { Worker } from 'node:worker_threads'

export async function receiveMessage(worker: Worker) {
  try {
    const message = await new Promise((resolve, reject) => {
      worker.once('message', resolve)
      worker.once('error', reject)
    })
    return Response.json({ message })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  } finally {
    await worker.terminate()
  }
}
