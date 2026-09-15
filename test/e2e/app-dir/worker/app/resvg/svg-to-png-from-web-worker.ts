export async function svgToPngFromWebWorker(
  svg: string,
  width: number,
  multiplier?: number
): Promise<Blob> {
  const worker = new Worker(new URL('../resvg-worker.ts', import.meta.url))

  try {
    return await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (event) => {
        if (event.data.success) {
          resolve(event.data.blob)
        } else {
          reject(event.data.error)
        }
      }
      worker.postMessage({
        svg,
        width: width * (multiplier ?? devicePixelRatio),
      })
    })
  } finally {
    worker.terminate()
  }
}
