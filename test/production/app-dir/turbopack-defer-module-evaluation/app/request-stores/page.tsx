import { connection } from 'next/server'
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external'
import { declared } from '../../lib/declared/request-stores'
import { used } from '../../lib/unused-export'

// Read while this module is evaluated, so the declared module is imported eagerly. Its only other
// import, in `unused-export.ts`, is removed: nothing defers it.
const routesAtEvaluation = [
  declared.routeAtEvaluation,
  used.routeAtEvaluation,
  workAsyncStorage.getStore()?.route ?? null,
]

export default async function Page() {
  await connection()
  return <p id="result">{JSON.stringify(routesAtEvaluation)}</p>
}
