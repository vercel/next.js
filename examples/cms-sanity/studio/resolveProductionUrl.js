let productionUrl
try {
  productionUrl = new URL(
    process.env.SANITY_STUDIO_PREVIEW_URL || 'http://localhost:3000'
  )
} catch (err) {
  console.error('Invalid productionUrl', err)
}

export default function resolveProductionUrl(document) {
  if (!productionUrl || !document.slug?.current) {
    return false
  }
  const searchParams = new URLSearchParams()
  searchParams.set('secret', process.env.SANITY_STUDIO_PREVIEW_SECRET || '')
  searchParams.set('slug', document.slug.current)
  return `${productionUrl.origin}/api/preview?${searchParams}`
}
