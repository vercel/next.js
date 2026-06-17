import { Worker } from 'node:worker_threads'

export async function GET() {
  try {
    const worker = new Worker('./app/worker-dir/workerdata-check-worker.ts')

    const result = await new Promise<{
      workerDataKeys: string[]
      hasTurbopackKeys: boolean
      turbopackKeys: string[]
    }>((resolve, reject) => {
      worker.on('message', resolve)
      worker.on('error', reject)
    })

    await worker.terminate()

    return Response.json({
      success: true,
      ...result,
    })
  } catch (error) {
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
