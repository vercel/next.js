import * as contentstack from 'contentstack'
import * as Utils from '@contentstack/utils'

import ContentstackLivePreview from '@contentstack/live-preview-utils'
import getConfig from 'next/config'

const { publicRuntimeConfig } = getConfig()
const envConfig = process.env.CONTENTSTACK_API_KEY
  ? process.env
  : publicRuntimeConfig

const Stack = contentstack.Stack({
  api_key: envConfig.CONTENTSTACK_API_KEY
    ? envConfig.CONTENTSTACK_API_KEY
    : envConfig.NEXT_PUBLIC_CONTENTSTACK_API_KEY,
  delivery_token: envConfig.CONTENTSTACK_DELIVERY_TOKEN,
  environment: envConfig.CONTENTSTACK_ENVIRONMENT,
  live_preview: {
    enable: envConfig.CONTENTSTACK_LIVE_PREVIEW === 'true',
    management_token: envConfig.CONTENTSTACK_MANAGEMENT_TOKEN,
    host: envConfig.CONTENTSTACK_API_HOST,
  },
})

if (envConfig.CONTENTSTACK_API_HOST) {
  Stack.setHost(envConfig.CONTENTSTACK_API_HOST)
}

ContentstackLivePreview.init({
  stackSdk: Stack,
  clientUrlParams: {
    host: envConfig.CONTENTSTACK_APP_HOST,
  },
  ssr: false,
})

export const { onEntryChange } = ContentstackLivePreview

const renderOption = {
  span: (node, next) => next(node.children),
}

export default {
  /**
   *
   * fetches all the entries from specific content-type
   * @param {* content-type uid} contentTypeUid
   * @param {* reference field name} referenceFieldPath
   * @param {* Json RTE path} jsonRtePath
   *
   */
  getEntry({ contentTypeUid, referenceFieldPath, jsonRtePath }) {
    return new Promise((resolve, reject) => {
      const query = Stack.ContentType(contentTypeUid).Query()
      if (referenceFieldPath) query.includeReference(referenceFieldPath)
      query
        .includeOwner()
        .toJSON()
        .find()
        .then(
          (result) => {
            jsonRtePath &&
              Utils.jsonToHTML({
                entry: result,
                paths: jsonRtePath,
                renderOption,
              })
            resolve(result)
          },
          (error) => {
            reject(error)
          }
        )
    })
  },

  /**
   *fetches specific entry from a content-type
   *
   * @param {* content-type uid} contentTypeUid
   * @param {* url for entry to be fetched} entryUrl
   * @param {* reference field name} referenceFieldPath
   * @param {* Json RTE path} jsonRtePath
   * @returns
   */
  getEntryByUrl({ contentTypeUid, entryUrl, referenceFieldPath, jsonRtePath }) {
    return new Promise((resolve, reject) => {
      const blogQuery = Stack.ContentType(contentTypeUid).Query()
      if (referenceFieldPath) blogQuery.includeReference(referenceFieldPath)
      blogQuery.includeOwner().toJSON()
      const data = blogQuery.where('url', `${entryUrl}`).find()
      data.then(
        (result) => {
          jsonRtePath &&
            Utils.jsonToHTML({
              entry: result,
              paths: jsonRtePath,
              renderOption,
            })
          resolve(result[0])
        },
        (error) => {
          console.error(error)
          reject(error)
        }
      )
    })
  },
}
