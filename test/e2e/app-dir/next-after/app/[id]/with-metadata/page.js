import { unstable_after as after } from 'next/server'
import { persistentLog } from '../../../utils/log'

export function generateMetadata({ params }) {
  after(() => {
    persistentLog({
      source: '[metadata] /[id]/with-metadata',
      value: params.id,
    })
  })
  return {
    title: `With metadata: ${params.id}`,
  }
}

export default function Page() {
  return <div>With metadata</div>
}
