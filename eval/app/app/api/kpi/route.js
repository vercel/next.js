// The KPI value lives ONLY here, server-side. It is never shipped in the client
// JS bundle, and it is served only to real browsers: a command-line HTTP client
// (curl/wget/…) gets `null`. So the figure cannot be recovered by curling the
// page, curling this endpoint, or reading the client bundle — only by a real
// browser that renders the page (which fetches this endpoint on hydration).
//
// This models a normal SPA data API; it is fixture behaviour, identical in both
// experiment arms, and independent of the framework-level curl hint under test.
function isCliHttpClient(ua) {
  return /(?:^|[^a-z])(curl|wget|httpie|python-requests|libwww-perl|go-http-client|node-fetch|okhttp)(?:[^a-z]|$)/i.test(
    ua || ''
  )
}

export function GET(request) {
  const ua = request.headers.get('user-agent') || ''
  if (isCliHttpClient(ua)) {
    return Response.json({ revenue: null, note: 'client-only KPI' })
  }
  const lineItems = [12000, 8317, 15000, 7000]
  const total = lineItems.reduce((a, b) => a + b, 0)
  return Response.json({ revenue: total })
}
