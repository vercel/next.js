import type { Readable } from 'node:stream'
import type { IncomingHttpHeaders } from 'node:http'
import { InvariantError } from '../../shared/lib/invariant-error'

export async function isMpaActionBodyNode(
  body: Readable,
  headers: IncomingHttpHeaders
): Promise<boolean> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError('This function cannot be used in the edge runtime')
  } else {
    const createBusboy = require('busboy') as typeof import('busboy')
    const { pipeline } = require('node:stream') as typeof import('node:stream')
    const busboy = createBusboy({
      defParamCharset: 'utf8',
      headers: headers,
      limits: {
        // TODO: limit body size
        fields: 1,
      },
    })

    return new Promise<boolean>((resolve, reject) => {
      pipeline(body, busboy, (err) => reject(err))

      busboy.once('field', (name, value) => {
        const res = !!(
          value === '' &&
          (/^\$ACTION_REF_\d+$/.test(name) ||
            /^\$ACTION_ID_[0-9a-f]+$/.test(name))
        )
        resolve(res)
      })
    }).finally(() => {
      body.unpipe(busboy)
    })
  }
}
