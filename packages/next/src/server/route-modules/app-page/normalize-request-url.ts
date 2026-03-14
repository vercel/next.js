import type { IncomingMessage } from 'http'

import type { BaseNextRequest } from '../../base-http'
import { parseReqUrl } from '../../../lib/url'
import { formatUrl } from '../../../shared/lib/router/utils/format-url'

export function normalizeAppPageRequestUrl(
  req: Pick<IncomingMessage | BaseNextRequest, 'url'>,
  pathname: string
) {
  if (!req.url) {
    return
  }

  const normalizedUrl = parseReqUrl(req.url)
  if (!normalizedUrl) {
    return
  }

  normalizedUrl.pathname = pathname
  req.url = formatUrl(normalizedUrl)
}
