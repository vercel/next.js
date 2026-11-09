import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external'

// The route that Next.js renders while this module is evaluated.
export const declared = {
  routeAtEvaluation: workAsyncStorage.getStore()?.route ?? null,
}
