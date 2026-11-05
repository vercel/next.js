import { read } from './effects'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <pre id="effects">{JSON.stringify(read())}</pre>
}
