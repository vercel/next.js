'use client'
import { useState } from 'react'

export default function Home() {
  const [pngInfo, setPngInfo] = useState(null)

  return (
    <div>
      <button
        onClick={() => {
          const worker = new Worker(new URL('../png-worker', import.meta.url), {
            type: 'module',
          })
          worker.addEventListener('message', (event) => {
            setPngInfo(event.data)
          })
        }}
      >
        Get PNG info from worker
      </button>
      <p>
        PNG URL: <span id="png-url">{pngInfo?.url ?? 'default'}</span>
      </p>
      <p>
        PNG Width: <span id="png-width">{pngInfo?.width ?? 'default'}</span>
      </p>
      <p>
        PNG Height: <span id="png-height">{pngInfo?.height ?? 'default'}</span>
      </p>
      <p>
        Fetched From:{' '}
        <span id="fetched-from">{pngInfo?.fetchedFrom ?? 'default'}</span>
      </p>
      <p>
        Content-Type:{' '}
        <span id="content-type">{pngInfo?.contentType ?? 'default'}</span>
      </p>
      <p>
        Fetch Status:{' '}
        <span id="fetch-status">{pngInfo?.status ?? 'default'}</span>
      </p>
    </div>
  )
}
