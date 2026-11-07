import { revision } from '../shared'

console.log('lazy-server-hmr-page-0 evaluated')

export default function Page() {
  return <p id="value">0: {revision}</p>
}
