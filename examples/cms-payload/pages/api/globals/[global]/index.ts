import httpStatus from 'http-status'
import formatSuccessResponse from 'payload/dist/express/responses/formatSuccess'
import NotFound from 'payload/dist/errors/NotFound'
import { getTranslation } from 'payload/dist/utilities/getTranslation'
import getErrorHandler from 'payload/dist/express/middleware/errorHandler'
import withPayload from '@payloadcms/next-payload/middleware/withPayload'
import convertPayloadJSONBody from '@payloadcms/next-payload/middleware/convertPayloadJSONBody'
import authenticate from '@payloadcms/next-payload/middleware/authenticate'
import initializePassport from '@payloadcms/next-payload/middleware/initializePassport'
import i18n from '@payloadcms/next-payload/middleware/i18n'
import fileUpload from '@payloadcms/next-payload/middleware/fileUpload'
import withDataLoader from '@payloadcms/next-payload/middleware/dataLoader'

async function handler(req, res) {
  try {
    const globalConfig = req.payload.globals.config.find(
      (global) => global.slug === req.query.global
    )
    const slug = req.query.global

    switch (req.method) {
      case 'GET': {
        const result = await req.payload.findGlobal({
          fallbackLocale: req.query.fallbackLocale,
          user: req.user,
          draft: req.query.draft === 'true',
          showHiddenFields: false,
          overrideAccess: false,
          slug,
          depth: Number(req.query.depth),
          locale: req.query.locale,
        })

        return res.status(200).json(result)
      }

      case 'POST': {
        const global = await req.payload.updateGlobal({
          slug,
          depth: req.query.draft === 'true',
          locale: req.query.locale,
          fallbackLocale: req.query.fallbackLocale,
          data: req.body,
          user: req.user,
          overrideAccess: false,
          showHiddenFields: false,
          draft: req.query.draft === 'true',
        })

        return res.status(201).json({
          ...formatSuccessResponse(
            req.i18n.t('general:updatedSuccessfully', {
              label: getTranslation(globalConfig.label, req.i18n),
            }),
            'message'
          ),
          global,
        })
      }
    }
  } catch (error) {
    const errorHandler = getErrorHandler(req.payload.config, req.payload.logger)
    return errorHandler(error, req, res, () => null)
  }

  return res.status(httpStatus.NOT_FOUND).json(new NotFound(req.t))
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
}

export default withPayload(
  withDataLoader(
    fileUpload(
      convertPayloadJSONBody(i18n(initializePassport(authenticate(handler))))
    )
  )
)
