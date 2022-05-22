import { parse as parseUrl } from 'url'
import { IncomingMessage, ServerResponse } from 'http'
import { apiResolver } from '../../../../server/api-utils/node'
import { getUtils, vercelHeader, ServerlessHandlerCtx } from './utils'
import { DecodeError } from '../../../../shared/lib/utils'
import {
  NodeNextResponse,
  NodeNextRequest,
} from '../../../../server/base-http/node'

export function getApiHandler(ctx: ServerlessHandlerCtx) {
  const { pageModule, encodedPreviewProps, pageIsDynamic } = ctx
  const {
    handleRewrites,
    handleBasePath,
    dynamicRouteMatcher,
    normalizeDynamicRouteParams,
  } = getUtils(ctx)

  return async (
    rawReq: NodeNextRequest | IncomingMessage,
    rawRes: NodeNextResponse | ServerResponse
  ) => {
    const req =
      rawReq instanceof IncomingMessage ? new NodeNextRequest(rawReq) : rawReq
    const res =
      rawRes instanceof ServerResponse ? new NodeNextResponse(rawRes) : rawRes

    try {
      // We need to trust the dynamic route params from the proxy
      // to ensure we are using the correct values
      const trustQuery = req.headers[vercelHeader]
      const parsedUrl = parseUrl(req.url!, true)
      handleRewrites(req, parsedUrl)

      if (parsedUrl.query.nextInternalLocale) {
        delete parsedUrl.query.nextInternalLocale
      }
      handleBasePath(req, parsedUrl)

      let params = {}

      if (pageIsDynamic) {
        const result = normalizeDynamicRouteParams(
          trustQuery
            ? parsedUrl.query
            : (dynamicRouteMatcher!(parsedUrl.pathname) as Record<
                string,
                string | string[]
              >)
        )

        params = result.params
      }

      await apiResolver(
        req.originalRequest,
        res.originalResponse,
        Object.assign({}, parsedUrl.query, params),
        await pageModule,
        encodedPreviewProps,
        true
      )
    } catch (err) {
      console.error(err)

      if (err instanceof DecodeError) {
        res.statusCode = 400
        res.body('Bad Request').send()
      } else {
        // Throw the error to crash the serverless function
        throw err
      }
    }
  }
}
