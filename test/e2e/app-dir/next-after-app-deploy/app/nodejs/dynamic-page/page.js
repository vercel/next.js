import { unstable_after as after } from 'next/server'
import { revalidateTimestampPage } from '../../timestamp/revalidate'
import { pathPrefix } from '../../path-prefix'

export default function Page() {
  after(async () => {
    await revalidateTimestampPage(pathPrefix + `/dynamic-page`)
  })

  return <div>Page with after()</div>
}
