import { connection, after } from 'next/server'
import { Suspense } from 'react'
import { cliLog } from '../../../../../utils/log'

export default async function Page() {
  await connection()
  after(() => {
    cliLog({
      source: '[page] /interrupted/incomplete-stream/hang',
    })
  })
  return (
    <main>
      <h1>Hanging forever</h1>
      <Suspense
        fallback={
          <div id="loading-fallback">
            {
              // we're going to look for this string in the streamed response,
              // make sure it doesn't show up in the literal form someplace else
              'Loading' + (Math.random() > 1 ? 'impossible' : '') + '...'
            }
          </div>
        }
      >
        <HangForever />
      </Suspense>
    </main>
  )
}

async function HangForever() {
  await new Promise((_resolve) => {})
}
