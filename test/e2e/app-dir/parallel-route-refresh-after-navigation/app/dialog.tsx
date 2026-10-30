'use client'
import { useRouter } from 'next/navigation'
import { mutate } from './actions'

export function Dialog({
  kind,
  closePath,
}: {
  kind: 'edit' | 'result'
  closePath: string
}) {
  const router = useRouter()
  return (
    <aside>
      <h2 id="dialog-kind">{kind}</h2>
      <button id="close" onClick={() => router.replace(closePath)}>
        Close
      </button>
      <button id="refresh" onClick={() => router.refresh()}>
        Refresh
      </button>
      <button
        id="mutate"
        onClick={async () => {
          await mutate()
          router.replace(`/result?closePath=${encodeURIComponent(closePath)}`)
        }}
      >
        Mutate
      </button>
    </aside>
  )
}
