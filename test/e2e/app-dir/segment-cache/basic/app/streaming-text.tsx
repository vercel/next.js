import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicText({ text }) {
  await connection()
  return text
}

export function StreamingText({
  static: staticText,
  dynamic,
}: {
  static: string
  dynamic: string
}) {
  return (
    <div data-streaming-text>
      <div>{staticText}</div>
      <div>
        <Suspense fallback={`Loading... [${dynamic}]`}>
          <DynamicText text={dynamic} />
        </Suspense>
      </div>
    </div>
  )
}
