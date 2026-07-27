import { Worker } from 'node:worker_threads'
import { NextResponse } from 'next/server'

interface PngInfo {
  url: string
  width: number
  height: number
}

export async function GET() {
  try {
    const worker = new Worker('./app/worker-dir/png-worker.ts')

    const pngInfo = await new Promise<PngInfo>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker timeout'))
      }, 5000)

      worker.on('message', (msg: PngInfo) => {
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

      worker.postMessage('get-png-info')
    })

    await worker.terminate()

    return NextResponse.json({ success: true, pngInfo })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
