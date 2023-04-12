import httpStatus from 'http-status'
import NotFound from 'payload/dist/errors/NotFound'
import { getTranslation } from 'payload/dist/utilities/getTranslation'
import formatSuccessResponse from 'payload/dist/express/responses/formatSuccess'
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
    switch (req.method) {
      case 'GET': {
        let page
        let limit

        if (typeof req.query.page === 'string') {
          const parsedPage = parseInt(req.query.page, 10)

          if (!Number.isNaN(parsedPage)) {
            page = parsedPage
          }
        }

        if (typeof req.query.limit === 'string') {
          const parsedLimit = parseInt(req.query.limit, 10)

          if (!Number.isNaN(parsedLimit)) {
            limit = parsedLimit
          }
        }

        const result = await req.payload.find({
          req,
          collection: req.query.collection,
          where: req.query.where,
          page,
          limit,
          sort: req.query.sort,
          depth: Number(req.query.depth),
          draft: req.query.draft === 'true',
          overrideAccess: false,
        })

        return res.status(200).json(result)
      }

      case 'POST': {
        const doc = await req.payload.create({
          req,
          collection: req.query.collection,
          data: req.body,
          depth: Number(req.query.depth),
          draft: req.query.draft === 'true',
          overrideAccess: false,
          file: req.files && req.files.file ? req.files.file : undefined,
        })

        const collection = req.payload.collections[req.query.collection]

        return res.status(201).json({
          ...formatSuccessResponse(
            req.i18n.t('general:successfullyCreated', {
              label: getTranslation(
                collection.config.labels.singular,
                req.i18n
              ),
            }),
            'message'
          ),
          doc,
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
