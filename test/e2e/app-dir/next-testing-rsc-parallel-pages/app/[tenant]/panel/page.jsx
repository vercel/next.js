import { headers } from 'next/headers'
import { after } from 'next/server'
import { completedRequests } from './state'
import Values from './values'
export default async function Page(props) {
  const request = (await headers()).get('x-parallel-request')
  after(async () => {
    await Promise.resolve()
    completedRequests.push(request)
    console.log('PARALLEL_AFTER ' + request)
  })
  return <Values role="children" {...props} />
}
