import type { FsOutput } from './filesystem'
import type ResponseCache from '../../response-cache'
import type { IncomingMessage, ServerResponse } from 'http'
import type { NextConfigComplete } from '../../config-shared'
import type { NextUrlWithParsedQuery } from '../../request-meta'
import type { UnwrapPromise } from '../../../lib/coalesced-function'

import { handleImage } from './output-handlers/image'
import { handleStaticFile } from './output-handlers/static-file'
import { handleEdgeFunction } from './output-handlers/edge-function'
import path from 'path'

export type HandleOutputCtx = {
  req: IncomingMessage
  res: ServerResponse
  hostname: string
  port: string
  dev: boolean
  output: FsOutput
  fsChecker: UnwrapPromise<
    ReturnType<typeof import('./filesystem').setupFsCheck>
  >
  distDir: string
  minimalMode: boolean
  responseCache: ResponseCache
  nextConfig: NextConfigComplete
  parsedUrl: NextUrlWithParsedQuery
  ipcMethods: Record<string, any>
  requestHandler: (req: IncomingMessage, res: ServerResponse) => any
  invokeRender?: (
    parsedUrl: NextUrlWithParsedQuery,
    type: 'app' | 'pages',
    invokePath: string,
    additionalInvokeHeaders?: Record<string, string>
  ) => any
}

export async function handleOutput(ctx: HandleOutputCtx) {
  const { output, parsedUrl, invokeRender } = ctx

  switch (output.type) {
    case 'appFile':
    case 'pageFile': {
      if (output.runtime === 'edge') {
        await handleEdgeFunction(ctx)
      } else {
        if (!invokeRender) {
          throw new Error(
            `Invariant: invokeRender missing for nodejs handleOutput`
          )
        }
        await invokeRender(
          parsedUrl,
          output.type === 'appFile' ? 'app' : 'pages',
          parsedUrl.pathname || '/',
          {
            'x-invoke-output': path.posix.join('/', output.itemPath),
            'x-invoke-fallback': output.fallbackMode || '',
            'x-invoke-prerendered': output.fromStaticPaths ? '1' : '',
          }
        )
      }
      break
    }
    case 'nextImage': {
      await handleImage(ctx)
      break
    }
    case 'nextStaticFolder':
    case 'publicFolder':
    case 'legacyStaticFolder': {
      await handleStaticFile(ctx)
      break
    }
    default: {
      throw new Error(`Unrecognized output type ${output.type}`)
    }
  }
}
