import { isValidSignature, SIGNATURE_HEADER_NAME } from '@sanity/webhook'
import { sanityClient } from '../../lib/sanity.server'

// Next.js will by default parse the body, which can lead to invalid signatures
export const config = {
  api: {
    bodyParser: false,
  },
}

const AUTHOR_UPDATED_QUERY = /* groq */ `
  *[_type == "author" && _id == $id] {
    "slug": *[_type == "post" && references(^._id)].slug.current
  }["slug"][]`
const POST_UPDATED_QUERY = /* groq */ `*[_type == "post" && _id == $id].slug.current`

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

async function readBody(readable) {
  const chunks = []
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default async function revalidate(req, res) {
  const signature = req.headers[SIGNATURE_HEADER_NAME]
  const body = await readBody(req) // Read the body into a string
  if (
    !isValidSignature(
      body,
      signature,
      process.env.SANITY_REVALIDATE_SECRET?.trim()
    )
  ) {
    const invalidSignature = 'Invalid signature'
    log(invalidSignature, true)
    res.status(401).json({ success: false, message: invalidSignature })
    return
  }

  const jsonBody = JSON.parse(body)
  const { _id: id, _type } = jsonBody
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
    await Promise.all(staleRoutes.map((route) => res.revalidate(route)))
    const updatedRoutes = `Updated routes: ${staleRoutes.join(', ')}`
    log(updatedRoutes)
    return res.status(200).json({ message: updatedRoutes })
  } catch (err) {
    log(err.message, true)
    return res.status(500).json({ message: err.message })
  }
}
