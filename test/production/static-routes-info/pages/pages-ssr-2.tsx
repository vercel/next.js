// Second SSR page so the `pages` route type has a peer for the sharedAvg
// metric. Imports the same shared module as `pages-ssr.tsx` so we get
// observable chunk overlap beyond the standard `_app` / framework chunks.
import { sharedHelper } from '../lib/shared'

export default function ServerPage2({ len }: { len: number }) {
  return <p data-len={len}>pages-ssr-2</p>
}

export async function getServerSideProps() {
  return { props: { len: sharedHelper() } }
}
