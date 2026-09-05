'use client'

// TODO(offline): before launch, hand-write a sw.js, drop it into public/,
// and call navigator.serviceWorker.register('/sw.js') from here. Service
// workers live outside the bundler — Next.js can't compile them — so the
// worker can't import lib/version.ts; we'll paste the shell version string
// into it and keep the two copies in sync by hand.
export function OfflineReady() {
  return null
}
