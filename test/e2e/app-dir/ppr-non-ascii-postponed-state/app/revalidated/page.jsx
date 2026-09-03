import { cacheTag } from 'next/cache'
import { KeyedBoundary } from '../../components/keyed-boundary'

// A tagged `use cache` entry gives the test something to invalidate, which is
// what forces the CDN to ask the running function for a new cache entry instead
// of serving the one written at build time. That is the only way to reach the
// code that records the state length during revalidation.
//
// Note that this also puts entries in the Resume Data Cache, so the serialized
// state ends with a base64 tail rather than the literal `null` of the other two
// routes. Truncating that tail by a single byte can still inflate, so on this
// route the doctype assertion is the reliable signal, not the resume.
async function CachedAt() {
  'use cache'
  cacheTag('boundary')

  return <span id="cached-at">{new Date().toISOString()}</span>
}

export default function Page() {
  return (
    <>
      <CachedAt />
      <KeyedBoundary label="Doppelgänger" />
    </>
  )
}
