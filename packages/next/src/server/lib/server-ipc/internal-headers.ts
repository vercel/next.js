// These headers carry routing state between Next.js processes. They must not
// be accepted from, or serialized back to, external clients.
const INTERNAL_HEADERS = new Set([
  'x-middleware-rewrite',
  'x-middleware-redirect',
  'x-middleware-set-cookie',
  'x-middleware-skip',
  'x-middleware-override-headers',
  'x-middleware-next',
  'x-now-route-matches',
  'x-matched-path',
  'x-nextjs-data',
  'x-next-resume-state-length',
  'next-resume',
])

export const isInternalHeader = (header: string) =>
  INTERNAL_HEADERS.has(header.toLowerCase())
