import type { EdgeFunctionDefinition } from '../../../build/webpack/plugins/middleware-plugin'
import { createReadStream, promises as fs } from 'fs'
import { requestToBodyStream } from '../../body-streams'
import { resolve } from 'path'

/**
 * Short-circuits the `fetch` function
 * to return a stream for a given asset, if a user used `new URL("file", import.meta.url)`.
 * This allows to embed assets in Edge Runtime.
 */
export async function fetchInlineAsset(options: {
  input: RequestInfo | URL
  distDir: string
  assets: EdgeFunctionDefinition['assets']
  context: { Response: typeof Response; ReadableStream: typeof ReadableStream }
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

  const filePath = resolve(options.distDir, asset.filePath)
  const fileIsReadable = await fs.access(filePath).then(
    () => true,
    () => false
  )

  if (fileIsReadable) {
    const readStream = createReadStream(filePath)
    return new options.context.Response(
      requestToBodyStream(options.context, Uint8Array, readStream)
    )
  }
}
