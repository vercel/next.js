import fs from 'node:fs'
import path from 'node:path'

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get('name') ?? 'data/data.txt'
  // Dynamic path relative to the project directory: this traces the whole
  // project directory.
  return new Response(fs.readFileSync(path.join(process.cwd(), name), 'utf8'))
}
