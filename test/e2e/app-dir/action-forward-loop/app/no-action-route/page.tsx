export default function Page() {
  // Intentionally has no Server Actions. Middleware rewrites
  // `/forward-target-route` here, so a forwarded request whose action belongs
  // to `/forward-target-route` will arrive with workStore.page set to
  // `/no-action-route`, which has no entry in the workers manifest for that
  // action ID.
  return <p id="no-action-page">no-action-route</p>
}
