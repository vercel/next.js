import { CachedView } from './cached-view'

export async function readComponent() {
  'use cache'
  return <CachedView />
}
