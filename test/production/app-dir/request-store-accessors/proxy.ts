import { inspect } from 'node:util'
import { NextResponse, type NextRequest } from 'next/server'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

export function proxy(request: NextRequest) {
  const store = workUnitAsyncStorage.getStore()
  if (store?.type !== 'request') {
    return NextResponse.json({ type: store?.type })
  }

  if (request.nextUrl.pathname === '/printed') {
    const print = () => inspect(store, { depth: null }) + JSON.stringify(store)
    const printed = [print()]
    // Make the store compute and keep its lazy members.
    const used = [
      store.headers.get('user-agent'),
      store.cookies.get('session')?.value,
      store.mutableCookies.get('session')?.value,
      store.draftMode.isEnabled,
    ]
    printed.push(print())

    return NextResponse.json({
      used,
      printsRequestHeaders: printed.some((text) => text.includes('5f2b7c1e')),
      printsPreviewKeys: printed.some((text) => text.includes('previewMode')),
    })
  }

  const ownAccessors = Object.entries(Object.getOwnPropertyDescriptors(store))
    .filter(([, descriptor]) => descriptor.get || descriptor.set)
    .map(([name]) => name)

  return NextResponse.json({
    type: store.type,
    ownAccessors,
    session: store.cookies.get('session')?.value,
    userAgent: store.headers.get('user-agent'),
  })
}
