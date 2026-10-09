import './lib'
import { collectResult } from '../../collect-result'

const getList = __turbopack_collect__({
  namespace: 'my-test',
})

export async function GET(_req) {
  return Response.json(await collectResult(getList), { status: 200 })
}
