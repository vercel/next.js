import { RelativeHrefs } from '../relative-hrefs'

export default function WarningsPage() {
  // Both targets are misuses that warn in development: '/chat/[id]' can't be
  // resolved from here (the param doesn't lie on this route), and catch-all
  // patterns are never supported as targets.
  return (
    <>
      <div id="warnings-page">Warnings</div>
      <RelativeHrefs
        id="warnings-page-hrefs"
        targets={['/chat/[id]', '/docs/[...slug]']}
      />
    </>
  )
}
