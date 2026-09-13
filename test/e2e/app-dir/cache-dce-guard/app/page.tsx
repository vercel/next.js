'use client'

// unstable_cache is allowed in client components (has a client-side fallback).
// Without the DCE guard in cache.js, the bundler would trace into the
// server-side implementation and pull in workAsyncStorage, IncrementalCache, etc.
import { unstable_cache } from 'next/cache'

console.log(typeof unstable_cache)

export default function Page() {
  return <p>hello world</p>
}
