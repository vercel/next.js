import { revalidateTag, cacheTag, cacheLife } from 'next/cache'

async function getCachedRandomNumber() {
  'use cache'
  cacheTag('revalidate-tag-form-data-test')
  cacheLife('max')

  return Math.random().toString()
}

export default async function Page() {
  const randomNumber = await getCachedRandomNumber()

  return (
    <div>
      <p id="random">{randomNumber}</p>
      <form>
        <input type="hidden" name="value" value="new" />
        <button
          id="revalidate-tag-with-profile"
          formAction={async (formData: FormData) => {
            'use server'
            void formData.get('value')
            revalidateTag('revalidate-tag-form-data-test', 'max')
          }}
        >
          Revalidate Tag (background)
        </button>
      </form>
    </div>
  )
}
