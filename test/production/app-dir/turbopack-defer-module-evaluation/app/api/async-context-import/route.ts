import { connection } from 'next/server'
import { atEvaluation } from '../../../lib/declared/imported-in-request'
import { requestStore } from '../../../lib/request-store'

function read() {
  return atEvaluation
}

export async function GET(request: Request) {
  await connection()

  // The `import()` reaches the declared module inside the store of the first request, before
  // anything reads the import above.
  const id = new URL(request.url).searchParams.get('id')!
  return requestStore.run(id, async () => {
    const imported = await import('../../../lib/declared/imported-in-request')
    return Response.json({ imported: imported.atEvaluation, read: read() })
  })
}
