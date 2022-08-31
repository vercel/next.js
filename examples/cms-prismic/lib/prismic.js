import * as prismic from '@prismicio/client'
import * as prismicNext from '@prismicio/next'
import sm from '../sm.json'

/**
 * The project's Prismic repository name.
 */
export const repositoryName = prismic.getRepositoryName(sm.apiEndpoint)

/**
 * Route definitions for Prismic documents.
 *
 * @type {import("@prismicio/client").Route[]}
 */
const routes = [
  {
    type: 'post',
    path: '/posts/:uid',
  },
]

/**
 * Creates a Prismic client for the project's repository. The client is used to
 * query content from the Prismic API.
 *
 * @typedef {import("@prismicio/next").CreateClientConfig & import("@prismicio/client").ClientConfig} Config
 *
 * @param config {Config} - Configuration for the Prismic client.
 */
export const createClient = ({ previewData, req, ...config } = {}) => {
  const client = prismic.createClient(sm.apiEndpoint, {
    routes,
    ...config,
  })

  prismicNext.enableAutoPreviews({ client, previewData, req })

  return client
}
