import { Worker } from 'node:worker_threads'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Test with a relative path instead of __filename
    const worker = new Worker('./app/worker-dir/simple-worker.ts')

    const message = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker timeout'))
      }, 5000)

      worker.on('message', (msg) => {
        clearTimeout(timeout)
        resolve(msg)
      })
      worker.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
      worker.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout)
          reject(new Error(`Worker stopped with exit code ${code}`))
        }
      })

      worker.postMessage('ping')
    })

    await worker.terminate()

    return NextResponse.json({ success: true, message })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
