import * as lib from 'library-with-module-condition'

export const runtime = 'nodejs'

export function GET() {
  return Response.json({ source: lib.source })
}
