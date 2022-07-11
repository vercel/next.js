import { createReadStream, promises as fs } from 'fs'
import path from 'path'
import { EdgeFunctionDefinition } from '../../../build/webpack/plugins/middleware-plugin'
import { requestToBodyStream } from '../../body-streams'

/**
 * Short-circuits the `fetch` function
 * to return a stream for a given blob, if a user used `new URL("file", import.meta.url)`.
 * This allows to embed blobs in Edge Runtime.
 */
export async function fetchInlineBlob(options: {
  input: RequestInfo
  distDir: string
  assets: EdgeFunctionDefinition['blobs']
  context: { Response: any }
}): Promise<Response | undefined> {
  const inputString = String(options.input)
  if (!inputString.startsWith('blob:')) {
    return
  }

  const hash = inputString.replace('blob:', '')
  const asset = options.assets?.find((x) => x.name === hash)
  if (!asset) {
    return
  }

  const filePath = path.resolve(options.distDir, asset.filePath)

  const fileIsReadable = await fs.access(filePath).then(
    () => true,
    () => false
  )

  if (fileIsReadable) {
    const blob = createReadStream(filePath)
    return new options.context.Response(requestToBodyStream(blob))
  }
}
