import { connection } from 'next/server'

export const dynamic = 'error'

export default async function Page(props) {
  await connection()
  return (
    <div>
      <section>
        This example uses `connection()` but is configured with `dynamic =
        'error'` which should cause the page to fail to build
      </section>
    </div>
  )
}
