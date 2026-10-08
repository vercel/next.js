import fs from 'fs/promises'
import path from 'path'

// Serve the image with a delay so that the Largest Contentful Paint entry is
// always reported after both <Image> components have registered themselves in
// the dev-only LCP bookkeeping map.
export async function GET() {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const file = await fs.readFile(path.join(process.cwd(), 'public', 'test.jpg'))
  return new Response(file, {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'no-store',
    },
  })
}
