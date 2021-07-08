import { parse as parseUrl } from 'url'
import { IncomingMessage, ServerResponse } from 'http'
import { apiResolver } from '../../../../server/api-utils'
import { getUtils, vercelHeader, ServerlessHandlerCtx } from './utils'
import { DecodeError } from '../../../../shared/lib/utils'

export function getApiHandler(ctx: ServerlessHandlerCtx) {
  const { pageModule, encodedPreviewProps, pageIsDynamic } = ctx
  const {
    handleRewrites,
    handleBasePath,
    dynamicRouteMatcher,
    normalizeDynamicRouteParams,
  } = getUtils(ctx)

  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      // We need to trust the dynamic route params from the proxy
      // to ensure we are using the correct values
      const trustQuery = req.headers[vercelHeader]
      const parsedUrl = handleRewrites(req, parseUrl(req.url!, true))

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
        req,
        res,
        Object.assign({}, parsedUrl.query, params),
        await pageModule,
        encodedPreviewProps,
        true
      )
    } catch (err) {
      console.error(err)

      if (err instanceof DecodeError) {
        res.statusCode = 400
        res.end('Bad Request')
      } else {
        // Throw the error to crash the serverless function
        throw err
      }
    }
  }
}
