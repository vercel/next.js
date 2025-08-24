import { after } from 'next/server'
import { cliLog } from '../../../../utils/log'

export async function generateMetadata(props) {
  const params = await props.params
  after(() => {
    cliLog({
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
