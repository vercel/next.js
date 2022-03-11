import { isValidRequest } from '@sanity/webhook'
import { sanityClient } from '../../lib/sanity.server'

const AUTHOR_UPDATED_QUERY = `
  *[_type == "author" && _id == $id] {
    "slug": *[_type == "post" && references(^._id)].slug.current
  }["slug"][]`
const POST_UPDATED_QUERY = `*[_type == "post" && _id == $id].slug.current`

const getQueryForType = (type) => {
  switch (type) {
    case 'author':
      return AUTHOR_UPDATED_QUERY
    case 'post':
      return POST_UPDATED_QUERY
    default:
      throw new TypeError(`Unknown type: ${type}`)
  }
}

const log = (msg, error) =>
  console[error ? 'error' : 'log'](`[revalidate] ${msg}`)

export default async function revalidate(req, res) {
  if (!isValidRequest(req, process.env.SANITY_STUDIO_REVALIDATE_SECRET)) {
    const invalidRequest = 'Invalid request'
    log(invalidRequest, true)
    return res.status(401).json({ message: invalidRequest })
  }

  const { _id: id, _type } = req.body
  if (typeof id !== 'string' || !id) {
    const invalidId = 'Invalid _id'
    log(invalidId, true)
    return res.status(400).json({ message: invalidId })
  }

  log(`Querying post slug for _id '${id}', type '${_type}' ..`)
  const slug = await sanityClient.fetch(getQueryForType(_type), { id })
  const slugs = (Array.isArray(slug) ? slug : [slug]).map(
    (_slug) => `/posts/${_slug}`
  )
  const staleRoutes = ['/', ...slugs]

  try {
    await Promise.all(
      staleRoutes.map((route) => res.unstable_revalidate(route))
    )
    const updatedRoutes = `Updated routes: ${staleRoutes.join(', ')}`
    log(updatedRoutes)
    return res.status(200).json({ message: updatedRoutes })
  } catch (err) {
    log(err.message, true)
    return res.status(500).json({ message: err.message })
  }
}
