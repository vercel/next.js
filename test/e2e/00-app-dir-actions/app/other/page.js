'use client'

// @ts-ignore
import { useCallback, useState } from 'react'

function request(method) {
  return fetch('/api/test', {
    method,
    headers: {
      'content-type': 'multipart/form-data;.*',
    },
  })
}

export default function Home() {
  const [result, setResult] = useState('Press submit')
  const onClick = useCallback(async (method) => {
    const res = await request(method)
    const text = await res.text()

    setResult(res.ok ? `${method} ${text}` : 'Error: ' + res.status)
  }, [])

  return (
    <>
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="flex flex-row space-x-2 items-center justify-center">
          <button
            className="border border-white rounded-sm p-4 mb-4"
            onClick={() => onClick('GET')}
          >
            Submit GET
          </button>
          <button
            className="border border-white rounded-sm p-4 mb-4"
            onClick={() => onClick('POST')}
          >
            Submit POST
          </button>
        </div>
        <div className="text-white">{result}</div>
      </div>
    </>
  )
}
