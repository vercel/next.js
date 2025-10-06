import { connection } from 'next/server'
import { unstable_cache as cache } from 'next/cache'

const cachedConnection = cache(async () => connection())

export default async function Page(props) {
  await cachedConnection()
  return (
    <div>
      <section>
        This example uses `connection()` inside `unstable_cache` which should
        cause the build to fail
      </section>
    </div>
  )
}
