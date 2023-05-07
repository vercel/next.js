import { TLSSocket } from 'tls'
import {
  addRequestMeta,
  NextUrlWithParsedQuery,
} from 'next/dist/server/request-meta'
import { NodeNextRequest } from 'next/dist/server/base-http/node'
import { BaseNextRequest } from 'next/dist/server/base-http'
import { getCloneableBody } from 'next/dist/server/body-streams'

export function attachRequestMeta(
  req: BaseNextRequest,
  parsedUrl: NextUrlWithParsedQuery,
  host: string
) {
  const protocol = (
    (req as NodeNextRequest).originalRequest?.socket as TLSSocket
  )?.encrypted
    ? 'https'
    : 'http'

  const initUrl = `${protocol}://${host}${req.url}`

  addRequestMeta(req, '__NEXT_INIT_URL', initUrl)
  addRequestMeta(req, '__NEXT_INIT_QUERY', { ...parsedUrl.query })
  addRequestMeta(req, '_protocol', protocol)
  addRequestMeta(req, '__NEXT_CLONABLE_BODY', getCloneableBody(req.body))
}
