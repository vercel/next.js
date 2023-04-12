import httpStatus from 'http-status'
import NotFound from 'payload/dist/errors/NotFound'
import updatePreference from 'payload/dist/preferences/operations/update'
import getErrorHandler from 'payload/dist/express/middleware/errorHandler'
import deletePreference from 'payload/dist/preferences/operations/delete'
import findPreference from 'payload/dist/preferences/operations/findOne'
import formatSuccessResponse from 'payload/dist/express/responses/formatSuccess'
import convertPayloadJSONBody from '@payloadcms/next-payload/middleware/convertPayloadJSONBody'
import withPayload from '@payloadcms/next-payload/middleware/withPayload'
import authenticate from '@payloadcms/next-payload/middleware/authenticate'
import initializePassport from '@payloadcms/next-payload/middleware/initializePassport'
import i18n from '@payloadcms/next-payload/middleware/i18n'
import fileUpload from '@payloadcms/next-payload/middleware/fileUpload'
import withDataLoader from '@payloadcms/next-payload/middleware/dataLoader'

async function handler(req, res) {
  try {
    // Unfortunately,
    // There is a route collision between /api/_preferences/[key].js
    // and /api/[collection]/[id].js
    // so both need to be handled in this file for now
    if (req.query.collection === '_preferences') {
      switch (req.method) {
        case 'GET': {
          const result = await findPreference({
            req,
            user: req.user,
            key: req.query.id,
          })

          return res
            .status(httpStatus.OK)
            .json(result || { message: req.t('general:notFound'), value: null })
        }

        case 'POST': {
          const doc = await updatePreference({
            req,
            user: req.user,
            key: req.query.id,
            value: req.body.value || req.body,
          })

          return res.status(httpStatus.OK).json({
            ...formatSuccessResponse(
              req.t('general:updatedSuccessfully'),
              'message'
            ),
            doc,
          })
        }

        case 'DELETE': {
          await deletePreference({
            req,
            user: req.user,
            key: req.query.id,
          })

          return res.status(httpStatus.OK).json({
            ...formatSuccessResponse(req.t('deletedSuccessfully'), 'message'),
          })
        }
      }
    }

    switch (req.method) {
      case 'GET': {
        const doc = await req.payload.findByID({
          req,
          collection: req.query.collection,
          id: req.query.id,
          depth: Number(req.query.depth),
          overrideAccess: false,
          draft: req.query.draft === 'true',
        })

        return res.status(httpStatus.OK).json(doc)
      }

      case 'PATCH': {
        const draft = req.query.draft === 'true'
        const autosave = req.query.autosave === 'true'

        const doc = await req.payload.update({
          user: req.user,
          collection: req.query.collection,
          id: req.query.id,
          data: req.body,
          depth: parseInt(String(req.query.depth), 10),
          draft,
          autosave,
          overrideAccess: false,
          file: req.files && req.files.file ? req.files.file : undefined,
        })

        let message = req.t('general:updatedSuccessfully')

        if (draft) message = req.t('versions:draftSavedSuccessfully')
        if (autosave) message = req.t('versions:autosavedSuccessfully')

        return res.status(httpStatus.OK).json({
          ...formatSuccessResponse(message, 'message'),
          doc,
        })
      }

      case 'DELETE': {
        const doc = await req.payload.delete({
          user: req.user,
          collection: req.query.collection,
          id: req.query.id,
          depth: parseInt(String(req.query.depth), 10),
          overrideAccess: false,
        })

        if (!doc) {
          return res.status(httpStatus.NOT_FOUND).json(new NotFound(req.t))
        }

        return res.status(httpStatus.OK).send(doc)
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
