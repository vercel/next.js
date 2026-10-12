import { revision } from '../shared'

console.log('lazy-server-hmr-page-2 evaluated')

export default function Page() {
  return <p id="value">2: {revision}</p>
}
