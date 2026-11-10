import { Worker, isMainThread, parentPort } from 'node:worker_threads'
import { NextResponse } from 'next/server'

// This file tests self-referencing worker threads using __filename
// This pattern is used by libraries like @duckdb/duckdb-wasm

if (!isMainThread && parentPort) {
  // Worker thread - handle messages
  parentPort.on('message', (msg) => {
    if (msg === 'ping') {
      parentPort!.postMessage('pong')
    }
  })
}

export async function GET() {
  if (!isMainThread) {
    // If we're in a worker, don't try to create another worker
    return NextResponse.json({ error: 'Already in worker' }, { status: 500 })
  }

  // Log __filename for debugging
  console.log('__filename:', __filename)
  console.log('typeof __filename:', typeof __filename)

  try {
    // Create a worker using __filename - this is the pattern that triggers the cycle bug
    const worker = new Worker(__filename)

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
