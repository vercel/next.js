import { revalidatePath, revalidateTag, unstable_cacheTag } from 'next/cache'
import { Form } from './form'

async function fetchCachedValue() {
  return fetch('https://next-data-api-endpoint.vercel.app/api/random', {
    next: { tags: ['revalidate-and-use'], revalidate: false },
  }).then((res) => res.text())
}

async function getCachedValue() {
  'use cache'
  unstable_cacheTag('revalidate-and-use')
  return Math.random()
}

export default async function Page() {
  return (
    <Form
      revalidateAction={async (type: 'tag' | 'path') => {
        'use server'

        if (type === 'tag') {
          revalidateTag('revalidate-and-use')
        } else {
          revalidatePath('/revalidate-and-use')
        }

        return Promise.all([getCachedValue(), fetchCachedValue()])
      }}
      initialValues={await Promise.all([getCachedValue(), fetchCachedValue()])}
    />
  )
}
