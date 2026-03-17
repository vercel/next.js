export async function GET(request: Request) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action')
  const g = globalThis as any

  switch (action) {
    case 'arm': {
      let release!: () => void
      const promise = new Promise<void>((r) => {
        release = r
      })
      g.__notFoundRaceBarrier = { promise, release, enteredCount: 0 }
      return Response.json({ ok: true })
    }
    case 'status':
      return Response.json({
        enteredCount: g.__notFoundRaceBarrier?.enteredCount ?? 0,
      })
    case 'release':
      g.__notFoundRaceBarrier?.release()
      g.__notFoundRaceBarrier = undefined
      return Response.json({ ok: true })
    default:
      return Response.json({ error: 'unknown action' }, { status: 400 })
  }
}
