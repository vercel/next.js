import { after } from 'next/server'
import { revalidateTimestampPage } from '../../timestamp/revalidate'
import { pathPrefix } from '../../path-prefix'

export default function Page() {
  return (
    <div>
      <form
        action={async () => {
          'use server'

          // This test checks if revalidates issued from `after(promise)` are executed
          // if no `after(callback)` calls occurred.
          // We had a bug where we'd only execute revalidates from `after(promise)` if an `after(callback)` call also happened,
          // because execution of revalidations was only triggered when running callbacks.

          const promise = (async () => {
            // hackily wait for the response to close
            await new Promise((resolve) => setTimeout(resolve, 500))

            console.log('promise: calling revalidatePath')
            await revalidateTimestampPage(pathPrefix + `/server-action-promise`)
          })()

          after(promise)
        }}
      >
        <button type="submit">Submit</button>
      </form>
    </div>
  )
}
