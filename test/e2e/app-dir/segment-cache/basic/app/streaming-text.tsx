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
    <div>
      <div data-streaming-text-static={staticText}>{staticText}</div>
      <Suspense fallback={<div>Loading... [{dynamic}]</div>}>
        <div data-streaming-text-dynamic={dynamic}>
          <DynamicText text={dynamic} />
        </div>
      </Suspense>
    </div>
  )
}
