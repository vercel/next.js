import { connection } from 'next/server'
// `format` is the first import, so it is the module that first imports the cycle of `constants`
// and `config`.
import { format } from '../../../lib/import-cycle/format'
import { isSupported } from '../../../lib/import-cycle/config'

export async function GET() {
  await connection()

  return Response.json({ formatted: format('x'), supported: isSupported('de') })
}
