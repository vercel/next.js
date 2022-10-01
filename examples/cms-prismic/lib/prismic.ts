import * as prismic from '@prismicio/client'
import * as prismicNext from '@prismicio/next'

import sm from '../sm.json'

/**
 * The project's Prismic repository name.
 */
export const repositoryName = prismic.getRepositoryName(sm.apiEndpoint)

/**
 * Route definitions for Prismic documents.
 */
const routes: prismic.Route[] = [
  {
    type: 'post',
    path: '/posts/:uid',
  },
]

/**
 * Creates a Prismic client for the project's repository. The client is used to
 * query content from the Prismic API.
 *
 * @param config - Configuration for the Prismic client.
 */
export const createClient = ({
  previewData,
  req,
  ...config
}: prismicNext.CreateClientConfig = {}) => {
  const client = prismic.createClient(sm.apiEndpoint, {
    routes,
    ...config,
  })

  prismicNext.enableAutoPreviews({ client, previewData, req })

  return client
}
