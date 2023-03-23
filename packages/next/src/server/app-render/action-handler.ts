import type { IncomingMessage, ServerResponse } from 'http'

import { ACTION } from '../../client/components/app-router-headers'
import { isNotFoundError } from '../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
} from '../../client/components/redirect'
import RenderResult from '../render-result'
import { ActionRenderResult } from './action-render-result'

export async function handleAction({
  req,
  res,
  ComponentMod,
  pathname,
  serverActionsManifest,
}: {
  req: IncomingMessage
  res: ServerResponse
  ComponentMod: any
  pathname: string
  serverActionsManifest: any
}): Promise<undefined | RenderResult | 'not-found'> {
  let actionId = req.headers[ACTION.toLowerCase()] as string
  const contentType = req.headers['content-type']
  const isFormAction =
    req.method === 'POST' && contentType === 'application/x-www-form-urlencoded'
  const isMultipartAction =
    req.method === 'POST' && contentType?.startsWith('multipart/form-data')

  const isFetchAction =
    actionId !== undefined &&
    typeof actionId === 'string' &&
    req.method === 'POST'

  if (isFetchAction || isFormAction || isMultipartAction) {
    if (process.env.NEXT_RUNTIME !== 'edge') {
      try {
        let bound = []

        const workerName = 'app' + pathname
        const { decodeReply } = ComponentMod

        if (isMultipartAction) {
          const formFields: any[] = []

          const busboy = require('busboy')
          const bb = busboy({ headers: req.headers })
          let innerResolvor: () => void, innerRejector: (e: any) => void
          const promise = new Promise<void>((resolve, reject) => {
            innerResolvor = resolve
            innerRejector = reject
          })
          bb.on('file', () =>
            innerRejector(new Error('File upload is not supported.'))
          )
          bb.on('error', (err: any) => innerRejector(err))
          bb.on('field', (id: any, val: any) => (formFields[+id] = val))
          bb.on('finish', () => innerResolvor())
          req.pipe(bb)
          await promise

          bound = await decodeReply(
            formFields,
            new Proxy(
              {},
              {
                get: (_, id: string) => {
                  return {
                    id: serverActionsManifest[id].workers[workerName],
                    name: id,
                    chunks: [],
                  }
                },
              }
            )
          )
        } else {
          const { parseBody } =
            require('../api-utils/node') as typeof import('../api-utils/node')
          const actionData = (await parseBody(req, '1mb')) || ''

          if (isFormAction) {
            actionId = actionData.$$id as string
            if (!actionId) {
              throw new Error('Invariant: missing action ID.')
            }
            const formData = new URLSearchParams(actionData)
            formData.delete('$$id')
            bound = [formData]
          } else {
            bound = await decodeReply(actionData)
          }
        }

        const actionModId = serverActionsManifest[actionId].workers[workerName]
        const actionHandler =
          ComponentMod.__next_app_webpack_require__(actionModId)[actionId]

        const returnVal = await actionHandler.apply(null, bound)
        const result = new ActionRenderResult(JSON.stringify([returnVal]))
        // For form actions, we need to continue rendering the page.
        if (isFetchAction) {
          return result
        }
      } catch (err) {
        if (isRedirectError(err)) {
          if (isFetchAction) {
            throw new Error('Invariant: not implemented.')
          }
          const redirectUrl = getURLFromRedirectError(err)
          res.statusCode = 303
          res.setHeader('Location', redirectUrl)
          return new ActionRenderResult(JSON.stringify({}))
        } else if (isNotFoundError(err)) {
          if (isFetchAction) {
            throw new Error('Invariant: not implemented.')
          }
          res.statusCode = 404
          return 'not-found'
        }

        if (isFetchAction) {
          res.statusCode = 500
          return new RenderResult(
            (err as Error)?.message ?? 'Internal Server Error'
          )
        }

        throw err
      }
    } else {
      throw new Error('Not implemented in Edge Runtime.')
    }
  }
}
