/* eslint-disable no-dupe-keys */
import Contentstack from 'contentstack'
import * as contentstack from '@contentstack/management'
const contentstackClient = contentstack.client()

const Stack = Contentstack.Stack({
  api_key: process.env.contentstack_api_key,
  delivery_token: process.env.contentstack_delivery_token,
  environment: process.env.contentstack_environment,
  region:
    process.env.contentstack_region !== 'us'
      ? process.env.contentstack_region
      : 'us',
})
if (process.env.contentstack_custom_host) {
  Stack.setHost(process.env.contentstack_custom_host)
  contentstackClient.stack({ host: process.env.contentstack_custom_host })
}
export default {
  getEntry(ctUid, ref) {
    return new Promise((resolve, reject) => {
      Stack.ContentType(ctUid)
        .Query()
        .includeReference(ref)
        .includeOwner()
        .toJSON()
        .find()
        .then(
          (result) => {
            resolve(result[0])
          },
          (error) => {
            reject(error)
          }
        )
    })
  },
  getSpecificEntry(ctUid, entryUrl, ref) {
    return new Promise((resolve, reject) => {
      const blogQuery = Stack.ContentType(ctUid)
        .Query()
        .includeReference(ref)
        .toJSON()
      const data = blogQuery.where('url', `${entryUrl}`).find()
      data.then(
        (result) => {
          resolve(result[0])
        },
        (error) => {
          reject(error)
        }
      )
    })
  },
  getPreviewData(entryID) {
    return new Promise((resolve, reject) => {
      process.env &&
        contentstackClient
          .stack({
            api_key: process.env.contentstack_api_key,
            management_token: process.env.contentstack_management_token,
            region:
              process.env.contentstack_region !== 'us'
                ? process.env.contentstack_region
                : 'us',
          })
          .contentType('post')
          .entry(entryID)
          .fetch({ 'include[]': ['more_posts', 'more_posts.author', 'author'] })
          .then((resp) => {
            resolve(JSON.parse(JSON.stringify(resp)))
          })
          .catch((err) => {
            reject(err)
          })
    })
  },
}
