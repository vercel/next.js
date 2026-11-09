import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external'
import { declared } from './declared/request-stores'

export const used = {
  routeAtEvaluation: workAsyncStorage.getStore()?.route ?? null,
}

// Nothing uses this export, so the import of the declared module is removed.
export function unused() {
  return declared.routeAtEvaluation
}
