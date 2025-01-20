import { Foo } from '../../client'

export default async function Page() {
  'use cache'

  return (
    <p>
      <Foo />
    </p>
  )
}
