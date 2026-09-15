import './lib'
import '../shared-app'
import '../shared-page'
import { collectResult } from '../../../collect-result'

export const dynamic = 'force-dynamic'

const getList = __turbopack_collect__({
  namespace: 'my-test',
})

export default async function page() {
  const result = await collectResult(getList)

  return (
    <div>
      <code id="list">{JSON.stringify(result, null, 2)}</code>
    </div>
  )
}
