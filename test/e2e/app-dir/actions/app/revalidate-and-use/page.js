import { revalidatePath, revalidateTag } from 'next/cache'
import { Form } from './form'

async function fetchCachedValue() {
  return fetch('https://next-data-api-endpoint.vercel.app/api/random', {
    next: { tags: ['revalidate-and-use'], revalidate: false },
  }).then((res) => res.text())
}

export default async function Page() {
  return (
    <Form
      revalidateAction={async (type) => {
        'use server'

        if (type === 'tag') {
          revalidateTag('revalidate-and-use')
        } else {
          revalidatePath('/revalidate-and-use')
        }

        return fetchCachedValue()
      }}
      initialValue={await fetchCachedValue()}
    />
  )
}
