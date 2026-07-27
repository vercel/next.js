import { revalidatePath, cacheTag, updateTag } from 'next/cache'
import { Form } from './form'
import { connection } from 'next/server'

async function fetchCachedValue() {
  return fetch('https://next-data-api-endpoint.vercel.app/api/random', {
    next: { tags: ['revalidate-and-use'], revalidate: false },
  }).then((res) => res.text())
}

async function getCachedValue() {
  'use cache'
  cacheTag('revalidate-and-use')
  return Math.random()
}

export default async function Page() {
  // Make the page dynamic, as we don't want to deal with ISR in this scenario.
  await connection()

  return (
    <Form
      revalidateAction={async (type: 'tag' | 'path') => {
        'use server'

        const initialCachedValue = await getCachedValue()

        if (type === 'tag') {
          updateTag('revalidate-and-use')
        } else {
          revalidatePath('/revalidate-and-use')
        }

        return Promise.all([
          initialCachedValue,
          getCachedValue(),
          fetchCachedValue(),
        ])
      }}
      initialValues={await Promise.all([
        getCachedValue(),
        getCachedValue(),
        fetchCachedValue(),
      ])}
    />
  )
}
