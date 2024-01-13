import { requestAsyncStorage } from 'next/dist/client/components/request-async-storage.external'

export default async function Page() {
  // cookies is undefined if not set
  return !!requestAsyncStorage.getStore().cookies ? 'success' : 'fail'
}

export const dynamic = 'force-dynamic'
