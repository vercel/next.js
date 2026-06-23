// Server-rendered Pages Router page — `getServerSideProps` forces a `.js`
// server entry, exercises the `pages` route type.
import { sharedHelper } from '../lib/shared'

export default function ServerPage({ len }: { len: number }) {
  return <p data-len={len}>pages-ssr</p>
}

export async function getServerSideProps() {
  return { props: { len: sharedHelper() } }
}
