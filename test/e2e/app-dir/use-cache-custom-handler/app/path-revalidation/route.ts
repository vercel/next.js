import { revalidatePath, revalidateTag } from 'next/cache'
import { connection } from 'next/server'
import cacheSharingState from '../../cache-sharing-state'

export async function GET(request: Request) {
  await connection()

  const id = new URL(request.url).searchParams.get('id')
  if (id !== null) {
    return Response.json({
      startedRoutes: cacheSharingState.startedRoutes,
      fills: cacheSharingState.fills.filter((key) => key === id),
      writes: cacheSharingState.writes.filter(
        (tag) => tag === `observed-fill:${id}`
      ),
      routeBLookupKeys: cacheSharingState.routeBLookupKeys.filter((key) =>
        key.includes(JSON.stringify(id))
      ),
    })
  }

  return Response.json({
    softTags: cacheSharingState.softTags,
    startedRoutes: cacheSharingState.startedRoutes,
  })
}

export async function POST(request: Request) {
  switch (await request.text()) {
    case 'revalidate-route-b':
      revalidatePath('/path-revalidation/b')
      break
    case 'invalidate-entry': {
      const id = new URL(request.url).searchParams.get('id')
      if (id === null) {
        return new Response(null, { status: 400 })
      }
      revalidateTag(`observed-fill:${id}`, { expire: 0 })
      break
    }
    case 'hold-fill':
      cacheSharingState.pendingFill = new Promise((resolve) => {
        cacheSharingState.releaseFill = resolve
      })
      break
    case 'release-fill':
      cacheSharingState.releaseFill?.()
      cacheSharingState.pendingFill = null
      cacheSharingState.releaseFill = null
      break
    case 'hold-route-lookup-result':
      cacheSharingState.pendingRouteLookupResult = new Promise((resolve) => {
        cacheSharingState.releaseRouteLookupResult = resolve
      })
      break
    case 'release-route-lookup-result':
      cacheSharingState.releaseRouteLookupResult?.()
      cacheSharingState.pendingRouteLookupResult = null
      cacheSharingState.releaseRouteLookupResult = null
      break
    case 'hold-entry-lookup':
      cacheSharingState.softTags.length = 0
      cacheSharingState.startedRoutes.length = 0
      cacheSharingState.pendingEntryLookup = new Promise((resolve) => {
        cacheSharingState.releaseEntryLookup = resolve
      })
      break
    case 'release-entry-lookup':
      cacheSharingState.releaseEntryLookup?.()
      cacheSharingState.releaseEntryLookup = null
      cacheSharingState.pendingEntryLookup = null
      break
    default:
      return new Response(null, { status: 400 })
  }

  return new Response(null, { status: 204 })
}
