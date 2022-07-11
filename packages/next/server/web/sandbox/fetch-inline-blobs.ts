import { createReadStream, promises as fs } from 'fs'
import path from 'path'
import { requestToBodyStream } from '../../body-streams'

/**
 * Short-circuits the `fetch` function
 * to return a stream for a given blob, if a user used `new URL("file", import.meta.url)`.
 * This allows to embed blobs in Edge Runtime.
 */
export async function fetchInlineBlob(options: {
  input: RequestInfo
  distDir: string
  context: { Response: any }
}): Promise<Response | undefined> {
  const inputString = String(options.input)

  /**
   * `file://` URLs should always fail to load
   */
  if (inputString.startsWith('file://')) {
    return new Response('Not Found', { status: 404 })
  } else if (!inputString.startsWith('/_next/static/media/')) {
    return
  }

  const rootMediaDirectory = path.resolve(
    options.distDir,
    'server/static/media'
  )
  const pathname = inputString.replace('/_next/static/media/', '')
  const fullPathname = path.resolve(rootMediaDirectory, pathname)

  if (isPathUnderRoot({ root: rootMediaDirectory, path: fullPathname })) {
    return
  }

  const fileIsReadable = await fs.access(fullPathname).then(
    () => true,
    () => false
  )

  if (fileIsReadable) {
    const blob = createReadStream(fullPathname)
    return new options.context.Response(requestToBodyStream(blob))
  }
}

function isPathUnderRoot(options: { root: string; path: string }): boolean {
  const relative = path.relative(options.root, options.path)
  return !relative || relative.startsWith('..') || path.isAbsolute(relative)
}
