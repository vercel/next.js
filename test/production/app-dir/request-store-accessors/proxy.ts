import { NextResponse } from 'next/server'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

export function proxy() {
  const store = workUnitAsyncStorage.getStore()
  if (store?.type !== 'request') {
    return NextResponse.json({ type: store?.type })
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
