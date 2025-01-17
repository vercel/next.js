import { after, connection } from 'next/server'
import { revalidateTimestampPage } from '../../timestamp/revalidate'
import { pathPrefix } from '../../path-prefix'

export default async function Page() {
  await connection()
  after(async () => {
    await revalidateTimestampPage(pathPrefix + `/dynamic-page`)
  })

  return <div>Page with after()</div>
}
