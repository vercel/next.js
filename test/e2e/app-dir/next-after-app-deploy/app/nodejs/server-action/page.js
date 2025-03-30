import { after } from 'next/server'
import { revalidateTimestampPage } from '../../timestamp/revalidate'
import { pathPrefix } from '../../path-prefix'

export default function Page() {
  return (
    <div>
      <form
        action={async () => {
          'use server'
          after(async () => {
            await revalidateTimestampPage(pathPrefix + `/server-action`)
          })
        }}
      >
        <button type="submit">Submit</button>
      </form>
    </div>
  )
}
