import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  // dummy call
  fs.readdirSync(path.join(process.cwd(), 'public/exclude-me'))

  return new Response('foo')
}
