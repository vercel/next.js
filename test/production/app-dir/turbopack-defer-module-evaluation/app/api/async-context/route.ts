import { connection } from 'next/server'
import { kept } from '../../../lib/declared/async-context'
import { requestStore } from '../../../lib/request-store'

export async function GET(request: Request) {
  await connection()

  // The first read of the declared module happens inside the store of the first request.
  const id = new URL(request.url).searchParams.get('id')!
  return requestStore.run(id, async () => Response.json(await kept()))
}
