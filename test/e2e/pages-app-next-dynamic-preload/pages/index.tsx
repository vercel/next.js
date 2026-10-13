// Shared with `components/lazy`, which `_app` loads with `next/dynamic`: this page has already
// loaded it when `_app`'s dynamic import runs, `/other` hasn't.
import { pageShared } from '../components/page-shared'

export default function Page() {
  return <p id="page">{pageShared('index')}</p>
}
