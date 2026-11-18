import fs from 'node:fs'
import path from 'node:path'

export async function GET(request: Request) {
  const name =
    new URL(request.url).searchParams.get('name') ?? 'web/data/data.txt'
  // Dynamic path relative to the monorepo root: this traces the whole
  // outputFileTracingRoot.
  return new Response(
    fs.readFileSync(path.join(process.cwd(), '..', name), 'utf8')
  )
}
