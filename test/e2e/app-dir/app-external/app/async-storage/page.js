import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

export default async function Page() {
  // cookies is undefined if not set
  return !!workUnitAsyncStorage.getStore().cookies ? 'success' : 'fail'
}

export const dynamic = 'force-dynamic'
