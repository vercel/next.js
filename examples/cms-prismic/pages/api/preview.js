import { setPreviewData, redirectToPreviewURL } from '@prismicio/next'
import { createClient } from '../../lib/prismic'

export default async function preview(req, res) {
  const client = createClient({ req })

  setPreviewData({ req, res })

  await redirectToPreviewURL({ req, res, client })
}
