import { startWorker } from 'external-worker-pkg'

export const dynamic = 'force-dynamic'

export async function GET() {
  const worker = startWorker()
  try {
    const message = await new Promise((resolve, reject) => {
      worker.once('message', resolve)
      worker.once('error', reject)
    })
    return Response.json({ message })
  } finally {
    await worker.terminate()
  }
}
