import path from 'node:path'

// `dir` is only known at runtime, so the build traces this call by looking for
// an `out` entry anywhere in the project.
export async function GET(request: Request) {
  const dir = new URL(request.url).searchParams.get('dir') ?? '/tmp'
  return Response.json({ out: path.join(dir, 'out') })
}
