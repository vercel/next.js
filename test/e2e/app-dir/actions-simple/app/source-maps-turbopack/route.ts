import { readFile } from 'fs/promises'
import { NextRequest } from 'next/server'

// This is for mocking findSourceMapURL until we've implemented it properly.
export async function GET(request: NextRequest): Promise<Response> {
  const filename = request.nextUrl.searchParams.get('filename')

  try {
    // It's not safe not to sanitize the query param, but it's just for a test.
    const sourceMapContents = await readFile(`${filename}.map`)

    return new Response(sourceMapContents)
  } catch (error) {
    console.error(error)
  }

  return new Response(null, { status: 404 })
}
