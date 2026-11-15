import { revision } from '../shared'

console.log('lazy-server-hmr-page-1 evaluated')

export default function Page() {
  return <p id="value">1: {revision}</p>
}
