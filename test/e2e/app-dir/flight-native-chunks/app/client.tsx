'use client'

import { use, useState } from 'react'

export function Client({
  text,
  bytes,
  later,
}: {
  text: string
  bytes: Uint8Array
  later: Promise<string>
}) {
  const resolved = use(later)
  const [clicks, setClicks] = useState(0)
  return (
    <main>
      <pre id="text">{text}</pre>
      <span id="last-code-unit">{text.charCodeAt(text.length - 1)}</span>
      <span id="bytes">{Array.from(bytes).join(',')}</span>
      <span id="later-code-unit">
        {resolved.charCodeAt(resolved.length - 1)}
      </span>
      <button onClick={() => setClicks(clicks + 1)}>{clicks}</button>
    </main>
  )
}
