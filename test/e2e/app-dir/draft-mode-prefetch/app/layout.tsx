import { draftMode } from 'next/headers'
import { connection } from 'next/server'
import { Suspense, type ReactNode } from 'react'
import { Controls } from './controls'

async function Mode() {
  await connection()
  const { isEnabled } = await draftMode()
  return (
    <p id="draft-mode">
      {isEnabled ? 'Draft mode: enabled' : 'Draft mode: disabled'}
    </p>
  )
}

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<p>Loading draft mode...</p>}>
          <Mode />
        </Suspense>
        <Controls />
        {children}
      </body>
    </html>
  )
}
