export type ServerlessIsomorphicLoaderOptions = {
  page: string
  pageFilePath: string
}

export default function serverlessIsomorphicLoader(this: any) {
  const opts: ServerlessIsomorphicLoaderOptions = this.getOptions()
  return `
    import { buildToNodeHandler } from 'next/dist/compiled/@edge-runtime/node-utils'

    class FetchEvent extends Event {
      constructor(request) {
        super('fetch')
        this.request = request
        this.awaiting = new Set()
      }
    }

    
    const nodeMajorVersion = Number(process.versions.node.split('.')[0])
    if (nodeMajorVersion < 18) {
      throw new Error('API routes can only export an edge compliant handler on node.js 18 and later. Learn More: https://nextjs.org/docs/messages/isomorphic-runtime-limitation')
    }

    const toNodeHandler = buildToNodeHandler(
      {
        Headers: globalThis.Headers,
        ReadableStream: globalThis.ReadableStream,
        Request: globalThis.Request,
        Uint8Array: globalThis.Uint8Array,
        FetchEvent,
      },
      { defaultOrigin: 'http://example.com' } // only used when incoming request has no Host header
    )
    export default toNodeHandler(require(${JSON.stringify(
      opts.pageFilePath
    )}).default)
  `
}
