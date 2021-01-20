/* eslint-disable no-dupe-keys */
import Contentstack from 'contentstack'
import axios from 'axios'

const Stack = Contentstack.Stack({
  api_key: process.env.contentstack_api_key,
  delivery_token: process.env.contentstack_delivery_token,
  environment: process.env.contentstack_environment,
  region: process.env.contentstack_region
    ? process.env.contentstack_region
    : 'us',
})
process.env.contentstack_custom_host &&
  Stack.setHost(process.env.contentstack_custom_host)
const createUrl =
  process.env.contentstack_region === 'us'
    ? 'cdn.contentstack.io/v3'
    : process.env.contentstack_custom_host
    ? process.env.contentstack_custom_host
    : 'eu-cdn.contentstack.com/v3'

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
  getPeviewData(entryID) {
    return new Promise((resolve, reject) => {
      axios({
        method: 'get',
        baseURL: `https://${createUrl}/content_types/post/entries/${entryID}`,
        headers: {
          api_key: process.env.contentstack_api_key,
          Authorization: process.env.contentstack_management_token,
          'content-Type': 'application/json',
        },
        params: {
          'include[]': 'more_posts',
          'include[]': 'more_posts.author',
          'include[]': 'author',
        },
      })
        .then((resp) => {
          resolve(resp.data.entry)
        })
        .catch((err) => {
          reject(err)
        })
    })
  },
}
