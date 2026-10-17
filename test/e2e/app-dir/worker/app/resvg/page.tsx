'use client'

import { useState } from 'react'
import { svgToPngFromWebWorker } from './svg-to-png-from-web-worker'

const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="8" height="4">
    <rect width="8" height="4" fill="red" />
  </svg>
`

export default function ResvgWorkerPage() {
  const [result, setResult] = useState({
    state: 'default',
    type: 'default',
    dimensions: 'default',
    size: '0',
  })

  return (
    <main>
      <button
        onClick={async () => {
          try {
            const blob = await svgToPngFromWebWorker(svg, 8, 2)
            const image = await createImageBitmap(blob)

            setResult({
              state: 'success',
              type: blob.type,
              dimensions: `${image.width}x${image.height}`,
              size: String(blob.size),
            })
            image.close()
          } catch (error) {
            setResult((current) => ({
              ...current,
              state: `error:${
                error instanceof Error ? error.message : String(error)
              }`,
            }))
          }
        }}
      >
        Render SVG in worker
      </button>
      <p id="worker-state">{result.state}</p>
      <p id="png-type">{result.type}</p>
      <p id="png-dimensions">{result.dimensions}</p>
      <p id="png-size">{result.size}</p>
    </main>
  )
}
