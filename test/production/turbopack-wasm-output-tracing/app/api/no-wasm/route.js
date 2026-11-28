import { readFileSync } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export function GET() {
  const result = readFileSync(path.join(process.cwd(), 'required.txt'), 'utf8')
  return Response.json({ result: result.trim() })
}
