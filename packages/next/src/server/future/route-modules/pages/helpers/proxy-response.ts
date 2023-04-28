import type { ServerResponse } from 'http'

import { ReflectAdapter } from '../../../../web/spec-extension/adapters/reflect'
import logger from '../../helpers/logging'

export function proxyResponse(
  res: ServerResponse,
  context: Readonly<{
    hasResolved: boolean
    isDeferred: boolean
  }>
): ServerResponse {
  if (process.env.NODE_ENV !== 'production') {
    return new Proxy(res, {
      get: function (obj, prop) {
        if (context.hasResolved) {
          const message =
            `You should not access 'res' after getServerSideProps resolves.` +
            `\nRead more: https://nextjs.org/docs/messages/gssp-no-mutating-res`

          if (context.isDeferred) {
            throw new Error(message)
          } else {
            logger.warn(message)
          }
        }

        if (typeof prop === 'symbol') {
          return ReflectAdapter.get(obj, prop, res)
        }

        return ReflectAdapter.get(obj, prop, res)
      },
    })
  } else {
    return res
  }
}
