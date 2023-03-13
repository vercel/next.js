import { useCallback, useEffect, useState } from 'react'
import Script from 'next/script'

export default function Lazyload() {
  const [log, setLog] = useState<{ time: Date; text: string }[]>([])

  const addLog = useCallback(
    (text: string) => {
      setLog((log) => log.concat({ time: new Date(), text }))
    },
    [setLog]
  )

  useEffect(() => {
    addLog(`Page loaded window.FB is undefined`)
  }, [addLog])

  return (
    <>
      {/* We lazy load the FB SDK */}
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="lazyOnload"
        onLoad={() =>
          addLog(`script loaded correctly, window.FB has been populated`)
        }
      />

      <main>
        <h1>Lazy Loading FB sdk</h1>
        <h5>You can check `window.FB` on browser console</h5>
        <ul>
          {log.map(({ time, text }) => (
            <li key={+time}>
              {time.toISOString()}: {text}
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}
