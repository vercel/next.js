import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function getMessage() {
  'use cache'
  return (await readFile(join(process.cwd(), 'data.txt'), 'utf8')).trim()
}

export async function GET() {
  return Response.json({ message: await getMessage() })
}
